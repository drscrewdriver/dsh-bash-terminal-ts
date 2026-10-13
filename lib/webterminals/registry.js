// The browser terminal's process pool: allocation, the replay ring, per-terminal
// attachment fan-out, the idle reaper and the capacity gates.
//
// Why this exists separately from the model-tool registry in `src/terminal.ts`:
// that one buffers output for an agent to read later, names the PTY `dumb`, and
// drops a session as soon as it goes idle. A browser terminal needs the opposite:
// a bounded *screen* it can hand a re-attaching emulator, a shell that survives a
// tab switch or a page reload, and a quota the user can see.
//
// The lifecycle rules deliberately mirror the host terminal controller, because
// that is what the sidebar view documents and what users learned from the
// built-in terminal:
//
// - closing the TAB is the only thing that ends a process;
// - an EXITED terminal still holds its session quota until closed, and its screen
//   stays replayable;
// - a DETACHED terminal keeps running for `idleGraceMs` so a reload re-adopts it;
// - output is buffered into a bounded ring so a late attachment gets a screen.
//
// Nothing here reaches the model: no tool is registered, and the only writers are
// sockets from a loopback peer.
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
/** The per-frame input cap; a bigger frame is refused, not truncated. */
export const MAX_INPUT_BYTES = 64 * 1024;
export const MAX_COLS = 500;
export const MAX_ROWS = 200;
/** Output coalescing window: keeps a chatty shell from one socket frame per byte. */
const FLUSH_MS = 16;
/** Output coalescing byte budget (a big burst flushes early). */
const FLUSH_BYTES = 32 * 1024;
/** A refusal the browser can name (the shim maps these onto its view state). */
export class UiTerminalError extends Error {
    code;
    status;
    constructor(code, message, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = "UiTerminalError";
    }
}
/** The public info projection of one managed terminal. */
export function infoOf(managed) {
    const info = {
        id: managed.id,
        title: managed.title,
        shellId: managed.shellId,
        shell: managed.shellSpec,
        cwd: managed.cwd,
        cols: managed.cols,
        rows: managed.rows,
        state: managed.state,
        exitCode: managed.exitCode,
    };
    return managed.error === undefined ? info : { ...info, error: managed.error };
}
/** A sane 1-based size clamp. */
function clampSize(value, max) {
    if (!Number.isFinite(value))
        return 80;
    return Math.max(1, Math.min(max, Math.floor(value)));
}
/**
 * The UI terminal table. One instance per plugin activation; `dispose()` ends
 * every process it owns, so disabling the plugin cannot leak shells.
 */
