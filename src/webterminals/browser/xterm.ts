// The embedded xterm controller for this plugin's OWN bottom-dock tab.
//
// Why a second consumer at all: on a host that ships its terminal controller
// (DSH 0.2.0+ mounts `terminal-controller` + `ui-sidebar-terminal`), the service
// `webTerminals` is the HOST's, so the shim in `bridge.ts` stands down - and the
// official shell menu de-duplicates entries by executable FILE NAME, which means
// Git Bash and MSYS2 (both `bash.exe`) can never both appear there. This tab is the
// path that still gives the user all four shells side by side, because the shell is
// chosen by catalog ROW through our own route, not by a menu that collapses names.
//
// xterm is IMPORTED normally, so it is BUNDLED into this artifact. That is not a
// preference: the client module table only resolves platform seed words, shell-owned
// modules, registered package factories and boot modules, so an external
// `require("@xterm/xterm")` fails at mount with "missed the module table" (measured on a
// live desktop host). dsh-better-sidebar escapes the same limit with its own chunk
// loader; duplicating that machinery for one dependency is not worth it.

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import xtermCss from "@xterm/xterm/css/xterm.css";
import { openTerminal, terminalSocketUrl } from "./api";
import type { CatalogEntry, ConfigSnapshot } from "./api";

/** The slice of xterm's `Terminal` this controller uses. */
interface XtermTerminal {
  open(host: HTMLElement): void;
  write(data: string): void;
  reset(): void;
  resize(cols: number, rows: number): void;
  loadAddon(addon: unknown): void;
  focus(): void;
  dispose(): void;
  onData(cb: (data: string) => void): { dispose(): void };
  onResize?(cb: (size: { cols: number; rows: number }) => void): { dispose(): void };
}

/** The controller's own view of the emulator, narrowed to what it calls. */
type XtermFit = Pick<FitAddon, "fit"> & { proposeDimensions?(): { cols: number; rows: number } | undefined };
/**
 * Install xterm's stylesheet once per document.
 *
 * The CSS arrives as text (the client build maps `.css` to the `text` loader, because
 * esbuild refuses to inject a stylesheet into a CJS bundle) and is mounted as a
 * `<style>` tag on first terminal. Importing it as a plain module would instead make
 * esbuild emit a sidecar `.css` file that no DSH client bundle ever loads - silently
 * unstyled.
 */
function ensureXtermCss(): void {
  if (typeof document === "undefined") return;
  if (document.head.querySelector('style[data-xterm-css]') !== null) return;
  const tag = document.createElement("style");
  tag.dataset.xtermCss = "1";
  tag.textContent = xtermCss;
  document.head.appendChild(tag);
}

/** What the controller reports upward; the React shell only renders it. */
export type EmbeddedPhase = "allocating" | "connecting" | "running" | "exited" | "failed";

/** The callbacks the tab component supplies. */
export interface EmbeddedHooks {
  onPhase?(phase: EmbeddedPhase, detail?: string): void;
  onTitle?(title: string): void;
}

/** One live embedded terminal. */
export class EmbeddedTerminal {
  private term?: XtermTerminal;
  private fit?: XtermFit;
  private socket?: WebSocket;
  private observer?: ResizeObserver;
  private disposed = false;
  /** The host's terminal id; absent until the allocation answers. */
  id = "";

  private constructor(private readonly host: HTMLElement, private readonly hooks: EmbeddedHooks) {}

  /**
   * Mount one terminal into `host` and allocate the shell the caller asked for.
   * @param shell - a catalog id; the host refuses one that is not activated+available.
   * @returns a controller (already disposed on failure) or the reason nothing mounted.
   */
  static async create(host: HTMLElement, sessionId: string, shell: string | undefined, hooks: EmbeddedHooks): Promise<EmbeddedTerminal | { ok: false; message: string }> {
    const controller = new EmbeddedTerminal(host, hooks);
    const failure = controller.build();
    if (failure !== undefined) return failure;
    await controller.allocate(sessionId, shell);
    return controller;
  }

  /** Instantiate the emulator; returns the reason it could not mount. */
  private build(): { ok: false; message: string } | undefined {
    try {
      ensureXtermCss();
      const term = new Terminal({
        cursorBlink: true,
        // The user's own colours are the point of an embedded shell; a fixed dark
        // theme here would fight the host's light mode.
        scrollback: 4000,
      });
      const addon = new FitAddon();
      term.loadAddon(addon);
      term.open(this.host);
      this.term = term;
      this.fit = addon;
      term.onData((data) => this.send({ t: "input", data }));
      term.onResize?.(({ cols, rows }) => this.send({ t: "resize", cols, rows }));
      if (typeof ResizeObserver !== "undefined") {
        this.observer = new ResizeObserver(() => this.fitNow());
        this.observer.observe(this.host);
      } else {
        window.addEventListener("resize", this.fitNow);
      }
      this.hooks.onPhase?.("allocating");
      return undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.hooks.onPhase?.("failed", message);
      return { ok: false, message };
    }
  }

