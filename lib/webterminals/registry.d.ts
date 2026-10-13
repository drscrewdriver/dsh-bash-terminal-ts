import type { ShellId } from "../shell-id.js";
import type { UiEnvironment, UiShellSpec, UiTerminalInfo } from "./protocol.js";
/** The handle shape this pool drives (the seam's handle plus an optional resize). */
export interface UiPtyHandle {
    readonly pid: number;
    readonly output: NodeJS.ReadableStream;
    readonly done: Promise<{
        exitCode: number | null;
        signal?: string | null;
    }>;
    write(data: string): void | Promise<void>;
    /** Absent on host builds whose seam cannot resize; `resize()` reports false. */
    resize?(cols: number, rows: number): void | Promise<void>;
    signalForeground?(signal: string): void | Promise<unknown>;
    terminate(): void | Promise<void>;
}
/** One allocation request, already validated by the caller. */
export interface UiSpawnSpec {
    readonly argv: readonly string[];
    readonly cwd: string;
    readonly env: Record<string, string | undefined>;
    readonly cols: number;
    readonly rows: number;
}
/** One attached consumer (a socket). */
export interface UiSink {
    onData(data: string): void;
    onExit(info: UiTerminalInfo): void;
}
/** The per-frame input cap; a bigger frame is refused, not truncated. */
export declare const MAX_INPUT_BYTES: number;
export declare const MAX_COLS = 500;
export declare const MAX_ROWS = 200;
interface Managed {
    readonly id: string;
    readonly sessionId: string;
    readonly shellId: ShellId | "cmd";
    readonly shellSpec: UiShellSpec;
    readonly title: string;
    readonly cwd: string;
    readonly createdAt: number;
    cols: number;
    rows: number;
    state: "running" | "exited" | "failed";
    exitCode: number | null;
    error?: string;
    handle: UiPtyHandle;
    /** The replay ring, oldest first; every entry is one already-decoded chunk. */
    ring: string[];
    ringBytes: number;
    readonly sinks: Set<UiSink>;
    pending: string;
    flushTimer?: ReturnType<typeof setTimeout>;
    idleTimer?: ReturnType<typeof setTimeout>;
    announced: boolean;
}
/** The pool's options. */
export interface UiRegistryOptions {
    spawn(spec: UiSpawnSpec): Promise<UiPtyHandle>;
    maxPerSession: number;
    maxTotal: number;
    /** Detached-shell grace before the reaper terminates it; 0 = reap at once. */
    idleGraceMs: number;
    /** Replayed-screen budget per terminal, in bytes. */
    scrollback: number;
    now?(): number;
}
/** A refusal the browser can name (the shim maps these onto its view state). */
export declare class UiTerminalError extends Error {
    readonly code: "terminalLimit" | "missingTerminal" | "inputFull" | "bad-request" | "shellNotActivated" | "spawn-failed" | "disabled";
    readonly status: number;
    constructor(code: "terminalLimit" | "missingTerminal" | "inputFull" | "bad-request" | "shellNotActivated" | "spawn-failed" | "disabled", message: string, status?: number);
}
/** The public info projection of one managed terminal. */
export declare function infoOf(managed: Managed): UiTerminalInfo;
/**
 * The UI terminal table. One instance per plugin activation; `dispose()` ends
 * every process it owns, so disabling the plugin cannot leak shells.
 */
export declare class UiTerminalRegistry {
    private readonly byId;
    private readonly opts;
    constructor(options: UiRegistryOptions);
    /** The limits one session's terminals launch into. */
    environment(cwd: string): UiEnvironment;
    /** How many terminals this registry still holds (an exited one still counts). */
    count(sessionId?: string): number;
    /** The infos of one session, oldest first. */
    list(sessionId: string): UiTerminalInfo[];
    /** Look one terminal up. */
    get(id: string): UiTerminalInfo | undefined;
    /** The buffered screen a late attachment replays ('' before any output). */
    screen(id: string): string;
    /**
     * Allocate a shell, or adopt an existing terminal by identity.
     * @throws UiTerminalError `terminalLimit` when a quota is full,
     *  `missingTerminal` when an adoption target is gone, `spawn-failed` when the
     *  backend refused.
     */
    open(input: {
        sessionId: string;
        cwd: string;
        shellId: ShellId | "cmd";
        shellSpec: UiShellSpec;
        title: string;
        argv: readonly string[];
        env: Record<string, string | undefined>;
        cols: number;
        rows: number;
        terminalId?: string;
    }): Promise<UiTerminalInfo>;
    /** Attach one consumer; the returned detach leaves the process running. */
    attach(id: string, sink: UiSink): () => void;
    /** Write one input frame to the shell. */
    write(id: string, data: string): Promise<void>;
    /** Resize the process; false when the backend cannot (older host builds). */
    resize(id: string, cols: number, rows: number): Promise<boolean>;
    /** Send one signal to the shell's foreground group. */
    signal(id: string, signal: string): Promise<void>;
    /** End the process and drop the entry (the only path that frees a quota slot). */
    close(id: string): Promise<void>;
    /** Close every terminal this registry owns (plugin teardown). */
    dispose(): Promise<void>;
    private mustGet;
    /** Start the output plumbing for one allocated handle. */
    private wire;
    /** Buffer one decoded chunk and forward it while a consumer is attached. */
    private push;
    /** Deliver the coalesced window to every attached consumer. */
    private flush;
    /** Announce the end: tell every consumer, keep the entry (and its screen). */
    private settle;
    /** Arm the reaper: an ended shell nobody is watching is not worth keeping. */
    private scheduleReaper;
    private clearTimers;
    /** Keep the ring inside the byte budget, oldest first. */
    private trim;
}
export {};