export class UiTerminalRegistry {
    byId = new Map();
    opts;
    constructor(options) {
        this.opts = {
            spawn: options.spawn,
            maxPerSession: options.maxPerSession,
            maxTotal: options.maxTotal,
            idleGraceMs: options.idleGraceMs,
            scrollback: options.scrollback,
            now: options.now ?? (() => Date.now()),
        };
    }
    /** The limits one session's terminals launch into. */
    environment(cwd) {
        return { cwd, maxInputBytes: MAX_INPUT_BYTES, maxCols: MAX_COLS, maxRows: MAX_ROWS, scrollback: this.opts.scrollback };
    }
    /** How many terminals this registry still holds (an exited one still counts). */
    count(sessionId) {
        if (sessionId === undefined)
            return this.byId.size;
        let total = 0;
        for (const managed of this.byId.values()) {
            if (managed.sessionId === sessionId)
                total += 1;
        }
        return total;
    }
    /** The infos of one session, oldest first. */
    list(sessionId) {
        return Array.from(this.byId.values())
            .filter((managed) => managed.sessionId === sessionId)
            .sort((a, b) => a.createdAt - b.createdAt)
            .map(infoOf);
    }
    /** Look one terminal up. */
    get(id) {
        const managed = this.byId.get(id);
        return managed === undefined ? undefined : infoOf(managed);
    }
    /** The buffered screen a late attachment replays ('' before any output). */
    screen(id) {
        const managed = this.byId.get(id);
        return managed === undefined ? "" : managed.ring.join("");
    }
    /**
     * Allocate a shell, or adopt an existing terminal by identity.
     * @throws UiTerminalError `terminalLimit` when a quota is full,
     *  `missingTerminal` when an adoption target is gone, `spawn-failed` when the
     *  backend refused.
     */
    async open(input) {
        if (input.terminalId !== undefined && input.terminalId !== "") {
            const found = this.byId.get(input.terminalId);
            if (found === undefined || found.sessionId !== input.sessionId) {
                throw new UiTerminalError("missingTerminal", "no such terminal in this session (it was closed, or the host restarted)", 404);
            }
            return infoOf(found);
        }
        if (this.count(input.sessionId) >= this.opts.maxPerSession) {
            throw new UiTerminalError("terminalLimit", `this session already holds ${this.opts.maxPerSession} terminals; close one first`, 409);
        }
        if (this.byId.size >= this.opts.maxTotal) {
            throw new UiTerminalError("terminalLimit", `${this.opts.maxTotal} terminals is the host-wide limit; close one first`, 409);
        }
        const cols = clampSize(input.cols, MAX_COLS);
        const rows = clampSize(input.rows, MAX_ROWS);
        const managed = {
            id: randomUUID(),
            sessionId: input.sessionId,
            shellId: input.shellId,
            shellSpec: input.shellSpec,
            title: input.title,
            cwd: input.cwd,
            createdAt: this.opts.now(),
            cols,
            rows,
            state: "running",
            exitCode: null,
            // Reserved below before the await; the real handle lands with the spawn.
            handle: undefined,
            ring: [],
            ringBytes: 0,
            sinks: new Set(),
            pending: "",
            announced: false,
        };
        // Reserve the slot BEFORE awaiting the spawn: a slow allocation must not let
        // a second request slip past the quota and end up with two live shells.
        this.byId.set(managed.id, managed);
        try {
            const handle = await this.opts.spawn({ argv: input.argv, cwd: input.cwd, env: input.env, cols, rows });
            managed.handle = handle;
            this.wire(managed, handle);
        }
        catch (error) {
            this.byId.delete(managed.id);
            const message = error instanceof Error ? error.message : String(error);
            throw new UiTerminalError("spawn-failed", `cannot start ${input.title}: ${message}`, 502);
        }
        return infoOf(managed);
    }
    /** Attach one consumer; the returned detach leaves the process running. */
    attach(id, sink) {
        const managed = this.byId.get(id);
        if (managed === undefined)
            return () => { };
        managed.sinks.add(sink);
        if (managed.idleTimer !== undefined) {
            clearTimeout(managed.idleTimer);
            managed.idleTimer = undefined;
        }
        // A terminal that already ended announces once, to the attaching sink only.
        if (managed.state !== "running")
            sink.onExit(infoOf(managed));
        return () => {
            managed.sinks.delete(sink);
            if (managed.sinks.size === 0 && managed.state === "running")
                this.scheduleReaper(managed);
        };
    }
    /** Write one input frame to the shell. */
    async write(id, data) {
        const managed = this.mustGet(id);
        if (managed.state !== "running")
            throw new UiTerminalError("bad-request", "the terminal has already ended", 409);
        if (Buffer.byteLength(data) > MAX_INPUT_BYTES)
            throw new UiTerminalError("inputFull", "input exceeds the per-frame limit", 413);
        await managed.handle.write(data);
    }
    /** Resize the process; false when the backend cannot (older host builds). */
    async resize(id, cols, rows) {
        const managed = this.mustGet(id);
        managed.cols = clampSize(cols, MAX_COLS);
        managed.rows = clampSize(rows, MAX_ROWS);
        if (managed.state !== "running" || managed.handle.resize === undefined)
            return false;
        await managed.handle.resize(managed.cols, managed.rows);
        return true;
    }
    /** Send one signal to the shell's foreground group. */
    async signal(id, signal) {
        const managed = this.mustGet(id);
        if (managed.handle.signalForeground === undefined)
            throw new UiTerminalError("bad-request", "this host cannot signal a terminal", 503);
        await managed.handle.signalForeground(signal);
    }
    /** End the process and drop the entry (the only path that frees a quota slot). */
    async close(id) {
        const managed = this.byId.get(id);
        if (managed === undefined)
            return;
        this.byId.delete(id);
        this.clearTimers(managed);
        managed.sinks.clear();
        try {
            await managed.handle.terminate();
        }
        catch {
            // A process that refuses to die is already off the books; reporting a failed
            // cleanup would only make a closed tab look broken when it is gone anyway.
        }
    }
    /** Close every terminal this registry owns (plugin teardown). */
    async dispose() {
        for (const id of Array.from(this.byId.keys()))
            await this.close(id);
    }
    mustGet(id) {
        const managed = this.byId.get(id);
        if (managed === undefined)
            throw new UiTerminalError("missingTerminal", "no such terminal", 404);
        return managed;
    }
    /** Start the output plumbing for one allocated handle. */
    wire(managed, handle) {
        // A decoder, not `chunk.toString()`: the PTY can split a multi-byte sequence
        // across chunks and the ring must never carry a broken code point.
        const decoder = new StringDecoder("utf8");
        handle.output.on("data", (chunk) => {
            const text = decoder.write(chunk);
            if (text.length > 0)
                this.push(managed, text);
        });
        handle.output.on("error", () => {
            /* the exit path below settles the terminal */
        });
        handle.done.then((outcome) => {
            const tail = decoder.end();
            if (tail.length > 0)
                this.push(managed, tail);
            managed.exitCode = outcome.exitCode;
            managed.state = "exited";
            this.settle(managed);
        }, (error) => {
            managed.state = "failed";
            managed.error = error instanceof Error ? error.message : String(error);
            this.settle(managed);
        });
    }
    /** Buffer one decoded chunk and forward it while a consumer is attached. */
    push(managed, text) {
        managed.ring.push(text);
        managed.ringBytes += text.length;
        this.trim(managed);
        if (managed.sinks.size === 0)
            return;
        managed.pending += text;
        if (managed.pending.length >= FLUSH_BYTES)
            this.flush(managed);
        else if (managed.flushTimer === undefined) {
            managed.flushTimer = setTimeout(() => {
                this.flush(managed);
            }, FLUSH_MS);
        }
    }
    /** Deliver the coalesced window to every attached consumer. */
    flush(managed) {
        if (managed.flushTimer !== undefined) {
            clearTimeout(managed.flushTimer);
            managed.flushTimer = undefined;
        }
        const data = managed.pending;
        managed.pending = "";
        if (data.length === 0)
            return;
        for (const sink of Array.from(managed.sinks))
            sink.onData(data);
    }
    /** Announce the end: tell every consumer, keep the entry (and its screen). */
    settle(managed) {
        if (!managed.announced) {
            managed.announced = true;
            this.flush(managed);
            const info = infoOf(managed);
            for (const sink of Array.from(managed.sinks))
                sink.onExit(info);
        }
        if (managed.idleTimer === undefined)
            this.scheduleReaper(managed);
    }
    /** Arm the reaper: an ended shell nobody is watching is not worth keeping. */
    scheduleReaper(managed) {
        const grace = this.opts.idleGraceMs;
        if (grace <= 0) {
            if (managed.state !== "running")
                void this.close(managed.id);
            return;
        }
        // A running shell waits for a reload; an ended one is dropped sooner.
        const delay = managed.state === "running" ? grace : Math.min(grace, 60_000);
        managed.idleTimer = setTimeout(() => {
            managed.idleTimer = undefined;
            if (managed.sinks.size === 0)
                void this.close(managed.id);
        }, delay);
    }
    clearTimers(managed) {
        if (managed.flushTimer !== undefined)
            clearTimeout(managed.flushTimer);
        if (managed.idleTimer !== undefined)
            clearTimeout(managed.idleTimer);
        managed.flushTimer = undefined;
        managed.idleTimer = undefined;
    }
    /** Keep the ring inside the byte budget, oldest first. */
    trim(managed) {
        const budget = this.opts.scrollback;
        while (managed.ringBytes > budget && managed.ring.length > 0) {
            const oldest = managed.ring[0];
            if (managed.ring.length > 1 || oldest.length <= budget) {
                managed.ring.shift();
                managed.ringBytes -= oldest.length;
                continue;
            }
            // One huge chunk in a one-entry ring: keep its tail, dropping a leading lone
            // surrogate so the replayed text never carries a broken code point.
            const cut = oldest.length - budget;
            const head = oldest.charCodeAt(cut);
            const start = head >= 0xdc00 && head <= 0xdfff ? cut + 1 : cut;
            const kept = oldest.slice(start);
            managed.ring[0] = kept;
            managed.ringBytes = kept.length;
        }
    }
}
