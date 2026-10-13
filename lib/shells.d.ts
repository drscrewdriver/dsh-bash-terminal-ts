import type { ResolvedPaths } from "./dsh-types.js";
import type { ShellId } from "./shell-id.js";
/** Re-exported so existing importers keep working (see shell-id.ts for why). */
export type { ShellId };
/** Catalog order = fallback order: powershell is BOTH first choice and floor. */
export declare const SHELL_PRIORITY: readonly ShellId[];
/** Why one backend is not launchable (drives the settings-row badge). */
export type ShellUnavailable = "installed" | "not-installed" | "no-distro" | "launcher-only";
/** One catalog row: what the UI shows and what the host would spawn. */
export interface ShellEntry {
    readonly id: ShellId;
    /** Display label (a catalog constant, never inferred from the file name). */
    readonly label: string;
    /** Resolved executable, absent when the backend is not usable. */
    readonly path?: string;
    readonly available: boolean;
    readonly reason: ShellUnavailable;
    /** The activation switch state (powershell is always true: the floor). */
    readonly activated: boolean;
    /** False only for powershell, which the user cannot turn off. */
    readonly togglable: boolean;
    /** Interactive argv, present only when `available`. */
    readonly argv?: readonly string[];
}
/** The activation switches as persisted in the plugin config. */
export interface ShellSwitches {
    gitbash: boolean;
    msys2: boolean;
    wsl: boolean;
}
/** Everything the catalog builder needs from the outside world. */
export interface CatalogFacts {
    /** Resolved executables (config override or candidate-list winner). */
    paths: ResolvedPaths;
    /** Whether one path is a launchable file. */
    fsProbe(path: string): boolean;
    /** `wsl -l -q` output. `undefined` means the probe could not answer (a timeout
     * is not evidence of absence); `[]` means it answered "no distro installed". */
    readonly distros: readonly string[] | undefined;
    switches: ShellSwitches;
    /** WSL distro override from config ('' = the WSL default). */
    wslDistro: string;
}
/**
 * `<SystemRoot>\System32\bash.exe` (and the sysnative mirror) is the deprecated
 * WSL forwarder, not a shell. `candidateGitBashPaths` already skips it; this
 * guard protects the second way a path reaches the catalog - a user-supplied
 * `gitBashPath` / `msys2Path` config value.
 */
export declare function isWslLegacyBash(path: string): boolean;
/**
 * Console-allocating launchers: `git-bash.exe`, `msys2.exe`, `msys2_shell.cmd`.
 * They open their own window and return zero bytes on a piped stdio (measured
 * against MSYS2 with bash 5.3.15), so they can never host an embedded terminal.
 */
export declare function isConsoleLauncher(path: string): boolean;
/**
 * Interactive argv for the BROWSER terminal.
 *
 * Differences from the tool's `terminalArgv`: PowerShell keeps its profile (the
 * user's aliases and prompt are the point of a UI terminal), and the three bash
 * families are unchanged because those rules are about the shell itself:
 * Git Bash needs `-i`, MSYS2 needs `-l` and NEVER `-lc` (this argv carries no
 * command, and `bash -lc` with no operand exits 2), WSL needs `-- bash -i` on the
 * default distro (bare `-e` fails under ConPTY with RPC 0x8007072c).
 */
export declare function uiArgv(shell: ShellId, paths: ResolvedPaths, wslDistro?: string): string[];
/**
 * Environment for the BROWSER terminal: the host process environment plus a real
 * terminal type. `buildEnv` is deliberately NOT reused - it layers
 * `TERM=dumb`/`NO_COLOR=1`/`PAGER=cat` over an agent-scoped map, which is right
 * for a one-shot tool call and wrong for an interactive screen.
 *
 * The one rule carried over is MSYS2's `MSYSTEM`: without it MSYS2 starts in the
 * bare MSYS environment and `/etc/profile` never puts `/mingw64/bin` on PATH, so
 * gcc/make are missing in the very shell the user chose to get them from. An
 * explicit value in the base environment wins, exactly as in `buildEnv`.
 */
export declare function uiEnv(shell: ShellId, baseEnv: NodeJS.ProcessEnv): Record<string, string | undefined>;
/**
 * The catalog the settings page and the spawn path both read.
 *
 * `powershell` is never `activated: false` even if a switch said so: it is the
 * floor of the fallback chain (R2/R6), and a floor that can be removed is not a
 * floor. The caller sees that through `togglable: false`.
 */
export declare function buildCatalog(facts: CatalogFacts): ShellEntry[];
/** The result of resolving which shell a terminal should start with. */
export interface ResolvedDefault {
    readonly id: ShellId | "cmd";
    readonly path: string;
    readonly argv: readonly string[];
    /** True when the stored value was replaced (the UI shows why). */
    readonly fellBack: boolean;
    /** True when nothing is activated and the floor was used. */
    readonly floor: boolean;
    /** The stored value that was not honoured, when there was one. */
    readonly from?: string;
}
/**
 * Decide the shell for one allocation (R4/R5/R6).
 *
 * Three distinct outcomes, because the UI has to say different things about them:
 * - `""` means the user never chose: take the first candidate, no notice;
 * - a non-empty value outside the candidates means the choice went stale (a
 *   switch was turned off, or a shell was uninstalled): fall back AND report
 *   `fellBack` with the original value;
 * - no candidate at all: the floor is PowerShell's own chain (pwsh 7 -> Windows
 *   PowerShell), and `cmd.exe` is the last resort when even that is gone.
 *
 * The stored config is never rewritten here - a fallback that persists would
 * silently eat the user's choice.
 */
export declare function resolveDefaultShell(catalog: readonly ShellEntry[], configured: string, paths: ResolvedPaths): ResolvedDefault;
