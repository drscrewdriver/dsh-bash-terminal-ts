// The host-side catalog provider: the filesystem and WSL probes, and the short
// cache the routes read through.
//
// Two decisions worth their comments:
//
// - **The cache lives here, not inside `buildCatalog`.** The catalog builder is a
//   pure function so it can be table-tested without a filesystem; discovery hits
//   disk and spawns `wsl.exe`, so the caller owns the TTL and invalidates it after
//   a switch is written (a settings row that reports a stale answer right after
//   the user changed it is worse than a slow one).
// - **`wsl -l -q` gets a hard timeout.** A WSL service that is starting up can sit
//   on that call for tens of seconds; the settings page must render meanwhile, so
//   an unreachable WSL reports "unknown" rather than blocking the row.

import { statSync } from "node:fs";
import { execFile } from "node:child_process";
import { buildCatalog, uiEnv } from "../shells.js";
import type { CatalogFacts, ShellEntry, ShellSwitches } from "../shells.js";
import type { ResolvedPaths } from "../dsh-types.js";

/** How long one catalog answer is trusted. */
export const CATALOG_TTL_MS = 5000;

/** Is this path a launchable file? */
export function fsProbe(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * The installed WSL distributions (quiet listing, one per line).
 * @returns [] when wsl.exe is absent; undefined when the probe could not answer
 *  (a timeout is NOT "no distro" - reporting it as such would disable a working
 *  backend, which is the all-false-positive trap).
 */
export function listWslDistros(wslPath: string | undefined, timeoutMs = 1500): Promise<readonly string[] | undefined> {
  if (wslPath === undefined) return Promise.resolve([]);
  return new Promise((resolve) => {
    let settled = false;
    const child = execFile(wslPath, ["-l", "-q"], { windowsHide: true, timeout: timeoutMs, encoding: "utf8" }, (error, stdout) => {
      if (settled) return;
      settled = true;
      if (error !== null && error.signal !== undefined) {
        resolve(undefined);
        return;
      }
      // A non-zero exit with text output still means "reachable"; `wsl -l -q`
      // exits 1 on a machine with no distro installed, which is a real answer.
      const distros = String(stdout ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !/^<.+>$/i.test(line));
      resolve(distros);
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      resolve(undefined);
    });
  });
}

/** What the provider reads from the plugin's live config. */
export interface CatalogSource {
  paths(): ResolvedPaths;
  switches(): ShellSwitches;
  wslDistro(): string;
  /** Cached distro list; undefined means "unknown", [] means "none installed". */
  distros(): readonly string[] | undefined;
}

/** The catalog with its TTL, as the routes consume it. */
export interface CatalogProvider {
  /** The current rows (re-probed when the cache aged out). */
  catalog(): ShellEntry[];
  /** Forget the cached answer (call after any switch/path config write). */
  invalidate(): void;
  /** The UI environment for one backend (process.env plus its own rules). */
  env(id: ShellEntry["id"]): Record<string, string | undefined>;
}

/**
 * Build the TTL-backed provider.
 * @param source - live config reads (never a snapshot: settings hot-reload).
 * @param now - injectable clock for specs.
 */
export function createCatalogProvider(source: CatalogSource, now: () => number = Date.now): CatalogProvider {
  let cache: { at: number; rows: ShellEntry[] } | undefined;
  const facts = (): CatalogFacts => ({
    paths: source.paths(),
    fsProbe,
    // Passed through as-is: `undefined` is "the probe could not answer", which the
    // catalog treats as neutral (available), while `[]` is the real "no distro".
    distros: source.distros(),
    switches: source.switches(),
    wslDistro: source.wslDistro(),
  });
  return {
    catalog: () => {
      const at = now();
      if (cache !== undefined && at - cache.at < CATALOG_TTL_MS) return cache.rows;
      const rows = buildCatalog(facts());
      cache = { at, rows };
      return rows;
    },
    invalidate: () => {
      cache = undefined;
    },
    env: (id) => uiEnv(id, process.env),
  };
}
