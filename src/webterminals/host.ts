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

import type { ServerResponse } from "node:http";
import type { CatalogFacts, ResolvedDefault, ShellEntry, ShellSwitches } from "../shells.js";
import type { SettingsSurface } from "../settings-surface.js";
import { resolveDefaultShell, uiArgv } from "../shells.js";
import type { ShellId } from "../shell-id.js";
import type { UiTerminalInfo } from "./protocol.js";
import { UiTerminalError } from "./registry.js";
import type { UiTerminalRegistry } from "./registry.js";
import { mountTerminalSocket, type UpgradeCapableServer } from "./ws.js";

/** The JSON route path (POST-only, loopback-gated like the config bridge). */
export const TERMINAL_API_PATH = "/api/bash-terminal/terminals";

/** What the caller must supply; everything fs/session-related stays outside this file. */
export interface UiBridgeDeps {
  /** A live catalog (the caller owns the TTL cache). */
  catalog(): ShellEntry[];
  /** The catalog facts, for the paths the fallback chain still needs. */
  paths(): CatalogFacts["paths"];
  /** The stored default (`''` when the user never chose). */
  configuredShell(): string;
  /** The stored switches, already defaulted against discovery. */
  switches(): ShellSwitches;
  /** The stored WSL distro (`''` = the WSL default), echoed so the input can show it. */
  wslDistro(): string;
  /** The UI environment for one backend (process.env plus its own rules). */
  env(id: ShellId): Record<string, string | undefined>;
  /**
   * The master switch. Off is not "no shells chosen": the child switches are hidden
   * (a switch for something that cannot run is a lie), and no allocation is served.
   */
  enabled(): boolean;
  /**
   * The opt-in that lets this plugin publish the `webTerminals` service for
   * dsh-better-sidebar's OFFICIAL terminal row. Default false: on a host that ships
   * its own terminal controller, the first client to `provide` that name wins and the
   * loser's entry fails - and the controller's provide is unguarded, so an opt-out
   * default would break the first-party terminal (measured on 0.2.0-rc.2).
   */
  shimOfficialTerminal(): boolean;
  /**
   * Whether this host line renders a settings page at all (`src/settings-surface.ts`).
   * The client cannot probe this and must not guess: on 0.1.0/0.1.1 the `settings.*` slot
   * map exists but no page renders it, so a registered card is unreachable - and those are
   * the only lines where the plugin's own floating panel is the way in.
   */
  settingsSurface(): SettingsSurface;
  /** Persist one config path (the caller wires `settings.mutate`). */
  writeConfig(path: readonly string[], value: unknown): Promise<void>;
  /** Allocate a terminal for one session; the host picks the shell. */
  registry: UiTerminalRegistry;
  /** The session's working directory ('' when the host cannot say). */
  cwdFor(sessionId: string): string;
  /** Why the bridge cannot serve a terminal, or 'ok'. */
  unavailableReason(): string;
  /** Loopback gate, shared with the config bridge's rule. */
  isLoopback(request: { socket?: { remoteAddress?: string } }): boolean;
  log?(level: "info" | "warn", message: string): void;
}

/** One JSON request body, read structurally. */
interface RequestBody {
  op?: unknown;
  sessionId?: unknown;
  terminalId?: unknown;
  /** An explicit shell id for this allocation (validated against the catalog). */
  shell?: unknown;
  cols?: unknown;
  rows?: unknown;
  id?: unknown;
  switches?: unknown;
  wslDistro?: unknown;
  defaultShell?: unknown;
  enabled?: unknown;
  shim?: unknown;
}

/** Write one reply in the envelope the config bridge already uses. */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/** Read one bounded JSON body. */
async function readBody(request: {
  on(event: "data", cb: (chunk: Buffer) => void): void;
  on(event: "end", cb: () => void): void;
  on(event: "error", cb: (error: Error) => void): void;
}): Promise<RequestBody> {
  const chunks: Buffer[] = [];
  let size = 0;
  const raw = await new Promise<Buffer>((resolve, reject) => {
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= 65536) chunks.push(chunk);
    });
    request.on("end", () => { resolve(Buffer.concat(chunks)); });
    request.on("error", reject);
  });
  if (raw.length === 0) return {};
  return JSON.parse(raw.toString("utf8")) as RequestBody;
}

