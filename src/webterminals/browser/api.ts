// The browser-side caller of this plugin's host channels.
//
// Three transports, and the split is deliberate:
//
// - `/api/bash-terminal/config` is the **legacy** preference bridge. It predates
//   this feature, answers `GET` with the current shell and `POST {defaultShell}`
//   to write it, and works on all six host lines. Untouched by us, because the
//   model tool and older hosts read it.
// - `/api/bash-terminal/terminals` is the **op** route (catalog, switches,
//   allocate, close, list). It is POST-only and self-describing, so a host without
//   it reports "not mounted" instead of pretending.
// - only the PTY byte stream gets a socket.
//
// Mixing them up is not a harmless refactor: posting `{op:"get"}` at the legacy
// bridge reads `defaultShell: undefined`, fails its enum check and returns
// `invalid-shell` - which is precisely the bug this file had for one revision.
//
// The URL shape comes from `url.ts`, so a reverse-proxy prefix and the `dsh-app:`
// shell both resolve correctly.

import { hostRouteUrl, hostWebSocketUrl } from "./url";

/** The legacy preference bridge (GET reads, POST `{defaultShell}` writes). */
const CONFIG_PATH = "api/bash-terminal/config";

/** The op route for everything the browser terminal owns. */
const TERMINALS_PATH = "api/bash-terminal/terminals";

/** The terminal socket path. */
const WS_PATH = "bash-terminal/ws";

/** One catalog row as the host reports it. */
export interface CatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly path?: string;
  readonly available: boolean;
  readonly reason: "installed" | "not-installed" | "no-distro" | "launcher-only" | "wsl-preferred";
  readonly activated: boolean;
  readonly togglable: boolean;
  readonly argv?: readonly string[];
}

/** What an allocation would actually use, after the fallback chain. */
export interface EffectiveShell {
  readonly id: string;
  readonly fellBack: boolean;
  readonly floor: boolean;
  readonly from?: string;
}

/** The `GET config` payload. */
export interface ConfigSnapshot {
  readonly defaultShell: string;
  readonly shells: readonly string[];
  readonly seam: { readonly spawn: string; readonly spawnTerminal: string };
  readonly catalog?: readonly CatalogEntry[];
  /** What an allocation WOULD use, after the fallback chain. */
  readonly effective?: EffectiveShell;
  readonly unavailable?: string;
  /** The master switch (level 1). Absent only on a host without the op route. */
  readonly enabled?: boolean;
  /**
   * The opt-in to publishing `webTerminals` for the official bottom row. False unless an
   * operator turns it on - publishing it by default collides with the host's own terminal
   * controller and fails that entry.
   */
  readonly shimOfficialTerminal?: boolean;
  /**
   * Whether the host renders a settings page (`"page"`), declares the slots but has no
   * page (`"none"`, i.e. 0.1.0/0.1.1), or has not answered yet (`"unknown"`). The client
   * shows its own floating panel only on `"none"` - everywhere else it would be a third
   * settings surface, and on the oldest lines a registered card is unreachable.
   */
  readonly settingsSurface?: string;
  /** The stored WSL distro, so the settings input can show the real value. */
  readonly wslDistro?: string;
  /** How many terminals the host still holds (an exited one counts until closed). */
  readonly terminals?: number;
  /** True when the host itself provides `webTerminals` and this shim stands down. */
  readonly hostTerminals?: boolean;
}

/** One bridge reply, read structurally: `ok` decides the branch. */
interface MaybeReply {
  ok?: unknown;
  value?: unknown;
  code?: unknown;
  message?: unknown;
}

/** A refused bridge call, carrying the host's machine-readable code. */
export class BridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
  }
}

/** Unwrap one reply envelope. */
function unwrap(reply: MaybeReply): unknown {
  if (reply.ok === true) return reply.value;
  const code = typeof reply.code === "string" ? reply.code : typeof reply.message === "string" ? "failed" : "no-route";
  const message = typeof reply.message === "string" ? reply.message : "the bridge refused the request";
  throw new BridgeError(code, message);
}

