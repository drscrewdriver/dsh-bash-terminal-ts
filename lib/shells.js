// dsh-bash-terminal-ts: the shell catalog for the browser-side terminal.
//
// Why this file exists separately from `buildArgv` / `terminalArgv` / `buildEnv`
// in index.ts and terminal.ts: those three serve the MODEL tool, where a dumb
// terminal and a stripped environment are correct (no colour, no pager, one
// command per call). The browser terminal is the opposite contract - a real
// xterm emulator driven by a human who expects their profile, their prompt and
// their colours. Sharing the tool's argv/env would hand the user a shell with
// `TERM=dumb`, `NO_COLOR=1` and `-NoProfile`.
//
// So this module owns the UI-facing rules and REUSES the parts that are
// genuinely shared: the executable candidate lists (injected by index.ts, which
// keeps the dependency one-way and this file unit-testable), the MSYS2 `MSYSTEM`
// rule, and the WSL interactive argv shape.
//
// Everything here is pure: no fs, no child_process, no module-level cache. The
// caller injects `fsProbe` / `distros` and owns the TTL.
/** Catalog order = fallback order: powershell is BOTH first choice and floor. */
export const SHELL_PRIORITY = ["powershell", "gitbash", "msys2", "wsl"];
/** Display labels. The catalog id/label pair is DECIDED BY THIS TABLE. */
const LABELS = {
    powershell: "PowerShell",
    gitbash: "Git Bash",
    msys2: "MSYS2",
    wsl: "WSL bash",
};
/**
 * `<SystemRoot>\System32\bash.exe` (and the sysnative mirror) is the deprecated
 * WSL forwarder, not a shell. `candidateGitBashPaths` already skips it; this
 * guard protects the second way a path reaches the catalog - a user-supplied
 * `gitBashPath` / `msys2Path` config value.
 */
export function isWslLegacyBash(path) {
    const stem = /([^\\/]+)\.exe$/i.exec(path)?.[1]?.toLowerCase();
    if (stem !== "bash")
        return false;
    return /\\(windows\\system32|sysnative)\\bash\.exe$/i.test(path.replace(/\//g, "\\"));
}
/**
 * Console-allocating launchers: `git-bash.exe`, `msys2.exe`, `msys2_shell.cmd`.
 * They open their own window and return zero bytes on a piped stdio (measured
 * against MSYS2 with bash 5.3.15), so they can never host an embedded terminal.
 */
export function isConsoleLauncher(path) {
    const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1).toLowerCase();
    return name === "git-bash.exe" || name === "msys2.exe" || name === "msys2_shell.cmd";
}
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
export function uiArgv(shell, paths, wslDistro = "") {
    switch (shell) {
        case "powershell":
            return [requirePath(paths.pwsh, shell), "-NoLogo"];
        case "gitbash":
            return [requirePath(paths.gitbash, shell), "-i"];
        case "msys2":
            return [requirePath(paths.msys2, shell), "-l"];
        case "wsl": {
            const distro = wslDistro.trim();
            return distro.length > 0
                ? [requirePath(paths.wsl, shell), "-d", distro, "-e", "bash", "-i"]
                : [requirePath(paths.wsl, shell), "--", "bash", "-i"];
        }
    }
}
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
export function uiEnv(shell, baseEnv) {
    const env = { ...baseEnv };
    // A UI terminal is an xterm: the tool's `dumb` would kill colours, cursor
    // control and full-screen programs.
    env.TERM = "xterm-256color";
    if (shell === "msys2" && env.MSYSTEM === undefined)
        env.MSYSTEM = "MINGW64";
    return env;
}
function requirePath(path, shell) {
    if (path === undefined || path.length === 0) {
        throw new Error(`terminal: ${shell} backend unavailable - no executable resolved`);
    }
    return path;
}
/** One row's availability, given the injected facts. */
function probe(id, facts) {
    const path = id === "powershell" ? facts.paths.pwsh : id === "gitbash" ? facts.paths.gitbash : id === "msys2" ? facts.paths.msys2 : facts.paths.wsl;
    if (path === undefined || path.length === 0)
        return { available: false, reason: "not-installed" };
    // A configured path is honoured, but a launcher is not a shell: trusting the
    // config here is how `msys2.exe` ends up in the menu and returns no output.
    if (isConsoleLauncher(path))
        return { available: false, reason: "launcher-only", path };
    if (isWslLegacyBash(path))
        return { available: false, reason: "launcher-only", path };
    if (!facts.fsProbe(path))
        return { available: false, reason: "not-installed", path };
    if (id === "wsl" && facts.distros !== undefined && facts.distros.length === 0)
        return { available: false, reason: "no-distro", path };
    return { available: true, reason: "installed", path };
}
/**
 * The catalog the settings page and the spawn path both read.
 *
 * `powershell` is never `activated: false` even if a switch said so: it is the
 * floor of the fallback chain (R2/R6), and a floor that can be removed is not a
 * floor. The caller sees that through `togglable: false`.
 */
export function buildCatalog(facts) {
    return SHELL_PRIORITY.map((id) => {
        const probed = probe(id, facts);
        const activated = id === "powershell" ? true : probed.available && facts.switches[id] === true;
        const argv = activated && probed.available ? uiArgv(id, facts.paths, facts.wslDistro) : undefined;
        return {
            id,
            label: LABELS[id],
            ...(probed.path !== undefined ? { path: probed.path } : {}),
            available: probed.available,
            reason: probed.reason,
            activated,
            // Only powershell is un-togglable, and that is the floor rule above.
            togglable: id !== "powershell",
            ...(argv !== undefined ? { argv } : {}),
        };
    });
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
export function resolveDefaultShell(catalog, configured, paths) {
    const usable = SHELL_PRIORITY
        .map((id) => catalog.find((entry) => entry.id === id))
        .filter((entry) => entry !== undefined && entry.activated && entry.available && entry.path !== undefined);
    const wanted = configured.trim();
    const chosen = wanted.length === 0 ? undefined : usable.find((entry) => entry.id === wanted);
    const picked = chosen ?? usable[0];
    if (picked !== undefined) {
        return {
            id: picked.id,
            path: picked.path,
            argv: picked.argv ?? uiArgv(picked.id, paths),
            fellBack: chosen === undefined && wanted.length > 0,
            floor: false,
            ...(chosen === undefined && wanted.length > 0 ? { from: wanted } : {}),
        };
    }
    // Nothing activated: the floor. `paths.pwsh` is already the candidate-list
    // winner (pwsh 7 -> PATH pwsh -> Windows PowerShell 5.1), so the only step
    // below it is cmd.exe, which exists on every Windows host and is enough to
    // type in.
    const floorPath = paths.pwsh ?? "C:\\Windows\\System32\\cmd.exe";
    const isCmd = /\cmd\.exe$/i.test(floorPath);
    return {
        id: isCmd ? "cmd" : "powershell",
        path: floorPath,
        argv: isCmd ? [floorPath] : [floorPath, "-NoLogo"],
        fellBack: wanted.length > 0,
        floor: true,
        ...(wanted.length > 0 ? { from: wanted } : {}),
    };
}
