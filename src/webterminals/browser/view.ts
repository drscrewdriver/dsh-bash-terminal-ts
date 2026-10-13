// One terminal occurrence's model: the `TerminalView` shape dsh-better-sidebar's
// bottom terminal tab drives, backed by this plugin's socket instead of the host
// controller's Remote.
//
// The rules the view depends on (read off `TerminalView.tsx`; violating any one
// gives a blank screen or a stream that wedges):
//
// - **A view survives DOM unmount.** `mount()` returns a detach that only ends the
//   *attachment*; the process lives on so a tab switch, a collapsed panel or a
//   reload re-adopts the same shell. Only `close()` ends it.
// - **One un-acknowledged frame at a time.** `state.render` holds the next frame;
//   the view releases it through `acknowledge(revision)` inside xterm's write
//   callback. Publishing the following frame before that ACK loses output for
//   good, so `pump()` is the ONLY writer of `render` and it refuses while a frame
//   is outstanding.
// - **A `snapshot` frame must be REPLAYED** (the view resets + resizes + writes
//   it); an `output` frame is appended. Hence the first frame per attach is always
//   a snapshot of the buffered screen.
// - **`environment` must exist before the view fits** - `fitScreen()` returns early
//   without it, so the emulator would never size itself.
// - **`writable` gates input and resize** (the host serialises one attachment's
//   keystrokes); the view disables stdin when it is false.
//
// Only `missingTerminal` is surfaced as an `issue`: it is the one code the view
// renders a dedicated notice for, and the one where a Retry would be a lie (the
// process is gone). Every other refusal lands in `state.error`, next to which the
// view already offers its retry affordance.

import { BridgeError, closeTerminal, openTerminal, terminalSocketUrl } from "./api";
import type {
  TerminalRenderFrameContent,
  TerminalViewContract,
  TerminalViewState,
  WebTerminalId,
  WebTerminalInfo,
  TerminalEnvironment,
} from "./face";
import { initialViewState } from "./face";
import { Store } from "./store";
import type { UiServerFrame } from "../protocol";

/** The geometry a terminal is allocated with, before the panel has measured. */
const INITIAL_COLS = 80;
const INITIAL_ROWS = 24;

/** The host hooks one view needs from its owning service. */
export interface BridgeViewHooks {
  /** Save the `(session, contentId) -> terminalId` binding (a reload adopts). */
  save(contentId: string, terminalId: WebTerminalId): void;
  /** Drop a binding whose process is gone, so a retry never re-adopts it. */
  forget(contentId: string): void;
}

/** The socket surface this module drives (injectable for specs). */
interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

/** One bridge-backed terminal view. */
export class BridgeTerminalView implements TerminalViewContract {
  /** The client-side occurrence identity (stable; the host id lives in `info`). */
  readonly id: WebTerminalId;
  readonly state: Store<TerminalViewState>;

  private readonly session: string;
  private readonly contentId: string;
  private readonly hooks: BridgeViewHooks;
  private terminalId: WebTerminalId | undefined;
  private socket: SocketLike | undefined;
  private started = false;
  private disposed = false;
  /** Frames waiting for their turn (at most one is ever published). */
  private readonly queue: TerminalRenderFrameContent[] = [];
  private revision = 0;
  private sequence = 0;
  /** Input typed while the socket was still connecting (a keystroke is never dropped). */
  private readonly outbox: string[] = [];
  private inflight: Promise<void> | undefined;