/** Coerce a number field with a bound. */
function num(value: unknown, fallback: number, max: number): number {
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
const SWITCH_FIELD: Record<string, string> = { gitbash: "shellGitBash", msys2: "shellMsys2", wsl: "shellWsl", payload: "shellPayload" };

/**
 * Register the terminal routes.
 * @param webServer - the host webserver (may lack upgrade support).
 * @param deps - the wiring above.
 * @returns a disposer, plus the reason when the host cannot carry a socket.
 */
export function registerUiTerminalRoutes(webServer: UpgradeCapableServer | undefined, deps: UiBridgeDeps): { dispose(): void; socket: "mounted" | "no-websocket-route" } {
  const handler = async (request: { method?: string; socket?: { remoteAddress?: string } }, res: ServerResponse): Promise<void> => {
    if (!deps.isLoopback(request)) {
      json(res, 403, { ok: false, code: "loopback-only" });
      return;
    }
    if (request.method !== "POST") {
      json(res, 405, { ok: false, code: "method-not-allowed" });
      return;
    }
    let body: RequestBody;
    try {
      body = await readBody(request as never);
    } catch {
      json(res, 400, { ok: false, code: "bad-json" });
      return;
    }
    try {
      const value = await dispatch(body, deps);
      json(res, 200, { ok: true, value });
    } catch (error) {
      const code = error instanceof UiTerminalError ? error.code : error instanceof Error ? "failed" : "failed";
      json(res, error instanceof UiTerminalError ? error.status : 500, {
        ok: false,
        code,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const disposers: Array<() => void> = [];
  const registered = webServer?.register?.({ kind: "exact", path: TERMINAL_API_PATH, handler: handler as never });
  if (typeof registered === "function") disposers.push(registered);
  const mount = mountTerminalSocket(
    { registry: deps.registry, environmentFor: (cwd) => deps.registry.environment(cwd), isLoopback: (request) => deps.isLoopback(request) },
    webServer,
  );
  if (mount.ok) disposers.push(mount.dispose);
  return {
    socket: mount.ok ? "mounted" : mount.reason,
    dispose: () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch { /* already gone */ }
      }
    },
  };
}

/** One request -> one reply. */
async function dispatch(body: RequestBody, deps: UiBridgeDeps): Promise<unknown> {
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
      if (requested === null || typeof requested !== "object") throw new UiTerminalError("bad-request", "switches must be an object");
      const next = requested as Record<string, unknown>;
      // Persist first, then answer with a rebuilt catalog: a switch that cannot be
      // stored must not look applied in the settings row.
      for (const key of ["gitbash", "msys2", "wsl", "payload"] as const) {
        if (typeof next[key] === "boolean") await deps.writeConfig([SWITCH_FIELD[key]!], next[key]);
      }
      if (typeof body.wslDistro === "string") await deps.writeConfig(["wslDistro"], body.wslDistro);
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
      if (sessionId === "") throw new UiTerminalError("bad-request", "sessionId is required");
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
      const env = deps.env(resolved.id === "cmd" ? "powershell" : (resolved.id as ShellId));
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
      if (id === "") throw new UiTerminalError("bad-request", "id is required");
      await deps.registry.close(id);
      return { closed: true };
    }
    case "terminal.list": {
      const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
      if (sessionId === "") throw new UiTerminalError("bad-request", "sessionId is required");
      return { terminals: deps.registry.list(sessionId) satisfies UiTerminalInfo[] };
    }
    case "shells.discover": {
      const catalog = deps.catalog();
      const shells = catalog
        .filter((entry) => entry.available && entry.path !== undefined)
        .map((entry) => ({ path: entry.path!, args: entry.argv?.slice(1) ?? [], name: entry.label }));
      return { shells, selected: deps.configuredShell() };
    }
    default:
      throw new UiTerminalError("bad-request", `unknown op ${JSON.stringify(body.op)}`, 404);
  }
}

/** The shell an allocation would use, recomputed from the live catalog. */
function effectiveShell(deps: UiBridgeDeps): ResolvedDefault {
  return resolveDefaultShell(deps.catalog(), deps.configuredShell(), deps.paths());
}

/**
 * Allocate one shell and answer in the shape the browser needs.
 *
 * Split out because two ops reach it (the fallback-chain default and an explicit
 * per-tab shell choice) and the reply contract - `{info, environment}`, plus the
 * argv slice that becomes the info's `shell` - must not be spelled twice.
 */
async function openAndReport(input: {
  sessionId: string;
  cwd: string;
  resolved: ResolvedDefault;
  rows: readonly ShellEntry[];
  env: Record<string, string | undefined>;
  body: RequestBody;
  deps: UiBridgeDeps;
}): Promise<unknown> {
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
function labelOf(catalog: readonly ShellEntry[], resolved: ResolvedDefault): string {
  if (resolved.id === "cmd") return "cmd";
  return catalog.find((entry) => entry.id === resolved.id)?.label ?? String(resolved.id);
}
