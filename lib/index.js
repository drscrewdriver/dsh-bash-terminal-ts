// dsh-bash-terminal-ts - one shell tool, four Windows terminals.
//
// Registers a model-facing shell tool. The terminal backend (powershell /
// gitbash / msys2 / wsl) is chosen by the USER in the Web UI settings (default
// terminal); the model cannot pick it — the tool always obeys the user's
// choice:
//   - powershell: pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>
//   - gitbash:    Git for Windows bash -lc <cmd>  (POSIX; /d/... paths)
//   - msys2:      MSYS2 bash -lc <cmd>  (POSIX; /c/... paths, full GCC/mingw64 toolchain)
//   - wsl:        wsl [-d <distro>] -e bash -lc <cmd>  (Linux; /mnt/d/... paths)
//
// The tool spawns through the shared ctx.subprocess seam (process-tree
// termination, SIGTERM->grace->SIGKILL, spill files) and registers background
// handles with the generic ctx.jobs registry, mirroring the shipped
// dsh-tool-bash / dsh-tool-pwsh story call-for-call. It deliberately
// does NOT consume the ctx.shell capability seam: the platform's own
// sandboxed PowerShell executor keeps serving the pwsh tool. This tool is
// an additional, user-selected terminal that still honors the DSH sandbox:
// confined modes wrap PowerShell's spawn argv through ctx.sandbox
// (fail-closed), while danger-full-access, Git Bash, MSYS2, and WSL run
// unconfined. Git Bash and MSYS2 are unconfined because the DSH Windows ACL
// restricted-token runner cannot host Cygwin/MSYS2: bash aborts with
// "CreateFileMapping ... Win32 error 5" during startup.
import { lstatSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { mountBrowserTerminals } from "./webterminals/mount.js";
import { ESCALATION_TARGETS, TOOL_ABORTED, approveEscalation, defineTool, escalationHintMarker, clampTimeout, deadline, parseExitStatus, timeoutOf, sandboxDenialMarker, validateEscalationArgs, z, HarnessError } from "./dsh.js";
import { createTerminalRegistry, terminalTool } from "./terminal.js";
import { resolvePayloadBash } from "./payload.js";
/** Stable Cordis plugin name. */
export const name = "bash-terminal";
/** Composition entry id (the `tool-bash-terminal` row the bundle patch declares). */
const ENTRY_ID = "tool-bash-terminal";
/** Services required before the tool can register. */
export const inject = ["tools", "systemPrompt", "shellEnv", "subprocess", "settings", "sandbox", "sandboxPolicy"];
/** The terminal backends this tool exposes, in catalog order. */
export const SHELLS = ["powershell", "gitbash", "msys2", "wsl", "payload"];
/** The backend used when the caller does not name one. */
export const DEFAULT_SHELL = "powershell";
/** Default per-command timeout (ms). */
const DEFAULT_TIMEOUT_MS = 120000;
/** Upper bound a caller's timeoutMs is capped to. */
const MAX_TIMEOUT_MS = 600000;
/** SIGTERM->SIGKILL grace (ms), matching dsh-bash-local's default. */
const DEFAULT_GRACE_MS = 3000;
/** Per-stream in-memory cap before spilling (bytes). */
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
/** Per-stream spill file cap (bytes). */
const DEFAULT_MAX_SPILL_BYTES = 64 * 1024 * 1024;
/** Timeout code stamped on the deadline's TimeoutReason. */
const TIMEOUT_CODE = "SHELL_TIMEOUT";
/** Model-friendly environment overrides (same set dsh-bash-local hardcodes). */
const ENV_OVERRIDES = {
    NO_COLOR: "1",
    TERM: "dumb",
    PAGER: "cat",
    GIT_PAGER: "cat"
};
/** Runtime configuration schema. */
export const Config = z.object({
    defaultShell: z.string().default(DEFAULT_SHELL).volatile(),
    timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS),
    maxTimeoutMs: z.number().default(MAX_TIMEOUT_MS),
    pwshPath: z.string().default(""),
    gitBashPath: z.string().default(""),
    msys2Path: z.string().default(""),
    wslPath: z.string().default(""),
    // `.volatile()` on the new fields: the browser terminal reads them on every
    // allocation, and a flip in the settings page has to take effect without a
    // restart (0.1.7+ hands apply a live ref; older lines re-read the same value).
    bottomTerminal: z.boolean().default(true).volatile(),
    shimOfficialTerminal: z.boolean().default(false).volatile(),
    shellGitBash: z.boolean().default(true).volatile(),
    shellMsys2: z.boolean().default(true).volatile(),
    shellWsl: z.boolean().default(true).volatile(),
    shellPayload: z.boolean().default(false).volatile(),
    wslDistro: z.string().default("").volatile(),
    // Payload gate state is read once per process (paths resolve at startup), so
    // these are deliberately NOT volatile: a flip needs the restart it implies.
    enablePosixPayload: z.boolean().default(false),
    payloadPosixPath: z.string().default("")
});
// ---- executable resolution ------------------------------------------------
function candidateExists(candidate) {
    try {
        const stat = lstatSync(candidate);
        return stat.isFile() || stat.isSymbolicLink();
    }
    catch {
        return false;
    }
}
function resolveFromCandidates(candidates) {
    for (const candidate of candidates) {
        if (candidateExists(candidate))
            return candidate;
    }
    return undefined;
}
/** Well-known PowerShell install locations plus PATH entries, newest first. */
export function candidatePwshPaths(env = process.env) {
    const programFiles = env.ProgramFiles ?? "C:\\Program Files";
    const systemRoot = env.SystemRoot ?? "C:\\Windows";
    const candidates = [join(programFiles, "PowerShell", "7", "pwsh.exe")];
    for (const entry of (env.PATH ?? "").split(";")) {
        const trimmed = entry.trim().replace(/^"|"$/g, "");
        if (trimmed.length === 0)
            continue;
        candidates.push(join(trimmed, "pwsh.exe"));
    }
    candidates.push(join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
    return candidates;
}
/**
 * Git for Windows locations, then PATH bash.exe entries EXCLUDING the
 * System32 launcher (c:\\windows\\system32\\bash.exe is the WSL
 * forwarder, not a Git Bash shell).
 */
export function candidateGitBashPaths(env = process.env) {
    const programFiles = env.ProgramFiles ?? "C:\\Program Files";
    const systemRoot = (env.SystemRoot ?? "C:\\Windows").toLowerCase();
    const localAppData = env.LOCALAPPDATA ?? "";
    const candidates = [
        join(programFiles, "Git", "bin", "bash.exe"),
        join(programFiles, "Git", "usr", "bin", "bash.exe")
    ];
    if (localAppData.length > 0)
        candidates.push(join(localAppData, "Programs", "Git", "bin", "bash.exe"));
    for (const entry of (env.PATH ?? "").split(";")) {
        const trimmed = entry.trim().replace(/^"|"$/g, "");
        if (trimmed.length === 0)
            continue;
        if (trimmed.toLowerCase().includes(systemRoot))
            continue;
        candidates.push(join(trimmed, "bash.exe"));
    }
    return candidates;
}
/**
 * MSYS2 locations, in preference order: the real `bash.exe` under usr\bin
 * first, then bin\bash.exe, and `msys2.exe` dead last.
 *
 * msys2.exe is NOT a usable backend for piped execution: it is the console-
 * allocating Cygwin launcher, so a spawn with piped stdio returns exit 0 with
 * zero bytes on both stdout and stderr (measured on this machine against
 * MSYS2 with bash 5.3.15). Keeping it in the list only as a last-resort
 * fallback preserves the path the config docs reference, but a working
 * bash.exe always wins.
 *
 * MSYS2 uses the same Cygwin/MSYS2 runtime as Git Bash, so it cannot run
 * under the DSH Windows ACL restricted-token sandbox.
 */
export function candidateMsys2Paths(env = process.env) {
    const candidates = [
        "C:\\msys64\\usr\\bin\\bash.exe",
        "C:\\msys64\\bin\\bash.exe"
    ];
    for (const entry of (env.PATH ?? "").split(";")) {
        const trimmed = entry.trim().replace(/^"|"$/g, "");
        if (trimmed.length === 0)
            continue;
        const lower = trimmed.toLowerCase();
        if (lower.includes("msys64") || lower.includes("mingw64")) {
            candidates.push(join(trimmed, "bash.exe"));
        }
    }
    candidates.push("C:\\msys64\\msys2.exe"); // last resort: see the note above
    return candidates;
}
export function defaultWslPath(env = process.env) {
    const systemRoot = env.SystemRoot ?? "C:\\Windows";
    return join(systemRoot, "System32", "wsl.exe");
}
export function resolveAllPaths(config = {}, env = process.env, payloadBash) {
    const pwsh = config.pwshPath && config.pwshPath.trim().length > 0
        ? config.pwshPath
        : resolveFromCandidates(candidatePwshPaths(env));
    const gitbash = config.gitBashPath && config.gitBashPath.trim().length > 0
        ? config.gitBashPath
        : resolveFromCandidates(candidateGitBashPaths(env));
    const msys2 = config.msys2Path && config.msys2Path.trim().length > 0
        ? config.msys2Path
        : resolveFromCandidates(candidateMsys2Paths(env));
    const wsl = config.wslPath && config.wslPath.trim().length > 0
        ? config.wslPath
        : defaultWslPath(env);
    // The payload is its OWN backend (first-class catalog row) - it never
    // silently substitutes for the gitbash slot, so a row labelled "Git Bash"
    // always names a shell the machine actually has.
    return { pwsh, gitbash, msys2, wsl, ...(payloadBash !== undefined ? { payload: payloadBash } : {}) };
}
// ---- argv / env construction ------------------------------------------------
export function buildArgv(shell, command, paths, distro) {
    switch (shell) {
        case "powershell":
            return [paths.pwsh, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command];
        case "gitbash":
            return [paths.gitbash, "-lc", command];
        case "msys2":
            // -lc, not -c: a login shell sources /etc/profile, which is what puts
            // /usr/bin and /mingw64/bin on PATH. With a bare -c, `tr`, `sed`, `gcc`
            // and friends are all "command not found".
            return [paths.msys2, "-lc", command];
        case "payload":
            // Same login-shell rule as msys2/gitbash: the payload is a
            // Git-for-Windows tree and `-lc` is what gives it a usable PATH.
            return [paths.payload, "-lc", command];
        case "wsl": {
            const distroArg = distro !== undefined && distro.trim().length > 0 ? ["-d", distro.trim()] : [];
            return [paths.wsl, ...distroArg, "-e", "bash", "-lc", command];
        }
        default:
            throw new Error(`invalid shell: ${JSON.stringify(shell)} (expected one of ${SHELLS.join(", ")})`);
    }
}
/**
 * Merge the DSH_* environment over the process environment. For WSL, only
 * variables explicitly listed in WSLENV cross the boundary, so every DSH_*
 * key is appended there — and the list is *layered onto* whatever WSLENV the
 * host already had (Windows Terminal exports e.g. `WT_SESSION:WT_PROFILE_ID:`),
 * never rebuilt from scratch: WSLENV is an allow-list, so dropping the
 * inherited entries would silently stop them crossing into WSL.
 *
 * @param inheritedWslenv - the ambient WSLENV to layer onto. Callers that
 *   replace the child environment wholesale (the PTY path) must pass
 *   `process.env.WSLENV` explicitly, because the ambient value is not visible
 *   through `dshEnv`.
 */
export function buildEnv(shell, dshEnv, inheritedWslenv = process.env.WSLENV) {
    const env = { ...ENV_OVERRIDES, ...dshEnv };
    if (shell === "msys2") {
        // Picks the MINGW64 environment, so /mingw64/bin (gcc, make, ...) joins
        // PATH via /etc/profile. Without it MSYS2 defaults to the bare MSYS
        // environment. An explicit caller-supplied value wins.
        if (env.MSYSTEM === undefined)
            env.MSYSTEM = "MINGW64";
    }
    if (shell === "wsl") {
        const keys = Object.keys(dshEnv ?? {});
        if (keys.length > 0) {
            // An explicit WSLENV in dshEnv wins over the inherited one; otherwise the
            // inherited value is the base. Either way the base is SPLIT into entries
            // (the host value ends with a trailing ":", so string concatenation would
            // produce a malformed empty entry) and the WSLENV key itself is excluded
            // (it is a key of dshEnv too, and appending it would add a bogus entry).
            const declared = Object.prototype.hasOwnProperty.call(dshEnv ?? {}, "WSLENV");
            const base = declared
                ? env.WSLENV
                : (typeof inheritedWslenv === "string" && inheritedWslenv.length > 0 ? inheritedWslenv : env.WSLENV);
            const parts = typeof base === "string" ? base.split(":") : [];
            env.WSLENV = [...parts, ...keys.filter((k) => k !== "WSLENV").flatMap((k) => k.split(":"))]
                .map((p) => p.trim())
                .filter((p) => p.length > 0)
                .join(":");
        }
    }
    return env;
}
function spawnSpec(resolved, argv, env, signal) {
    const collect = (maxBytes) => ({ maxBytes, spill: { maxBytes: DEFAULT_MAX_SPILL_BYTES } });
    return {
        argv,
        cwd: resolved.workdir,
        stdio: {
            stdin: resolved.stdin !== undefined ? { data: resolved.stdin } : "ignore",
            stdout: collect(resolved.stdoutMaxBytes),
            stderr: collect(DEFAULT_MAX_OUTPUT_BYTES)
        },
        graceMs: DEFAULT_GRACE_MS,
        signal,
        env
    };
}
function collectedOutput(handle) {
    const { stdout, stderr } = handle.collected;
    if (!isCollectedStream(stdout) || !isCollectedStream(stderr)) {
        throw new Error("dsh-bash-terminal-ts: subprocess implementation dropped a requested collect stream");
    }
    return { stdout, stderr };
}
function isCollectedStream(value) {
    return typeof value === "object" && value !== null && typeof value.readFrom === "function";
}
function finalOutput(reader) {
    const read = reader.readFrom(0);
    return {
        text: read.text,
        truncated: read.lossy,
        ...(read.spillPath !== undefined ? { spillPath: read.spillPath } : {})
    };
}
async function runForeground(ctx, argv, resolved, env, signal, timeoutMs) {
    const subprocess = requireSubprocess(ctx);
    const d = deadline(signal, timeoutMs, TIMEOUT_CODE);
    try {
        const handle = subprocess.spawn(spawnSpec(resolved, argv, env, d.signal));
        const outcome = await handle.done;
        const collected = collectedOutput(handle);
        const timedOut = timeoutOf(d.signal, TIMEOUT_CODE) !== undefined;
        const aborted = d.signal.aborted && !timedOut;
        return {
            exitCode: outcome.exitCode,
            signal: outcome.signal,
            timedOut,
            aborted,
            timeoutMs,
            stdout: finalOutput(collected.stdout),
            stderr: finalOutput(collected.stderr)
        };
    }
    finally {
        d[Symbol.dispose]();
    }
}
function requireSubprocess(ctx) {
    const subprocess = ctx.subprocess;
    if (subprocess === null) {
        throw new Error("dsh-bash-terminal-ts: ctx.subprocess seam unavailable (missing inject service)");
    }
    return subprocess;
}
function startBackground(ctx, argv, resolved, env, signal) {
    const subprocess = requireSubprocess(ctx);
    const running = subprocess.spawn(spawnSpec(resolved, argv, env, signal));
    const collected = collectedOutput(running);
    let stdoutOffset = 0;
    let stderrOffset = 0;
    let spawnFailureNote;
    const consumeSpawnFailure = () => {
        const note = spawnFailureNote ?? "";
        spawnFailureNote = undefined;
        return note;
    };
    const proc = {
        status: "running",
        exitCode: null,
        signal: null,
        done: running.done.then((outcome) => {
            if (proc.status === "running") {
                proc.status = signal?.aborted === true || outcome.signal !== null ? "killed" : "completed";
            }
            proc.exitCode = outcome.exitCode;
            proc.signal = outcome.signal;
        }, (error) => {
            proc.status = "killed";
            spawnFailureNote = `spawn failed: ${String(error)}`;
        }),
        readOutput: () => {
            const out = collected.stdout.readFrom(stdoutOffset);
            const err = collected.stderr.readFrom(stderrOffset);
            stdoutOffset = out.nextOffset;
            stderrOffset = err.nextOffset;
            const errText = err.text.length > 0 ? err.text : consumeSpawnFailure();
            const separator = out.text.length > 0 && !out.text.endsWith("\n") ? "\n" : "";
            return {
                delta: out.text + (errText.length > 0 ? `${separator}[stderr]\n${errText}` : ""),
                lossy: out.lossy || err.lossy,
                ...(out.spillPath !== undefined ? { stdoutSpillPath: out.spillPath } : {}),
                ...(err.spillPath !== undefined ? { stderrSpillPath: err.spillPath } : {})
            };
        },
        kill: () => {
            if (proc.status !== "running")
                return false;
            proc.status = "killed";
            running.terminate();
            return true;
        }
    };
    return proc;
}
function processOutcome(proc) {
    if (proc.status === "killed") {
        return { status: "killed", detail: proc.signal !== null ? `signal: ${proc.signal}` : "killed before exit" };
    }
    return { status: "completed", detail: `exit code: ${proc.exitCode ?? 0}` };
}
// ---- model-facing rendering ---------------------------------------------------
function streamText(output) {
    if (!output.truncated)
        return output.text;
    return `${output.text}\n[output truncated; full output: ${output.spillPath ?? "(unavailable)"}]`;
}
export function renderResult(result) {
    const out = streamText(result.stdout);
    const err = streamText(result.stderr);
    let body = out;
    if (err.length > 0) {
        if (body.length > 0 && !body.endsWith("\n"))
            body += "\n";
        body += `[stderr]\n${err}`;
    }
    if (body.length === 0)
        body = "(no output)";
    const markers = [];
    if (result.timedOut)
        markers.push(`[timed out after ${result.timeoutMs}ms]`);
    if (result.signal !== null)
        markers.push(`[killed by signal: ${result.signal}]`);
    else if (result.exitCode !== 0)
        markers.push(`[exit code: ${result.exitCode}]`);
    if (markers.length === 0)
        return body;
    if (!body.endsWith("\n"))
        body += "\n";
    return body + markers.join("\n");
}
function renderProcessRead(read) {
    const notices = [];
    if (read.lossy) {
        const paths = [read.stdoutSpillPath, read.stderrSpillPath].filter((p) => p !== undefined);
        notices.push(`[some output was dropped from memory; full output: ${paths.length > 0 ? paths.join(", ") : "(unavailable)"}]`);
    }
    if (notices.length === 0)
        return read.delta;
    return `${read.delta}${read.delta.length > 0 && !read.delta.endsWith("\n") ? "\n" : ""}${notices.join("\n")}`;
}
// ---- tool description / validation --------------------------------------------
/** Model-facing lead sentence for each backend. The user's default terminal is
 * stated up front so the model never has to guess which syntax applies. */
export const SHELL_DESCRIPTIONS = {
    powershell: "Execute a PowerShell command (pwsh -NoLogo -NoProfile -NonInteractive -Command <command>) and return its stdout/stderr. PowerShell syntax; native Windows paths (C:\\...); environment variables via $env:NAME.",
    gitbash: "Execute a bash command (Git for Windows bash -lc <command>) and return its stdout/stderr. POSIX syntax; paths like /d/WorkSpace; PATH includes /usr/bin and /mingw64/bin so git, npm, ssh etc. work; environment variables via $NAME.",
    msys2: "Execute a bash command (MSYS2 bash -lc <command>) and return its stdout/stderr. POSIX syntax; paths like /c/...; PATH includes /usr/bin and /mingw64/bin so git, npm, gcc, make etc. work; environment variables via $NAME. MSYS2 provides a full GCC/mingw64 toolchain.",
    wsl: "Execute a Linux bash command (wsl [-d <distro>] -e bash -lc <command>) and return its stdout/stderr. Linux syntax; Windows files under /mnt/d/...; environment variables via $NAME.",
    payload: "Execute a bash command in the plugin's pinned POSIX runtime payload (a digest-verified Git-for-Windows bash -lc <command>) and return its stdout/stderr. POSIX syntax; paths like /c/...; PATH includes /usr/bin so git, npm, ssh etc. work; environment variables via $NAME. Use it only when the user has deliberately enabled the payload backend."
};
/**
 * Render the model-facing tool description for one backend. The backend is
 * whatever the user chose in Settings -> General -> Default terminal; the
 * description names it explicitly so the model writes the right syntax.
 * @param backgroundEnabled - advertise `run_in_background` controls.
 * @param shell - active backend; unknown values fall back to the default.
 */
export function toolDescription(backgroundEnabled, shell = DEFAULT_SHELL) {
    const active = SHELLS.includes(shell) ? shell : DEFAULT_SHELL;
    const lead = SHELL_DESCRIPTIONS[active];
    const base = [
        `The user's chosen default terminal (Settings -> General -> Default terminal) is ${active}; commands run there.`,
        lead,
        "Each call spawns a fresh shell: no state (cwd, variables, aliases) persists between calls - pass workdir instead of using cd. Non-zero exits are reported as [exit code: N] markers; investigate failures before moving on. Long output is truncated to its tail; the full output is saved to a file whose path is reported when available. Commands run under the DSH sandbox: confined modes (read-only / workspace-write) are enforced through ctx.sandbox and deny fail-closed for PowerShell; danger-full-access, Git Bash, MSYS2, the pinned POSIX payload, and WSL run unconfined."
    ].join(" ");
    if (!backgroundEnabled)
        return base;
    return base + " Set run_in_background: true for long-running commands: the call returns a job id immediately; read its output with job_output and stop it with job_kill. No timeout applies to background runs.";
}
export function validateArgs(args) {
    if (typeof args.command !== "string" || args.command.trim().length === 0) {
        throw new Error("invalid command: expected a non-empty string");
    }
    if (typeof args.description !== "string" || args.description.trim().length === 0) {
        throw new Error("invalid description: expected a non-empty string");
    }
    if (args.timeoutMs !== undefined && (typeof args.timeoutMs !== "number" || !Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0)) {
        throw new Error(`invalid timeoutMs: expected a positive number, got ${JSON.stringify(args.timeoutMs)}`);
    }
    validateEscalationArgs(args.sandbox_permissions, args.justification);
    return args;
}
/**
 * Official sandbox seam (mirrors dsh-tool-bash / dsh-pwsh-sandbox): resolve the
 * per-call policy from ctx.sandboxPolicy, and — unless the call runs
 * danger-full-access — confine the spawn argv through ctx.sandbox. WSL is a
 * self-contained Linux VM and is not confined (its isolation IS the sandbox).
 * Git Bash and MSYS2 are also not confined: DSH's Windows ACL restricted-token
 * runner cannot start Cygwin/MSYS2 (CreateFileMapping Win32 error 5), so
 * attempting to wrap them would abort every Git Bash / MSYS2 command. A
 * requested confined mode
 * with no usable backend throws the fail-closed SandboxUnavailableError,
 * exactly like the shipped executors.
 */
function confineSpawn(ctx, argv, policy, shell) {
    if (policy.mode === "danger-full-access" || shell === "wsl" || shell === "gitbash" || shell === "msys2" || shell === "payload") {
        const sandbox = shell === "wsl"
            ? { mode: policy.mode, enforcement: "wsl-isolation" }
            : shell === "gitbash"
                ? { mode: policy.mode, enforcement: "gitbash-unconfined" }
                : shell === "msys2"
                    ? { mode: policy.mode, enforcement: "msys2-unconfined" }
                    : shell === "payload"
                        // The payload cannot be confined either (same Cygwin/MSYS runtime
                        // constraint as Git Bash) - its safety layer is the digest gate.
                        ? { mode: policy.mode, enforcement: "payload-unconfined" }
                        : undefined;
        return { argv, sandbox };
    }
    const confined = ctx.sandbox.confine(argv, policy);
    return {
        argv: confined.argv,
        sandbox: { mode: policy.mode, enforcement: confined.enforcement, denialSignatures: confined.denialSignatures }
    };
}
function resolveWorkdir(modelWorkdir, exec) {
    const headerCwd = exec.agent?.session.header.cwd;
    if (modelWorkdir === undefined)
        return headerCwd;
    if (headerCwd !== undefined && !isAbsolute(modelWorkdir))
        return resolve(headerCwd, modelWorkdir);
    return modelWorkdir;
}
function canonicalResult(result) {
    const output = (stream) => ({
        text: stream.text,
        truncated: stream.truncated,
        ...(stream.spillPath !== undefined ? { spillPath: stream.spillPath } : {})
    });
    return {
        kind: "foreground",
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        aborted: result.aborted,
        timeoutMs: result.timeoutMs,
        stdout: output(result.stdout),
        stderr: output(result.stderr),
        ...(result.sandbox !== undefined ? { sandbox: result.sandbox } : {})
    };
}
const BACKGROUND_OUTPUT_PROPERTIES = {
    kind: { type: "string", required: true, const: "background" },
    jobId: { type: "string", required: true }
};
/**
 * Persist one config path through the host settings service.
 *
 * Shared by the model tool's `defaultShell` write and the browser terminal's
 * activation switches, because the line-dependent part is the whole difficulty:
 * ≤0.1.6 loaders do not register a plugin's settings namespace automatically, so
 * the first `mutate` fails with "not registered" and the caller has to register it
 * (with the written value as the base, so the retry sees it) and retry. On rc.1+
 * the namespace is already owned by the loader, that branch never fires, and the
 * plain `mutate` is the whole story.
 * @param svc - the host `settings` service (untyped: shapes differ per line).
 * @param path - the config path inside this plugin's entry (one level today).
 * @throws when the line has no `mutate` at all - the caller reports it, and the
 *  value then applies for this process only.
 */
export async function persistConfigValue(svc, path, value) {
    const service = svc;
    if (typeof service?.mutate !== "function") {
        throw new Error("settings service exposes no mutate on this host line - the value applies for this process only; persist via cordis.patch.yml");
    }
    const ops = [{ op: "set", path: [...path], value }];
    try {
        await service.mutate(ENTRY_ID, ops);
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!/not registered/i.test(message) || typeof service.register !== "function") {
            throw e;
        }
        console.warn(`[dsh-bash-terminal-ts] legacy line: registering settings namespace ${ENTRY_ID}`);
        service.register(ENTRY_ID, Config, { base: { [path.join(".")]: value } });
        await service.mutate(ENTRY_ID, ops);
        console.warn("[dsh-bash-terminal-ts] legacy settings namespace registered");
    }
}
// ---- plugin -------------------------------------------------------------------
export function apply(ctx, config = {}) {
    // Pinned backup POSIX runtime payload: opt-in, its OWN backend slot. A
    // detected WSL distro is an advisory note only (the official menu lists both
    // side by side, so our picker must not be stricter); the digest gate is the
    // only hard no: an unverified payload simply does not run.
    let payloadBash;
    const payloadSuppressed = false;
    if (config.enablePosixPayload === true && process.platform === "win32") {
        const outcome = resolvePayloadBash({ payloadBashPath: config.payloadPosixPath ?? "" });
        if (outcome.engaged)
            payloadBash = outcome.bashPath;
        for (const note of outcome.notes)
            ctx.logger?.warn?.(`dsh-bash-terminal-ts: ${note}`);
    }
    const paths = resolveAllPaths(config, process.env, payloadBash);
    // 0.1.7: `defaultShell` is a `.volatile()` config field — the loader hands
    // `apply` a live ref and the latest value is resolved on every read; there
    // is no settings registration call anymore (removed with the 0.1.7 host).
    // compat-legacy: ≤0.1.6 的宿主没有配置热重载,bridge 写入走这个覆盖值
    // (rc.1+ 上 volatile 与覆盖值同源同写,二者一致)。
    let shellOverride;
    /** The stored value, verbatim - including one that is no longer selectable. */
    const storedShell = () => {
        if (typeof shellOverride === "string" && SHELLS.includes(shellOverride)) {
            return shellOverride;
        }
        const v = config.defaultShell;
        if (typeof v === "string")
            return v;
        const got = typeof v?.get === "function" ? v.get() : undefined;
        return typeof got === "string" ? got : DEFAULT_SHELL;
    };
    let warnedStale = false;
    /**
     * The shell the TOOL will run. Deliberately the stored value, un-sanitised:
     * `buildArgv`/`terminalArgv` throw for anything outside SHELLS, so an
     * out-of-enum choice fails closed at call time rather than quietly running the
     * command in a different shell than the model was told about.
     */
    const currentShell = storedShell;
    /**
     * The activation switches are ONE truth: a switch off hides the backend from
     * the dock AND makes it an invalid shell-tool target (powershell is the
     * floor and always on). A stored defaultShell pointing at a switched-off
     * backend is therefore stale, not executable.
     */
    const switchOn = (shell) => {
        const read = (v, fallback) => typeof v === "object" && v !== null && typeof v.get === "function"
            ? (v.get() ?? fallback)
            : v ?? fallback;
        if (shell === "powershell")
            return true;
        if (shell === "gitbash")
            return read(config.shellGitBash, true);
        if (shell === "msys2")
            return read(config.shellMsys2, true);
        if (shell === "wsl")
            return read(config.shellWsl, true);
        if (shell === "payload")
            return read(config.shellPayload, false);
        return false;
    };
    /**
     * What the model is TOLD. Sanitised, because this one runs on every prompt
     * assembly: an invalid stored value must not break the whole prompt, and naming
     * the floor is honest about what a successful call would use.
     */
    const describedShell = () => {
        const stored = storedShell();
        if (SHELLS.includes(stored) && switchOn(stored))
            return stored;
        if (!warnedStale) {
            warnedStale = true;
            ctx.logger?.warn?.(`dsh-bash-terminal-ts: defaultShell ${JSON.stringify(stored)} is not a selectable/activated backend; shell calls will fail closed and the bottom terminal falls back to ${DEFAULT_SHELL}`);
        }
        return DEFAULT_SHELL;
    };
    // The browser terminal (bottom dock / embedded shell). Mounted BEFORE the
    // win32 return below: the model tool is Windows-only, the terminal is not
    // (finding F1). Its routes report their own availability, so a host without
    // `registerUpgrade` or without any PTY backend shows a reason instead of a
    // dead panel.
    const browserTerminals = mountBrowserTerminals({
        ctx: ctx,
        config: config,
        paths,
        configuredShell: storedShell,
        payloadSuppressed: () => payloadSuppressed,
        persist: async (svc, path, value) => {
            await persistConfigValue(svc, path, value);
            // ≤0.1.6 hosts have no config hot-reload, so mirror a defaultShell write into
            // the same in-process override the legacy bridge uses. Without it, choosing a
            // shell in the bottom-terminal section would only reach the model tool after
            // a restart - the exact divergence the bridge's `shellOverride` exists to kill.
            if (path.length === 1 && path[0] === "defaultShell" && typeof value === "string") {
                shellOverride = value;
            }
        },
    });
    ctx.effect(() => () => browserTerminals.dispose(), "bash-terminal: browser terminal teardown");
    if (process.platform !== "win32") {
        ctx.logger?.info?.("dsh-bash-terminal-ts: only meaningful on win32; skipping tool registration");
        return;
    }
    const backgroundEnabled = true;
    // R5/R6 and finding F8: an invalid stored value used to throw here, which failed
    // the whole entry - the tool, the settings row and the browser terminal all
    // disappeared. The entry now stays mounted, the tool fails closed per call, and
    // the browser terminal substitutes the floor and says so.
    /** Official sandbox-escalation surface (mirrors tool-bash): advertise the
     * escalation modes whenever the deployment confines. */
    const escalationModes = ESCALATION_TARGETS;
    const approveShellEscalation = (mode, justification, exec, standingPolicy) => {
        return approveEscalation({
            requestedMode: mode,
            justification,
            effectiveMode: standingPolicy.mode,
            subject: "command"
        }, {
            approver: ctx.get("approval"),
            agent: exec.agent,
            callId: exec.callId,
            toolName: "shell",
            signal: exec.signal
        });
    };
    ctx.systemPrompt.section({
        name: "tool:bash-terminal",
        order: 105,
        text: "Use the shell tool for terminal commands: it runs in the terminal the user chose in Settings -> General -> Default terminal (PowerShell, Git Bash, MSYS2, or WSL) and honors the DSH sandbox. Prefer it over the pwsh tool for everyday commands; keep the pwsh tool for cases that specifically need the sandboxed PowerShell surface."
    });
    // compat-legacy: 六线统一配置通道(≤0.1.6 无 client-store 模块表,client 走本
    // bridge 读写 defaultShell)。写路径 = settings.mutate;≤0.1.6 的 loader 不会自动
    // 注册命名空间,复用 perm-gate 自门控(not registered → register → 重试);
    // rc.1+ 命名空间由 loader 占用,该分支自然不命中。GET 带回当前值与可选集。
    // 宿主 context 类型未收录 inject/局部服务形状,compat 桥按宽化面调用。
    const compatCtx = ctx;
    if (typeof compatCtx.inject !== "function") {
        // A context without `inject` (a bare mock, or a host that resolves services
        // only synchronously) cannot receive the bridge at all. Skipping it must not
        // take the tool down with it - the tool is what the model calls.
        ctx.logger?.warn?.("dsh-bash-terminal-ts: ctx.inject unavailable - the settings bridge is not mounted (defaultShell reads still work, writes will not)");
    }
    else
        compatCtx.inject(["webServer", "settings"], (svcCtx) => {
            const svc = svcCtx.settings;
            const writeShell = async (value) => {
                // One implementation for every config write (the browser terminal's switches
                // go through the same helper), so the legacy self-registration dance exists
                // in exactly one place.
                await persistConfigValue(svc, ["defaultShell"], value);
                shellOverride = value;
            };
            svcCtx.effect(() => {
                const json = (res, status, body) => {
                    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
                    res.end(JSON.stringify(body));
                };
                const handler = (req, res) => {
                    const addr = req.socket?.remoteAddress ?? "";
                    if (addr !== "127.0.0.1" && addr !== "::1" && addr !== "::ffff:127.0.0.1") {
                        json(res, 403, { ok: false, code: "loopback-only" });
                        return;
                    }
                    if (req.method === "GET") {
                        // 缝内省:compat 验证用——当前线 ctx.subprocess 的真实能力面
                        const seam = ctx;
                        const sp = seam.subprocess;
                        json(res, 200, {
                            ok: true,
                            value: {
                                defaultShell: currentShell(),
                                shells: SHELLS,
                                seam: { spawn: typeof sp?.spawn, spawnTerminal: typeof sp?.spawnTerminal },
                            },
                        });
                        return;
                    }
                    if (req.method !== "POST") {
                        json(res, 405, { ok: false, code: "method-not-allowed" });
                        return;
                    }
                    const chunks = [];
                    let size = 0;
                    req.on("data", (c) => {
                        size += c.length;
                        if (size <= 65536)
                            chunks.push(c);
                    });
                    req.on("end", () => {
                        let body = {};
                        try {
                            body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
                        }
                        catch {
                            json(res, 400, { ok: false, code: "bad-json" });
                            return;
                        }
                        const value = typeof body.defaultShell === "string" ? body.defaultShell : "";
                        if (!SHELLS.includes(value)) {
                            json(res, 400, { ok: false, code: "invalid-shell" });
                            return;
                        }
                        void writeShell(value)
                            .then(() => json(res, 200, { ok: true, value: { defaultShell: value } }))
                            .catch((e) => json(res, 500, { ok: false, code: "write-failed", message: e instanceof Error ? e.message : String(e) }));
                    });
                };
                const registered = [
                    svcCtx.webServer.register({ kind: "exact", path: "/api/bash-terminal/config", handler }),
                ];
                return () => {
                    for (const dispose of registered)
                        dispose();
                };
            }, "bash-terminal: compat config bridge");
        });
    const toolName = "shell";
    const terminalRegistry = createTerminalRegistry(ctx);
    // The interactive terminal obeys the SAME activation gate as the shell tool:
    // the getter throws for a switched-off backend, so a session cannot open on
    // a shell the user just disabled.
    ctx.tools.register(terminalTool(ctx, terminalRegistry, paths, () => {
        const shell = currentShell();
        if (SHELLS.includes(shell) && !switchOn(shell)) {
            throw new Error(`dsh-bash-terminal-ts: ${shell} backend is not activated - enable its switch in the plugin settings first.`);
        }
        return shell;
    }));
    // The model-facing description must track the user's chosen default
    // terminal: a static description listing every backend leaves the model
    // guessing which syntax applies. Re-render it on every prompt assembly —
    // settings are hot-reloaded, so a change shows up on the next request
    // without a restart.
    ctx.on("system-prompt/assemble", async (_assembly, _context, next) => {
        const assembled = await next();
        const description = toolDescription(backgroundEnabled, describedShell());
        const tools = Array.isArray(assembled.tools)
            ? assembled.tools.map((tool) => (tool.name === toolName ? { ...tool, description } : tool))
            : assembled.tools;
        return { ...assembled, tools };
    });
    ctx.tools.register(defineTool({
        name: toolName,
        description: toolDescription(backgroundEnabled, currentShell()),
        parameters: {
            command: {
                type: "string",
                required: true,
                description: "The command to execute in the selected terminal."
            },
            description: {
                type: "string",
                required: true,
                description: "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" -> \"List files in current directory\"; \"git status\" -> \"Show working tree status\"; \"npm install\" -> \"Install package dependencies\"."
            },
            distro: {
                type: "string",
                description: "WSL distribution to use (only when the configured default terminal is wsl). Defaults to the system default distribution."
            },
            sandbox_permissions: {
                type: "string",
                enum: escalationModes,
                description: "The wider sandbox mode this command needs. Only valid as a one-shot retry of a command the sandbox just denied; requires justification and user approval."
            },
            justification: {
                type: "string",
                description: "Required with sandbox_permissions: one sentence for the user explaining why this exact command needs the wider access."
            },
            workdir: {
                type: "string",
                description: "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
            },
            timeoutMs: {
                type: "number",
                description: "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
            },
            run_in_background: {
                type: "boolean",
                description: "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
            }
        },
        output: {
            schema: {
                oneOf: [
                    { type: "object", additionalProperties: false, properties: BACKGROUND_OUTPUT_PROPERTIES },
                    {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            kind: { type: "string", required: true, const: "foreground" },
                            exitCode: { required: true, oneOf: [{ type: "integer" }, { type: "null" }] },
                            signal: { required: true, oneOf: [{ type: "string" }, { type: "null" }] },
                            timedOut: { type: "boolean", required: true },
                            aborted: { type: "boolean", required: true },
                            timeoutMs: { type: "number", required: true },
                            sandbox: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                    mode: { type: "string", required: true },
                                    enforcement: { type: "string", required: true },
                                    denied: { type: "boolean" }
                                }
                            },
                            stdout: {
                                type: "object",
                                additionalProperties: false,
                                required: true,
                                properties: {
                                    text: { type: "string", required: true },
                                    truncated: { type: "boolean", required: true },
                                    spillPath: { type: "string" }
                                }
                            },
                            stderr: {
                                type: "object",
                                additionalProperties: false,
                                required: true,
                                properties: {
                                    text: { type: "string", required: true },
                                    truncated: { type: "boolean", required: true },
                                    spillPath: { type: "string" }
                                }
                            }
                        }
                    }
                ]
            },
            render: (_args, value) => {
                if (value.kind === "background")
                    return [{ type: "text", text: `started background job ${value.jobId}` }];
                let text = renderResult(value);
                if (value.sandbox?.denied === true) {
                    if (!text.endsWith("\n"))
                        text += "\n";
                    text += sandboxDenialMarker(value.sandbox.mode) + "\n" + escalationHintMarker("command");
                }
                return [{ type: "text", text }];
            }
        },
        async execute(args, exec) {
            const v = validateArgs(args);
            const shell = currentShell();
            if (SHELLS.includes(shell) && !switchOn(shell)) {
                throw new Error(`dsh-bash-terminal-ts: ${shell} backend is not activated - ask the user to enable its switch in the plugin settings (bottom terminal), or choose another default terminal.`);
            }
            const argv0 = buildArgv(shell, v.command, paths, v.distro);
            if (argv0[0] === undefined) {
                throw new Error(`dsh-bash-terminal-ts: ${shell} backend unavailable - executable not found. Install it or set the corresponding *Path config.`);
            }
            // Only element 0 (the resolved executable) can be undefined; guarded above.
            const argv = argv0;
            const workdir = resolveWorkdir(v.workdir, exec);
            const timeoutMs = clampTimeout(v.timeoutMs, config.timeoutMs ?? DEFAULT_TIMEOUT_MS, config.maxTimeoutMs ?? MAX_TIMEOUT_MS, "shell timeoutMs");
            const dshEnv = ctx.shellEnv.collect(exec);
            const env = buildEnv(shell, dshEnv);
            let policy = ctx.sandboxPolicy.resolve(exec.agent ? { session: exec.agent.session } : {});
            if (v.sandbox_permissions !== undefined && v.justification !== undefined) {
                const approvedMode = await approveShellEscalation(v.sandbox_permissions, v.justification, exec, policy);
                policy = { ...policy, mode: approvedMode };
            }
            const { argv: confinedArgv, sandbox } = confineSpawn(ctx, argv, policy, shell);
            const resolved = {
                command: v.command,
                workdir: workdir ?? process.cwd(),
                timeoutMs,
                stdoutMaxBytes: DEFAULT_MAX_OUTPUT_BYTES,
                ...(v.stdin !== undefined ? { stdin: v.stdin } : {})
            };
            if (v.run_in_background === true) {
                const jobs = ctx.get("jobs");
                if (jobs === undefined)
                    throw new Error("background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs");
                if (exec.signal.aborted) {
                    const error = new HarnessError("tool call aborted", TOOL_ABORTED);
                    error.name = "AbortError";
                    throw error;
                }
                return {
                    kind: "background",
                    jobId: jobs.start({
                        kind: `shell/${shell}`,
                        label: v.command,
                        ...(exec.agent ? { owner: exec.agent } : {}),
                        run: () => {
                            const proc = startBackground(ctx, confinedArgv, resolved, env, exec.signal);
                            return {
                                cancel: () => void proc.kill(),
                                done: proc.done.then(() => processOutcome(proc)),
                                readOutput: () => renderProcessRead(proc.readOutput())
                            };
                        }
                    })
                };
            }
            const result = await runForeground(ctx, confinedArgv, resolved, env, exec.signal, timeoutMs);
            if (result.aborted) {
                const error = new HarnessError("tool call aborted", TOOL_ABORTED);
                error.name = "AbortError";
                throw error;
            }
            const denied = sandbox?.denialSignatures !== undefined
                ? sandbox.denialSignatures.some((sig) => result.stderr.text.toLowerCase().includes(sig.toLowerCase()))
                : false;
            return canonicalResult({
                ...result,
                ...(sandbox !== undefined ? { sandbox: { mode: sandbox.mode, enforcement: sandbox.enforcement, denied } } : {})
            });
        },
        presentCall: (args) => {
            if (args.run_in_background === true) {
                return {
                    card: "generic",
                    title: args.command,
                    kind: "execute",
                    rawInput: args.command,
                    content: [{ type: "text", text: args.description }]
                };
            }
            return {
                card: "terminal",
                title: args.command,
                description: args.description,
                ...(args.workdir !== undefined ? { cwd: args.workdir } : {})
            };
        },
        presentResult: (args, result) => {
            const block = result.content.length === 1 ? result.content[0] : undefined;
            if (block === undefined || block.type !== "text")
                return undefined;
            const raw = block.text ?? "";
            if (args.run_in_background === true || result.isError) {
                return { card: "generic", content: [{ type: "text", text: "```console\n" + raw.replace(/\n+$/, "") + "\n```" }] };
            }
            const { body, ...exit } = parseExitStatus(raw);
            return { card: "terminal", output: body, ...exit };
        }
    }));
}
//#region internals for tests
export const internals = {
    candidateExists,
    resolveAllPaths,
    resolveWorkdir,
    renderResult,
    processOutcome,
    startBackground,
    runForeground,
    spawnSpec,
    buildEnv,
    buildArgv,
    validateArgs,
    toolDescription,
    SHELL_DESCRIPTIONS,
    DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    DEFAULT_MAX_OUTPUT_BYTES
};
