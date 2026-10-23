// The host half of the browser terminal: one JSON route for the requests and the
// socket mount for the byte stream.
//
// Why a separate route from the existing `/api/bash-terminal/config` bridge: that
// bridge is the model tool's preference channel and works on all six host lines;
// this one serves a feature that must exist even on a line where the tool itself
// is not registered (the browser terminal is not a Windows-only idea - the tool
// is). Keeping them apart means the tool's behaviour cannot regress when the
// terminal ships, and each route can be probed separately in the settings page.
//
// The host, not the browser, decides which shell an allocation uses: it reads the
// catalog (activation + availability) and the fallback chain, so a client can
// never launch a shell the user disabled, and a stale `defaultShell` degrades
// visibly instead of failing.
import { resolveDefaultShell, uiArgv } from "../shells.js";
import { UiTerminalError } from "./registry.js";
import { mountTerminalSocket } from "./ws.js";
/** The JSON route path (POST-only, loopback-gated like the config bridge). */
export const TERMINAL_API_PATH = "/api/bash-terminal/terminals";
/** Write one reply in the envelope the config bridge already uses. */
function json(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
}
/** Read one bounded JSON body. */
async function readBody(request) {
    const chunks = [];
    let size = 0;
    const raw = await new Promise((resolve, reject) => {
        request.on("data", (chunk) => {
            size += chunk.length;
            if (size <= 65536)
                chunks.push(chunk);
        });
        request.on("end", () => { resolve(Buffer.concat(chunks)); });
        request.on("error", reject);
    });
    if (raw.length === 0)
        return {};
    return JSON.parse(raw.toString("utf8"));
}
/** Coerce a number field with a bound. */
function num(value, fallback, max) {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(max, Math.floor(value))) : fallback;
}
/**
 * The config field behind each switch, spelled out rather than derived.
 *
 * A computed name (`"shell" + cap(key)`) produces `shellGitbash` while the schema
 * declares `shellGitBash` - the write would land on a key that does not exist,
 * persist nothing, and look fine in the settings page. Two spellings of one fact
 * always drift, so this table is the single place the name appears.
 */
const SWITCH_FIELD = { gitbash: "shellGitBash", msys2: "shellMsys2", wsl: "shellWsl", payload: "shellPayload" };
/**
 * Register the terminal routes.
 * @param webServer - the host webserver (may lack upgrade support).
 * @param deps - the wiring above.
 * @returns a disposer, plus the reason when the host cannot carry a socket.
 */