  /** Allocate the shell, then dial the socket that carries its screen. */
  private async allocate(sessionId: string, shell: string | undefined): Promise<void> {
    const size = this.propose();
    try {
      const result = await openTerminal({ sessionId, shell, cols: size.cols, rows: size.rows });
      const info = result.info as { id: string; title: string; state: string };
      this.id = info.id;
      this.hooks.onTitle?.(info.title);
      this.hooks.onPhase?.("connecting");
      this.connect(info.id);
    } catch (error) {
      this.hooks.onPhase?.("failed", error instanceof Error ? error.message : String(error));
    }
  }

  /** Open the screen socket for one allocated terminal. */
  private connect(id: string): void {
    if (this.disposed) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(terminalSocketUrl(id).toString());
    } catch (error) {
      this.hooks.onPhase?.("failed", error instanceof Error ? error.message : String(error));
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.hooks.onPhase?.("running");
      this.fitNow();
      socket.send(JSON.stringify({ t: "resize", ...this.propose() }));
      this.term?.focus();
    };
    socket.onmessage = (event: { data: unknown }) => {
      if (this.socket !== socket || typeof event.data !== "string") return;
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        return;
      }
      const term = this.term;
      if (term === undefined) return;
      switch (frame.t) {
        case "snapshot": {
          // Replay, never append: a snapshot is the whole screen a late attachment
          // has to reconstruct, and appending it would double what is already drawn.
          term.reset();
          term.write(String(frame.screen ?? ""));
          const info = frame.info as { title?: string; state?: string } | undefined;
          if (info?.title !== undefined) this.hooks.onTitle?.(info.title);
          return;
        }
        case "data":
          term.write(String(frame.data ?? ""));
          return;
        case "exit": {
          const info = frame.info as { state?: string; exitCode?: number | null } | undefined;
          this.hooks.onPhase?.("exited", info?.exitCode === null || info?.exitCode === undefined ? undefined : `exit ${info.exitCode}`);
          return;
        }
        case "error":
          this.hooks.onPhase?.("failed", `${String(frame.code ?? "error")}: ${String(frame.message ?? "")}`);
          return;
        default:
          // pong / resized carry nothing the emulator needs.
          return;
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
    };
    socket.onerror = () => {
      /* onclose owns the state */
    };
  }

  /** The size xterm should be, from the host element's box. */
  private propose(): { cols: number; rows: number } {
    const proposed = this.fit?.proposeDimensions?.();
    return { cols: Math.max(20, proposed?.cols ?? 80), rows: Math.max(6, proposed?.rows ?? 24) };
  }

  private readonly fitNow = (): void => {
    try {
      this.fit?.fit();
    } catch {
      // A detached or zero-sized host cannot be fit; the next resize event retries.
    }
  };

  /** Send one client frame; a closed socket is not an error worth surfacing. */
  private send(frame: Record<string, unknown>): void {
    const socket = this.socket;
    if (socket === undefined || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(frame));
    } catch {
      // The matching onclose leaves the tab in a state the component can show.
    }
  }

  /** Re-fit after the host element changes size (the tab expands). */
  refit(): void {
    this.fitNow();
  }

  /** Close the tab: end the process AND release the emulator. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
    this.observer = undefined;
    window.removeEventListener("resize", this.fitNow);
    // The tab closing IS the user's intent to end the shell (the host's own rule),
    // so this sends `close` rather than merely dropping the socket.
    this.send({ t: "close" });
    try {
      this.socket?.close();
    } catch {
      // already closed
    }
    this.socket = undefined;
    this.term?.dispose();
    this.term = undefined;
  }
}

/** The catalog rows a user may pick in the tab's toolbar. */
export function pickableRows(snapshot: ConfigSnapshot | null): CatalogEntry[] {
  if (!Array.isArray(snapshot?.catalog)) return [];
  return snapshot.catalog.filter((row) => row.activated && row.available);
}

/**
 * Which rows deserve a SWITCH (level 2), as opposed to a status badge.
 *
 * A control that cannot change anything is worse than no control: the floor backend
 * has no choice to make, and a shell the machine does not have would accept a click,
 * persist it, and still not appear in the picker. So both get a reason instead.
 * Exported because the settings row renders from here and `renderToString` never runs
 * the effect that fetches the catalog - a DOM assertion could not cover this rule.
 */
export function switchableRows(rows: readonly CatalogEntry[]): CatalogEntry[] {
  return rows.filter((row) => row.togglable && row.available);
}
