// The structural contract this plugin FULFILS: the `webTerminals` service face
// that dsh-better-sidebar's bottom terminal tab consumes.
//
// Shapes are restated (never imported) for two hard reasons: the client bundle
// may not value-import `@deepseek-ai/*` (purity gate), and the controller package
// is precisely what some deployments do not ship. The sidebar probes the service
// STRUCTURALLY (`typeof service.view === 'function' && close && recover`), so
// member names and call behaviour are the contract - not type identity.
//
// Pinned against `dsh-better-sidebar@0.25.0` (`src/client/terminal-client.ts`,
// issue #774) and `@deepseek-ai/dsh-api-terminal-controller@0.2.0-rc.2`
// (`lib/types/client/{index,model}.d.ts`). If upstream renames a member, the
// sidebar's probe reads our service as ABSENT and its row goes back to disabled -
// a visible degradation, never a crash.

/** A terminal identity, unique per session and host lifetime. */
export type WebTerminalId = string;

/** One launchable shell. */
export interface TerminalShell {
  readonly path: string;
  readonly args: readonly string[];
  readonly name: string;
}

/** Working directory and limits shared by new and restored terminals. */
export interface TerminalEnvironment {
  readonly cwd: string;
  readonly maxInputBytes: number;
  readonly maxCols: number;
  readonly maxRows: number;
  readonly scrollback: number;
}

/** Terminal state; a process exit never creates a replacement shell. */
export interface WebTerminalInfo {
  readonly id: WebTerminalId;
  readonly title: string;
  readonly shell: TerminalShell;
  /** The cwd the shell was allocated with. */
  readonly cwd: string;
  readonly cols: number;
  readonly rows: number;
  readonly state: "running" | "exited" | "failed";
  readonly exitCode: number | null;
  readonly error?: string;
}

/**
 * Every attachment begins with a complete bounded screen, then ordered output; a
 * `state` frame is metadata and never reaches the emulator. This is why the view
 * REPLAYS `screen` (reset + resize + write) instead of appending it.
 */
export type TerminalFrame =
  | { readonly type: "snapshot"; readonly sequence: number; readonly screen: string; readonly info: WebTerminalInfo }
  | { readonly type: "output"; readonly sequence: number; readonly data: string }
  | { readonly type: "state"; readonly info: WebTerminalInfo };

/** The two frame kinds that carry screen content. */
export type TerminalRenderFrameContent = Extract<TerminalFrame, { type: "snapshot" | "output" }>;

/** One screen write awaiting the emulator's callback. */
export interface TerminalRenderFrame {
  readonly revision: number;
  readonly frame: TerminalRenderFrameContent;
}

/** Product error identifiers the terminal UI translates. */
export type TerminalViewIssue = "missingTerminal" | "inputFull" | "attachmentEnded" | "invalidOutput" | "terminalLimit";

/** The observable state of one occurrence. */
export interface TerminalViewState {
  readonly phase: "idle" | "loading" | "creating" | "connecting" | "connected" | "disconnected" | "closing" | "closed" | "failed";
  readonly environment?: TerminalEnvironment | undefined;
  readonly title?: string | undefined;
  readonly info?: WebTerminalInfo | undefined;
  /** Whether this view currently holds input/resize control. */
  readonly writable: boolean;
  /** The next screen frame awaiting {@link TerminalViewContract.acknowledge}. */
  readonly render?: TerminalRenderFrame | undefined;
  readonly error?: string | undefined;
  readonly issue?: TerminalViewIssue | undefined;
}

/** The observable snapshot store face (`SnapshotStore`) as the view reads it. */
export interface SnapshotStore<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

/** One terminal occurrence's model. A view survives DOM unmount. */
export interface TerminalViewContract {
  readonly id: WebTerminalId;
  readonly state: SnapshotStore<TerminalViewState>;
  /** Attach the DOM lifetime; the returned detach leaves the process alive. */
  mount(): () => void;
  /** Start or recover this tab (deduplicated by the service). */
  refresh(): Promise<void>;
  /** Reattach with a fresh screen and regain input control. */
  connect(): void;
  /** Release the next stream item after the emulator parsed this frame. */
  acknowledge(revision: number): void;
  /** Serialize raw input (refused unless writable). */
  write(data: string): void;
  /** Resize only from the currently writable view. */
  resize(cols: number, rows: number): void;
  /** Update the display name (unused by the bottom tab; kept for the face). */
  rename(title: string): Promise<void>;
  /** Terminate the process; the DOM lifetime is irrelevant to it. */
  close(): Promise<void>;
  /** Stop client work on unload WITHOUT closing the process. */
  dispose(): Promise<void>;
}

/** Host-discovered shells plus the remembered choice. */
export interface TerminalLaunchShells {
  readonly shells: readonly TerminalShell[];
  readonly selectedShell: string | undefined;
}

/** A failed background close that can be retried. */
export interface TerminalCloseFailure {
  readonly id: WebTerminalId;
  readonly title: string;
  readonly message: string;
}

/** The service face `ctx.webTerminals` - what the sidebar consumer calls. */
export interface WebTerminalsFace {
  view(sessionId: string, key: string, contentId: string, terminalId?: WebTerminalId, shellPath?: string): TerminalViewContract;
  close(sessionId: string, key: string, contentId: string, terminalId?: WebTerminalId): void;
  recover(sessionId: string): Promise<WebTerminalInfo[]>;
  /** Structural completeness for members the controller also publishes. */
  launchShells?(sessionId: string, signal: AbortSignal): Promise<TerminalLaunchShells>;
  selectShell?(path: string): void;
  retainTabs?(tabs: readonly { sessionId: string; tabId: string; contentId: string }[]): void;
  retryClose?(id: WebTerminalId): void;
  readonly closeFailures?: SnapshotStore<readonly TerminalCloseFailure[]>;
}

/** Whether one value can pass as the service the sidebar is looking for. */
export function looksLikeTerminals(value: unknown): value is WebTerminalsFace {
  if (value === undefined || value === null) return false;
  const face = value as Partial<WebTerminalsFace>;
  return typeof face.view === "function" && typeof face.close === "function" && typeof face.recover === "function";
}

/** The initial state of a view that has never touched the host. */
export function initialViewState(): TerminalViewState {
  return { phase: "idle", writable: false };
}