export function registerUiTerminalRoutes(webServer, deps) {
    const handler = async (request, res) => {
        if (!deps.isLoopback(request)) {
            json(res, 403, { ok: false, code: "loopback-only" });
            return;
        }
        if (request.method !== "POST") {
            json(res, 405, { ok: false, code: "method-not-allowed" });
            return;
        }
        let body;
        try {
            body = await readBody(request);
        }
        catch {
            json(res, 400, { ok: false, code: "bad-json" });
            return;
        }
        try {
            const value = await dispatch(body, deps);
            json(res, 200, { ok: true, value });
        }
        catch (error) {
            const code = error instanceof UiTerminalError ? error.code : error instanceof Error ? "failed" : "failed";
            json(res, error instanceof UiTerminalError ? error.status : 500, {
                ok: false,
                code,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };
    const disposers = [];
    const registered = webServer?.register?.({ kind: "exact", path: TERMINAL_API_PATH, handler: handler });
    if (typeof registered === "function")
        disposers.push(registered);
    const mount = mountTerminalSocket({ registry: deps.registry, environmentFor: (cwd) => deps.registry.environment(cwd), isLoopback: (request) => deps.isLoopback(request) }, webServer);
    if (mount.ok)
        disposers.push(mount.dispose);
    return {
        socket: mount.ok ? "mounted" : mount.reason,
        dispose: () => {
            for (const dispose of disposers) {
                try {
                    dispose();
                }
                catch { /* already gone */ }
            }
        },
    };
}
/** One request -> one reply. */
async function dispatch(body, deps) {
    const op = typeof body.op === "string" ? body.op : "";
    // Everything below the master switch is gated by it. `switches` is included: an
    // off feature that still accepts child edits would store choices it ignores, and
    // the settings row would show them as applied.
    if (!deps.enabled() && op !== "get" && op !== "enabled") {
        throw new UiTerminalError("disabled", "the bottom terminal is switched off in settings", 409);
    }
    switch (op) {
        case "get": {
            const catalog = deps.catalog();
            return {
                catalog,
                effective: effectiveShell(deps),
                switches: deps.switches(),
                defaultShell: deps.configuredShell(),
                wslDistro: deps.wslDistro(),
                enabled: deps.enabled(),
                shimOfficialTerminal: deps.shimOfficialTerminal(),
                settingsSurface: deps.settingsSurface(),
                // The master switch outranks the capability answers: "off" is the user's
                // choice, and reporting `ok` next to a hidden panel would be the confusing
                // half of the pair.
                unavailable: deps.enabled() ? deps.unavailableReason() : "disabled",
                terminals: deps.registry.count(),
            };
        }
        case "shim": {
            // Written, not inferred: whether the browser may claim the `webTerminals` name is
            // a deployment fact only the operator knows, and the safe default is to not claim
            // it. The client re-reads the service before publishing, so switching this on
            // where a controller already exists cannot silently take the controller down.
            const next = body.shim === true;
            await deps.writeConfig(["shimOfficialTerminal"], next);
            return { shimOfficialTerminal: deps.shimOfficialTerminal(), catalog: deps.catalog() };
        }
        case "enabled": {
            // The master switch itself is always writable - refusing that would be a way
            // to lock the feature off permanently.
            const value = body.enabled === true;
            await deps.writeConfig(["bottomTerminal"], value);
            return { enabled: deps.enabled(), catalog: deps.catalog(), effective: effectiveShell(deps), switches: deps.switches() };
        }
        case "switches": {
            const requested = body.switches;
            if (requested === null || typeof requested !== "object")
                throw new UiTerminalError("bad-request", "switches must be an object");
            const next = requested;
            // Persist first, then answer with a rebuilt catalog: a switch that cannot be
            // stored must not look applied in the settings row.
            for (const key of ["gitbash", "msys2", "wsl", "payload"]) {
                if (typeof next[key] === "boolean")
                    await deps.writeConfig([SWITCH_FIELD[key]], next[key]);
            }
            if (typeof body.wslDistro === "string")
                await deps.writeConfig(["wslDistro"], body.wslDistro);
            return { catalog: deps.catalog(), effective: effectiveShell(deps), switches: deps.switches(), wslDistro: deps.wslDistro(), enabled: deps.enabled() };
        }
        case "default": {
            const value = typeof body.defaultShell === "string" ? body.defaultShell : "";
            const catalog = deps.catalog();
            const row = catalog.find((entry) => entry.id === value);
            if (row === undefined || !row.activated || !row.available) {
                // Its own code, not a generic bad-request: the browser renders "enable that
                // shell first" for this one and "malformed input" for the rest.
                throw new UiTerminalError("shellNotActivated", `shell ${JSON.stringify(value)} is not an activated, available choice`, 400);
            }
            await deps.writeConfig(["defaultShell"], value);
            return { catalog: deps.catalog(), effective: effectiveShell(deps) };
        }
        case "terminal.open": {
            const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
            if (sessionId === "")
                throw new UiTerminalError("bad-request", "sessionId is required");
            const cwd = deps.cwdFor(sessionId);
            // An explicit `shell` is honoured ONLY when that row is activated and
            // available: the same R4 rule the default choice obeys. This is what lets the
            // multi-shell tab offer Git Bash and MSYS2 side by side - the host terminal
            // controller cannot, because its menu de-duplicates shells by executable file
            // name and both are `bash.exe`.
            const asked = typeof body.shell === "string" ? body.shell.trim() : "";
            const rows = deps.catalog();
            let resolved = effectiveShell(deps);
            if (asked !== "") {
                const row = rows.find((entry) => entry.id === asked);
                if (row === undefined || !row.activated || !row.available || row.path === undefined) {
                    throw new UiTerminalError("shellNotActivated", `shell ${JSON.stringify(asked)} is not an activated, available choice`, 400);
                }
                resolved = {
                    id: row.id,
                    path: row.path,
                    argv: row.argv ?? uiArgv(row.id, deps.paths(), ""),
                    fellBack: false,
                    floor: false,
                };
            }
            const env = deps.env(resolved.id === "cmd" ? "powershell" : resolved.id);
            return await openAndReport({
                sessionId,
                cwd,
                resolved,
                rows,
                env,
                body,
                deps,
            });
        }
        case "terminal.close": {
            const id = typeof body.id === "string" ? body.id : "";
            if (id === "")
                throw new UiTerminalError("bad-request", "id is required");
            await deps.registry.close(id);
            return { closed: true };
        }
        case "terminal.list": {
            const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
            if (sessionId === "")
                throw new UiTerminalError("bad-request", "sessionId is required");
            return { terminals: deps.registry.list(sessionId) };
        }
        case "shells.discover": {
            const catalog = deps.catalog();
            const shells = catalog
                .filter((entry) => entry.available && entry.path !== undefined)
                .map((entry) => ({ path: entry.path, args: entry.argv?.slice(1) ?? [], name: entry.label }));
            return { shells, selected: deps.configuredShell() };
        }
        default:
            throw new UiTerminalError("bad-request", `unknown op ${JSON.stringify(body.op)}`, 404);
    }
}
/** The shell an allocation would use, recomputed from the live catalog. */
function effectiveShell(deps) {
    return resolveDefaultShell(deps.catalog(), deps.configuredShell(), deps.paths());
}
/**
 * Allocate one shell and answer in the shape the browser needs.
 *
 * Split out because two ops reach it (the fallback-chain default and an explicit
 * per-tab shell choice) and the reply contract - `{info, environment}`, plus the
 * argv slice that becomes the info's `shell` - must not be spelled twice.
 */
async function openAndReport(input) {
    const { sessionId, cwd, resolved, rows, env, body, deps } = input;
    const info = await deps.registry.open({
        sessionId,
        cwd,
        shellId: resolved.id,
        shellSpec: { path: resolved.path, args: resolved.argv.slice(1), name: labelOf(rows, resolved) },
        title: labelOf(rows, resolved),
        argv: [...resolved.argv],
        env,
        cols: num(body.cols, 80, 500),
        rows: num(body.rows, 24, 200),
        terminalId: typeof body.terminalId === "string" ? body.terminalId : undefined,
    });
    // `environment` travels with the info: the emulator cannot size itself until it
    // has the limits, and asking for them in a second round trip would race the first
    // output frame.
    return { info, environment: deps.registry.environment(cwd) };
}
/** The display name of the resolved shell (the catalog label, else the id). */
function labelOf(catalog, resolved) {
    if (resolved.id === "cmd")
        return "cmd";
    return catalog.find((entry) => entry.id === resolved.id)?.label ?? String(resolved.id);
}
