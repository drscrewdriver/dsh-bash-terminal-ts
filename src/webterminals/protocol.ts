// The browser terminal's own wire vocabulary (Node-free: both halves compile it).
//
// This is NOT the host controller's protocol - the controller is absent from
// some deployments, which is the whole reason this module exists. The browser
// shim translates these frames into the `TerminalFrame` shape
// dsh-better-sidebar's terminal view expects, so the emulator never sees a
// private format. Keeping one shared module is what stops the two halves from
// drifting apart on a string literal.

import type { ShellId } from "../shell-id.js";

/** Client -> host frames (input side of a terminal socket). */
export type UiClientFrame =
  | { readonly t: "input"; readonly data: string }
  | { readonly t: "resize"; readonly cols: number; readonly rows: number }
  | { readonly t: "signal"; readonly signal: string }
  | { readonly t: "close" }
  | { readonly t: "ping" };

/** Host -> client frames (screen side of a terminal socket). */
export type UiServerFrame =
  /** The buffered screen, then live output follows. Always the first frame. */
  | { readonly t: "snapshot"; readonly screen: string; readonly info: UiTerminalInfo; readonly environment: UiEnvironment }
  | { readonly t: "data"; readonly data: string }
  | { readonly t: "exit"; readonly info: UiTerminalInfo }
  | { readonly t: "resized"; readonly resized: boolean }
  | { readonly t: "pong" }
  | { readonly t: "error"; readonly code: string; readonly message: string };

/** The shell a terminal was allocated with (same shape the host controller uses). */
export interface UiShellSpec {
  readonly path: string;
  readonly args: readonly string[];
  readonly name: string;
}

/** One running (or ended) UI terminal. */
export interface UiTerminalInfo {
  readonly id: string;
  readonly title: string;
  /** Which catalog row this shell came from (display and diagnostics). */
  readonly shellId: ShellId | "cmd";
  /** The launched executable and its argv, so the browser needs no second lookup. */
  readonly shell: UiShellSpec;
  /** The cwd the shell was allocated with; a `cd` inside it does not update this. */
  readonly cwd: string;
  readonly cols: number;
  readonly rows: number;
  readonly state: "running" | "exited" | "failed";
  readonly exitCode: number | null;
  readonly error?: string;
}

/** Per-terminal limits (mirrors the host controller's `TerminalEnvironment`). */
export interface UiEnvironment {
  readonly cwd: string;
  readonly maxInputBytes: number;
  readonly maxCols: number;
  readonly maxRows: number;
  readonly scrollback: number;
}

/** Why the bridge cannot serve a terminal on this deployment. */
export type UiUnavailableReason = "ok" | "no-pty-backend" | "no-websocket-route" | "not-installed";

/** The `GET /api/bash-terminal/config` reply (extended by this feature). */
export interface UiConfigPayload {
  readonly defaultShell: string;
  readonly shells: readonly string[];
  readonly seam: { readonly spawn: string; readonly spawnTerminal: string };
  /** The catalog the settings page renders and the picker offers. */
  readonly catalog?: unknown;
  /** Which shell an allocation WOULD use, after the fallback chain. */
  readonly effective?: { readonly id: string; readonly fellBack: boolean; readonly floor: boolean; readonly from?: string };
  /** Whether the browser shim should take over the host terminal service. */
  readonly hostTerminals?: boolean;
  readonly unavailable?: UiUnavailableReason;
}
