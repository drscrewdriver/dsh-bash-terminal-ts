// Terminal adapter templates — four Windows terminal backends, ready to copy.
//
// Extracted from dsh-bash-terminal-ts `src/index.ts` and sanitised for reuse:
// no author-local paths, no host-specific values. Copy this file — or just the
// one adapter you need — into your own DSH plugin, then wire the seams listed
// under "Wiring into DSH" in ./README.md.
//
//   powershell  pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>
//   gitbash     Git for Windows bash -lc <cmd>       POSIX; /d/... paths
//   msys2       MSYS2 bash -lc <cmd>                 POSIX; /c/... paths, GCC/mingw64
//   wsl         wsl [-d <distro>] -e bash -lc <cmd>  Linux; /mnt/d/... paths
//
// The flag choices here are not guesses: each non-obvious one was measured on
// Windows and carries its reason inline. Read the comment before changing a
// flag — several of them look arbitrary and are not.
//
// Node >= 22. No runtime dependencies beyond node:fs / node:path.

import { lstatSync } from "node:fs";
import { join } from "node:path";

/** The four backends, in the order they appear in the settings dropdown. */
export const SHELLS = ["powershell", "gitbash", "msys2", "wsl"] as const;
export type ShellId = (typeof SHELLS)[number];

/** Chosen when the user has never touched the setting. */
export const DEFAULT_SHELL: ShellId = "powershell";

/**
 * Forced into every child process. A shell tool feeds its output to a model, so
 * pagers and colour codes are pure noise: `PAGER=cat` and `NO_COLOR=1` keep the
 * captured stdout byte-for-byte the command's actual output.
 */
export const ENV_OVERRIDES: Record<string, string> = {
  NO_COLOR: "1",
  TERM: "dumb",
  PAGER: "cat",
  GIT_PAGER: "cat"
};

// ---- executable resolution -------------------------------------------------