  constructor(sessionId: string, contentId: string, hooks: BridgeViewHooks, terminalId?: WebTerminalId) {
    this.session = sessionId;
    this.contentId = contentId;
    this.hooks = hooks;
    this.terminalId = terminalId;
    this.id = terminalId ?? `bridge-${Math.random().toString(36).slice(2, 10)}`;
    this.state = new Store<TerminalViewState>(initialViewState());
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  /** Attach the DOM lifetime; the detach leaves the shell running. */
  mount = (): (() => void) => {
    if (!this.started) {
      void this.refresh();
    } else if (this.terminalId !== undefined && this.socket === undefined) {
      this.connect();
    }
    return () => {
      // The DOM goes, the process stays: only the attachment is dropped, which is
      // what starts the host's idle grace and lets a remount re-adopt. Input
      // control goes with the socket; the phase stays as it is because nobody reads
      // it while the component is unmounted (a remount runs `connect()`).
      this.closeSocket();
      this.patch({ writable: false });
    };
  };

  /** Start or recover this tab, deduplicated while an attempt is in flight. */
  refresh = async (): Promise<void> => {
    if (this.disposed) return;
    if (this.inflight !== undefined) return this.inflight;
    this.started = true;
    const run = (async (): Promise<void> => {
      this.patch({ phase: "loading", issue: undefined, error: undefined });
      try {
        this.patch({ phase: "creating" });
        // The HOST decides which shell this is (catalog + activation + fallback),
        // so a stale or disabled choice can never launch anything.
        const result = await openTerminal({
          sessionId: this.session,
          terminalId: this.terminalId,
          cols: INITIAL_COLS,
          rows: INITIAL_ROWS,
        });
        const info = result.info as WebTerminalInfo;
        this.terminalId = info.id;
        this.hooks.save(this.contentId, info.id);
        // `environment` lands here, before the emulator mounts: without it the
        // view's fit step never runs and the screen keeps its default size.
        this.patch({ phase: "connecting", environment: result.environment as TerminalEnvironment, info });
        this.openSocket(info.id);
      } catch (error) {
        this.fail(error);
      }
    })();
    this.inflight = run;
    try {
      await run;
    } finally {
      this.inflight = undefined;
    }
  };

  /** Reattach with a fresh screen and regain input control. */
  connect = (): void => {
    if (this.disposed) return;
    if (this.terminalId === undefined) {
      void this.refresh();
      return;
    }
    this.started = true;
    this.patch({ phase: "connecting", issue: undefined, error: undefined });
    this.openSocket(this.terminalId);
  };

  /** End the process AND the client work (the tab's `onClose` path). */
  close = async (): Promise<void> => {
    if (this.disposed) return;
    this.patch({ phase: "closing" });
    this.hooks.forget(this.contentId);
    const id = this.terminalId;
    this.terminalId = undefined;
    this.closeSocket();
    this.disposed = true;
    this.queue.length = 0;
    this.outbox.length = 0;
    this.patch({ phase: "closed", writable: false, render: undefined });
    if (id === undefined) return;
    try {
      await closeTerminal(id);
    } catch (error) {
      // A cleanup that failed leaves a shell the host's reaper still catches;
      // surfacing it as a terminal error would make a closed tab look broken.
      console.warn("[dsh-bash-terminal-ts] terminal close was refused", error);
    }
  };

  /** Stop client work on unload WITHOUT ending the process (the host's rule). */
  dispose = async (): Promise<void> => {
    this.disposed = true;
    this.closeSocket();
    this.queue.length = 0;
    this.outbox.length = 0;
  };

  // ── stream ────────────────────────────────────────────────────────────────

  /** Release the next stream item after the emulator parsed this frame. */
  acknowledge = (revision: number): void => {
    const current = this.state.getSnapshot().render;
    if (current !== undefined && revision >= current.revision) this.patch({ render: undefined });
    this.pump();
  };

  /** Serialize raw input (refused unless this view holds control). */
  write = (data: string): void => {
    if (data === "" || !this.state.getSnapshot().writable) return;
    if (this.socket !== undefined && this.socket.readyState === socketOpen()) {
      // A socket frame is ordered by the transport, so input goes out synchronously:
      // chaining every keystroke through a promise would add a hop per character
      // for a serialisation the wire already guarantees.
      this.send({ t: "input", data });
      return;
    }
    // CONNECTING: hold it, flush on open. A dropped keystroke is worse than a late
    // one, and the socket cannot be gone while `writable` is true.
    this.outbox.push(data);
  };

  /** Resize only from the currently writable view. */
  resize = (cols: number, rows: number): void => {
    if (!this.state.getSnapshot().writable) return;
    this.send({ t: "resize", cols, rows });
  };

  /** This bridge has no rename surface (the tab strip uses the descriptor title). */
  rename = async (): Promise<void> => {};

  // ── internals ─────────────────────────────────────────────────────────────

  /** Open (or replace) the screen socket for one terminal. */
  private openSocket(id: WebTerminalId): void {
    this.closeSocket();
    let socket: SocketLike;
    try {
      socket = new WebSocket(terminalSocketUrl(id).toString()) as unknown as SocketLike;
    } catch (error) {
      this.fail(error);
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      for (const data of this.outbox.splice(0)) this.send({ t: "input", data });
    };
    socket.onmessage = (event: { data: unknown }) => {
      if (this.socket !== socket) return;
      this.onFrame(event.data);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      if (this.disposed) return;
      // The attachment ended, not the process: `connect()` (the view's Retry)
      // re-adopts it. Input control goes with the socket.
      const had = this.state.getSnapshot().info !== undefined;
      this.patch({ writable: false, phase: had ? "disconnected" : "failed", error: had ? undefined : "the terminal socket closed before it answered" });
    };
    socket.onerror = () => {
      // `onclose` always follows and owns the state; nothing to add here.
    };
  }

  /** Close the current socket without touching the process. */
  private closeSocket(): void {
    const socket = this.socket;
    this.socket = undefined;
    if (socket === undefined) return;
    try {
      socket.onclose = null;
      socket.onmessage = null;
      socket.onopen = null;
      socket.onerror = null;
      socket.close();
    } catch {
      // A socket that refuses to close is the browser's problem, not the model's.
    }
    this.outbox.length = 0;
  }

  /** Decode and apply one host frame. */
  private onFrame(raw: unknown): void {
    if (typeof raw !== "string") return;
    let frame: UiServerFrame;
    try {
      frame = JSON.parse(raw) as UiServerFrame;
    } catch {
      return;
    }
    switch (frame.t) {
      case "snapshot": {
        this.patch({ info: frame.info, environment: frame.environment, phase: "connected", writable: true, issue: undefined, error: undefined });
        this.enqueue({ type: "snapshot", sequence: ++this.sequence, screen: frame.screen, info: frame.info });
        return;
      }
      case "data": {
        this.enqueue({ type: "output", sequence: ++this.sequence, data: frame.data });
        return;
      }
      case "exit": {
        this.onExit(frame.info);
        return;
      }
      case "error": {
        this.fail(new BridgeError(frame.code, frame.message));
        return;
      }
      default:
        // `pong` / `resized` carry nothing the model reflects: the emulator already
        // resized itself, and a process that refuses it is a host fact, not an error.
        return;
    }
  }

  /** Announce the end: keep what is queued, hold the screen, drop input control. */
  private onExit(info: WebTerminalInfo): void {
    // The queue is NOT dropped: a shell that ran `ls` and exited still owes the
    // emulator its last write, and losing it is exactly the "blank screen after a
    // short command" bug.
    this.patch({ info, writable: false, phase: "closed" });
  }

  /** Queue one screen frame and try to publish it. */
  private enqueue(frame: TerminalRenderFrameContent): void {
    const last = this.queue[this.queue.length - 1];
    // Coalesce consecutive output: a burst would otherwise mint one ACK round per
    // chunk, and each round costs a full emulator write.
    if (frame.type === "output" && last !== undefined && last.type === "output") {
      (last as { data: string }).data += frame.data;
      return;
    }
    this.queue.push(frame);
    this.pump();
  }

  /** Publish the next frame, but only when nothing is outstanding. */
  private pump(): void {
    if (this.disposed) return;
    if (this.state.getSnapshot().render !== undefined) return;
    const frame = this.queue.shift();
    if (frame === undefined) return;
    this.patch({ render: { revision: ++this.revision, frame } });
  }

  /** Send one client frame, swallowing a transport hiccup (close owns the state). */
  private send(frame: Record<string, unknown>): void {
    const socket = this.socket;
    if (socket === undefined || socket.readyState !== socketOpen()) return;
    try {
      socket.send(JSON.stringify(frame));
    } catch {
      // The matching `onclose` sets `disconnected`, which is the honest state.
    }
  }

  /** Map one failure onto the state the sidebar view renders. */
  private fail(error: unknown): void {
    if (this.disposed) return;
    const code = error instanceof BridgeError ? error.code : "unknown";
    const message = error instanceof Error ? error.message : String(error);
    if (code === "missingTerminal") {
      // The process is gone (a host restart, or a close elsewhere). Forget the
      // binding so the view's "new terminal" path allocates instead of re-adopting
      // an identity that can never come back.
      this.hooks.forget(this.contentId);
      this.terminalId = undefined;
      this.queue.length = 0;
      this.closeSocket();
      this.patch({ phase: "failed", issue: "missingTerminal", info: undefined, writable: false, render: undefined });
      return;
    }
    this.queue.length = 0;
    this.patch({ phase: "failed", writable: false, render: undefined, error: message });
  }

  /** Publish a new state object (never mutate the one React is holding). */
  private patch(partial: Partial<TerminalViewState>): void {
    this.state.set({ ...this.state.getSnapshot(), ...partial });
  }
}

/** `WebSocket.OPEN`, read through the global so a spec can stub the class. */
function socketOpen(): number {
  return (globalThis.WebSocket as unknown as { OPEN: number }).OPEN;
}
