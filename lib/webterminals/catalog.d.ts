import type { ShellEntry, ShellSwitches } from "../shells.js";
import type { ResolvedPaths } from "../dsh-types.js";
/** How long one catalog answer is trusted. */
export declare const CATALOG_TTL_MS = 5000;
/** Is this path a launchable file? */
export declare function fsProbe(path: string): boolean;
/**
 * The installed WSL distributions (quiet listing, one per line).
 * @returns [] when wsl.exe is absent; undefined when the probe could not answer
 *  (a timeout is NOT "no distro" - reporting it as such would disable a working
 *  backend, which is the all-false-positive trap).
 */
export declare function listWslDistros(wslPath: string | undefined, timeoutMs?: number): Promise<readonly string[] | undefined>;
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
export declare function createCatalogProvider(source: CatalogSource, now?: () => number): CatalogProvider;