function candidateExists(candidate: string): boolean {
  try {
    const stat = lstatSync(candidate);
    return stat.isFile() || stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/** First candidate that exists on disk, or undefined when none does. */
export function resolveFromCandidates(candidates: readonly string[]): string | undefined {
  for (const candidate of candidates) {
    if (candidateExists(candidate)) return candidate;
  }
  return undefined;
}

/** Well-known PowerShell install locations, then PATH entries. Newest first. */
export function candidatePwshPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const programFiles = env.ProgramFiles ?? "C:\\Program Files";
  const systemRoot = env.SystemRoot ?? "C:\\Windows";
  // PowerShell 7 first: pwsh.exe is the cross-platform one and is what the
  // -NoLogo/-NoProfile/-NonInteractive flag set is written against.
  const candidates = [join(programFiles, "PowerShell", "7", "pwsh.exe")];
  for (const entry of (env.PATH ?? "").split(";")) {
    const trimmed = entry.trim().replace(/^"|"$/g, "");
    if (trimmed.length === 0) continue;
    candidates.push(join(trimmed, "pwsh.exe"));
  }
  // Windows PowerShell 5.1 as the floor — present on every Windows install.
  candidates.push(join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
  return candidates;
}

/**
 * Git for Windows locations, then PATH `bash.exe` entries EXCLUDING the
 * System32 launcher.
 *
 * That exclusion is the whole point of this function: `C:\Windows\System32\
 * bash.exe` also exists on machines with WSL and is the **WSL forwarder**, not
 * a Git Bash shell. Picking it up silently sends Git Bash commands into a Linux
 * VM, where `/d/...` paths and the Git for Windows toolchain do not exist.
 */
export function candidateGitBashPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const programFiles = env.ProgramFiles ?? "C:\\Program Files";
  const systemRoot = (env.SystemRoot ?? "C:\\Windows").toLowerCase();
  const localAppData = env.LOCALAPPDATA ?? "";
  const candidates = [
    join(programFiles, "Git", "bin", "bash.exe"),
    // usr\bin\bash.exe is the MSYS-rooted twin; some installs only expose this one.
    join(programFiles, "Git", "usr", "bin", "bash.exe")
  ];
  // Per-user installs land here.
  if (localAppData.length > 0) candidates.push(join(localAppData, "Programs", "Git", "bin", "bash.exe"));
  for (const entry of (env.PATH ?? "").split(";")) {
    const trimmed = entry.trim().replace(/^"|"$/g, "");
    if (trimmed.length === 0) continue;
    if (trimmed.toLowerCase().includes(systemRoot)) continue; // ← the WSL forwarder
    candidates.push(join(trimmed, "bash.exe"));
  }
  return candidates;
}

/**
 * MSYS2 locations, in preference order: the real `bash.exe` under usr\bin
 * first, then bin\bash.exe, and `msys2.exe` dead last.
 *
 * `msys2.exe` is NOT a usable backend for piped execution. It is the
 * console-allocating Cygwin launcher: spawned with piped stdio it returns exit
 * 0 with zero bytes on both stdout and stderr, so every command looks like it
 * succeeded and printed nothing. It stays in the list only as a last resort;
 * a working `bash.exe` always wins.
 */
export function candidateMsys2Paths(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates = [
    "C:\\msys64\\usr\\bin\\bash.exe",
    "C:\\msys64\\bin\\bash.exe"
  ];
  for (const entry of (env.PATH ?? "").split(";")) {
    const trimmed = entry.trim().replace(/^"|"$/g, "");
    if (trimmed.length === 0) continue;
    const lower = trimmed.toLowerCase();
    if (lower.includes("msys64") || lower.includes("mingw64")) {
      candidates.push(join(trimmed, "bash.exe"));
    }
  }
  candidates.push("C:\\msys64\\msys2.exe"); // last resort — see the note above
  return candidates;
}

/** `wsl.exe` always ships at this fixed location; it is never "not installed". */
export function defaultWslPath(env: NodeJS.ProcessEnv = process.env): string {
  const systemRoot = env.SystemRoot ?? "C:\\Windows";
  return join(systemRoot, "System32", "wsl.exe");
}

export interface ResolvedPaths {
  pwsh?: string;
  gitbash?: string;
  msys2?: string;
  wsl?: string;
}

/** Per-backend executable overrides; an empty string means "auto-detect". */
export interface PathConfig {
  pwshPath?: string;
  gitBashPath?: string;
  msys2Path?: string;
  wslPath?: string;
}

/**
 * Resolve all four executables. A backend resolves to `undefined` when it is
 * not installed — surface that as a loud per-call error rather than a silent
 * fallback to another shell, or the user's explicit choice gets ignored.
 */
export function resolveAllPaths(config: PathConfig = {}, env: NodeJS.ProcessEnv = process.env): ResolvedPaths {
  const pick = (override: string | undefined, candidates: readonly string[]): string | undefined =>
    override !== undefined && override.trim().length > 0 ? override : resolveFromCandidates(candidates);
  return {
    pwsh: pick(config.pwshPath, candidatePwshPaths(env)),
    gitbash: pick(config.gitBashPath, candidateGitBashPaths(env)),
    msys2: pick(config.msys2Path, candidateMsys2Paths(env)),
    // wsl.exe is not probed: it is a Windows component, so treat it as present.
    wsl: config.wslPath !== undefined && config.wslPath.trim().length > 0 ? config.wslPath : defaultWslPath(env)
  };
}

// ---- argv construction -----------------------------------------------------

/** Prepend the backend-specific command flags. `command` always goes last. */
export function buildArgv(
  shell: ShellId,
  command: string,
  paths: ResolvedPaths,
  distro?: string
): Array<string | undefined> {
  switch (shell) {
    case "powershell":
      // -NonInteractive so a stray prompt can never hang the capture; the
      // model's command is one complete script, not a REPL session.
      return [paths.pwsh, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command];
    case "gitbash":
      // -l (login shell) matters: it sources /etc/profile, which is what puts
      // /usr/bin and /mingw64/bin on PATH. With a bare -c, `git`, `ssh` and
      // friends are "command not found".
      return [paths.gitbash, "-lc", command];
    case "msys2":
      // Same -l reasoning as gitbash, and it also picks up /etc/profile's
      // MSYSTEM handling that puts gcc/make on PATH.
      return [paths.msys2, "-lc", command];
    case "wsl": {
      const distroArg = distro !== undefined && distro.trim().length > 0 ? ["-d", distro.trim()] : [];
      // `-e bash -lc` — not `wsl bash -lc`: `-e` runs the command directly and
      // without a shell wrapper, so quoting survives intact.
      return [paths.wsl, ...distroArg, "-e", "bash", "-lc", command];
    }
    default: {
      const exhaustive: never = shell;
      throw new Error(`invalid shell: ${JSON.stringify(exhaustive)} (expected one of ${SHELLS.join(", ")})`);
    }
  }
}

// ---- environment -----------------------------------------------------------

/**
 * Merge the host environment with per-backend fixups.
 *
 * @param inheritedWslenv - the ambient WSLENV to layer onto. Callers that
 *   replace the child environment wholesale (a PTY path, say) must pass
 *   `process.env.WSLENV` explicitly, because the ambient value is not visible
 *   through `dshEnv`.
 */
export function buildEnv(
  shell: ShellId,
  hostEnv?: Record<string, string>,
  inheritedWslenv: string | undefined = process.env.WSLENV
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...ENV_OVERRIDES, ...hostEnv };
  if (shell === "msys2") {
    // Selects the MINGW64 environment, so /mingw64/bin (gcc, make, ...) joins
    // PATH via /etc/profile. Without it MSYS2 defaults to the bare MSYS
    // environment and the toolchain is invisible. An explicit caller value wins.
    if (env.MSYSTEM === undefined) env.MSYSTEM = "MINGW64";
  }
  if (shell === "wsl") {
    const keys = Object.keys(hostEnv ?? {});
    if (keys.length > 0) {
      // WSLENV is an allow-list: only the variables named in it cross into WSL.
      // LAYER onto the inherited value, never rebuild it — dropping inherited
      // entries (Windows Terminal exports e.g. `WT_SESSION:WT_PROFILE_ID:`)
      // would silently stop them crossing.
      //
      // The base is SPLIT on ":" rather than concatenated because the host
      // value ends with a trailing ":", so string concatenation would produce a
      // malformed empty entry.
      const declared = Object.prototype.hasOwnProperty.call(hostEnv ?? {}, "WSLENV");
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

// ---- sandbox confinement ---------------------------------------------------

export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";

/**
 * Whether a backend can be wrapped by your sandbox seam, and what to report
 * when it cannot.
 *
 * Only PowerShell is confinable on Windows. Git Bash and MSYS2 must NOT be
 * wrapped: DSH's Windows ACL restricted-token runner cannot start a
 * Cygwin/MSYS2 process — bash aborts during startup with
 * `CreateFileMapping ... Win32 error 5` — so wrapping them would abort every
 * command instead of confining it. WSL is its own Linux VM; that isolation IS
 * the sandbox, so wrapping it is redundant.
 *
 * Publish this honestly: report `*-unconfined` rather than claiming a
 * confinement that did not happen.
 */
export function confinementFor(mode: SandboxMode, shell: ShellId): string {
  if (shell === "wsl") return "wsl-isolation";
  if (shell === "gitbash") return "gitbash-unconfined";
  if (shell === "msys2") return "msys2-unconfined";
  return mode === "danger-full-access" ? "none" : "powershell-confined";
}

/** True when the spawn argv must be passed through the sandbox facade. */
export function shouldConfine(mode: SandboxMode, shell: ShellId): boolean {
  return mode !== "danger-full-access" && shell === "powershell";
}

// ---- the adapter table -----------------------------------------------------

export interface TerminalAdapter {
  readonly id: ShellId;
  /** Shown in the settings dropdown. */
  readonly label: string;
  /** One line describing the backend, suitable for a settings-row caption. */
  readonly summary: string;
  /** Model-facing tool description when this backend is active. */
  readonly toolDescription: string;
  /** Candidate executables, best first. */
  candidates(env?: NodeJS.ProcessEnv): string[];
  /** Path key in your config schema, or undefined when there is nothing to override. */
  readonly configKey?: keyof PathConfig;
  /** Whether this backend's spawn argv may be confined. */
  readonly confinable: boolean;
}

export const ADAPTERS: Record<ShellId, TerminalAdapter> = {
  powershell: {
    id: "powershell",
    label: "PowerShell",
    summary: "PowerShell 7 (pwsh), the Windows default",
    toolDescription:
      "Execute a PowerShell command (pwsh -NoLogo -NoProfile -NonInteractive -Command <command>) and return its stdout/stderr. PowerShell syntax; native Windows paths (C:\\...); environment variables via $env:NAME.",
    candidates: candidatePwshPaths,
    configKey: "pwshPath",
    confinable: true
  },
  gitbash: {
    id: "gitbash",
    label: "Git Bash",
    summary: "Git for Windows bash — POSIX syntax, /d/... paths",
    toolDescription:
      "Execute a bash command (Git for Windows bash -lc <command>) and return its stdout/stderr. POSIX syntax; paths like /d/workspace; PATH includes /usr/bin and /mingw64/bin so git, npm, ssh etc. work; environment variables via $NAME.",
    candidates: candidateGitBashPaths,
    configKey: "gitBashPath",
    confinable: false
  },
  msys2: {
    id: "msys2",
    label: "MSYS2",
    summary: "MSYS2 bash — POSIX syntax, /c/... paths, full GCC/mingw64 toolchain",
    toolDescription:
      "Execute a bash command (MSYS2 bash -lc <command>) and return its stdout/stderr. POSIX syntax; paths like /c/...; PATH includes /usr/bin and /mingw64/bin so git, npm, gcc, make etc. work; environment variables via $NAME. MSYS2 provides a full GCC/mingw64 toolchain.",
    candidates: candidateMsys2Paths,
    configKey: "msys2Path",
    confinable: false
  },
  wsl: {
    id: "wsl",
    label: "WSL",
    summary: "WSL Linux — /mnt/d/... paths, optional distro",
    toolDescription:
      "Execute a bash command in WSL (wsl [-d <distro>] -e bash -lc <command>) and return its stdout/stderr. Linux syntax; paths like /mnt/d/workspace; environment variables via $NAME (crossing the boundary through WSLENV).",
    candidates: (env = process.env) => [defaultWslPath(env)],
    configKey: "wslPath",
    confinable: false
  }
};