/** POST one body to a path and return the unwrapped `value`. */
async function postTo<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = hostRouteUrl(path);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch (error) {
    throw new BridgeError("no-route", `the bridge did not answer (${error instanceof Error ? error.message : String(error)})`);
  }
  let reply: MaybeReply;
  try {
    reply = (await response.json()) as MaybeReply;
  } catch {
    // An HTML 404 (route absent) or an empty 500 body both land here.
    throw new BridgeError("no-route", `the bridge replied with a non-JSON body (HTTP ${response.status})`);
  }
  return unwrap(reply) as T;
}

/** POST one op to the terminal route. */
export function post<T>(body: Record<string, unknown>): Promise<T> {
  return postTo<T>(TERMINALS_PATH, body);
}

/** Read the current config + catalog (`op: get`). */
export function readConfig(): Promise<ConfigSnapshot> {
  return post<ConfigSnapshot>({ op: "get" });
}

/** Flip shell switches (persisted through the host's settings channel). */
export function writeSwitches(switches: Record<string, boolean>, wslDistro?: string): Promise<ConfigSnapshot> {
  return post<ConfigSnapshot>({ op: "switches", switches, ...(wslDistro !== undefined ? { wslDistro } : {}) });
}

/**
 * Choose the default shell, validated against the catalog server-side (R4): a
 * disabled or unavailable choice is refused rather than silently stored.
 */
export function writeDefaultShell(value: string): Promise<ConfigSnapshot> {
  return post<ConfigSnapshot>({ op: "default", defaultShell: value });
}

/**
 * Allocate (or adopt) one terminal.
 * @param shell - omit to let the host apply the activation switches and the
 *  fallback chain; pass a catalog id (Git Bash / MSYS2 / WSL / PowerShell) to pick
 *  that row explicitly. The host validates either way, so a disabled or missing
 *  shell is refused rather than launched.
 */
export function openTerminal(input: { sessionId: string; cwd?: string; shell?: string; terminalId?: string; cols: number; rows: number }): Promise<{ info: unknown; environment: unknown }> {
  return post<{ info: unknown; environment: unknown }>({ op: "terminal.open", ...input });
}

/** End one terminal and free its quota slot. */
export function closeTerminal(id: string): Promise<{ closed: boolean }> {
  return post<{ closed: boolean }>({ op: "terminal.close", id });
}

/** The session's live terminals (the `recover` face). */
export function listTerminals(sessionId: string): Promise<{ terminals: unknown[] }> {
  return post<{ terminals: unknown[] }>({ op: "terminal.list", sessionId });
}

/** The shell picker's view of the catalog (the controller's `launchShells` face). */
export function discoverShellsForPicker(): Promise<{ shells: readonly { path: string; args: readonly string[]; name: string }[]; selected: string | undefined }> {
  return post<{ shells: readonly { path: string; args: readonly string[]; name: string }[]; selected: string | undefined }>({ op: "shells.discover" });
}

/** The socket URL for one terminal. */
export function terminalSocketUrl(id: string): URL {
  const url = hostWebSocketUrl(WS_PATH);
  url.search = new URLSearchParams({ id }).toString();
  return url;
}

/**
 * The legacy bridge's own read (GET), kept for hosts where the terminal route is
 * not mounted but the preference bridge is.
 */
export async function readLegacyConfig(): Promise<ConfigSnapshot | null> {
  try {
    const response = await fetch(hostRouteUrl(CONFIG_PATH).toString(), { method: "GET", credentials: "same-origin" });
    const reply = (await response.json()) as MaybeReply;
    return reply.ok === true ? (reply.value as ConfigSnapshot) : null;
  } catch {
    return null;
  }
}

/**
 * Write the default shell through the legacy bridge, for hosts where the terminal
 * route is not mounted. It does no catalog validation (it predates the feature),
 * so prefer {@link writeDefaultShell} when the op route answers.
 */
export function writeLegacyDefault(value: string): Promise<unknown> {
  return postTo<unknown>(CONFIG_PATH, { defaultShell: value });
}
