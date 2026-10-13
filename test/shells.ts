// The shell catalog and the fallback chain, as a zero-dependency assert script
// (this repo's own test style: compiled by tsconfig.test.json, run by node).
//
// These are the rules the browser terminal's whole feature rests on, and every one
// of them came from a measured failure rather than a guess: the `-lc` exit 2, the
// ConPTY `0x8007072c`, the `MSYSTEM` that decides whether gcc is on PATH, the
// `System32\bash.exe` forwarder, and the launcher that pipes zero bytes.

import assert from "node:assert";
import {
  SHELL_PRIORITY,
  buildCatalog,
  isConsoleLauncher,
  isWslLegacyBash,
  resolveDefaultShell,
  uiArgv,
  uiEnv,
} from "../lib/shells.js";
import type { CatalogFacts } from "../lib/shells.js";

const PATHS = {
  pwsh: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
  gitbash: "C:\\Program Files\\Git\\bin\\bash.exe",
  msys2: "C:\\msys64\\usr\\bin\\bash.exe",
  wsl: "C:\\Windows\\System32\\wsl.exe",
};

/** Facts with everything installed and everything allowed. */
function facts(overrides: Partial<CatalogFacts> = {}): CatalogFacts {
  return {
    paths: PATHS,
    fsProbe: () => true,
    distros: ["Ubuntu"],
    switches: { gitbash: true, msys2: true, wsl: true },
    wslDistro: "",
    ...overrides,
  };
}

const row = (catalog: ReturnType<typeof buildCatalog>, id: string) => catalog.find((entry) => entry.id === id)!;

// ---- catalog ----------------------------------------------------------------

assert.deepStrictEqual(SHELL_PRIORITY, ["powershell", "gitbash", "msys2", "wsl"], "priority order is fixed");

{
  const catalog = buildCatalog(facts());
  const ps = row(catalog, "powershell");
  assert.strictEqual(ps.activated, true, "powershell is always activated");
  assert.strictEqual(ps.togglable, false, "powershell cannot be turned off (it is the floor)");
  // D2-1: the label comes from the catalog table, never from the file name. An
  // MSYS2 bash.exe must not read as "Git Bash" - that mislabel is what the sibling
  // plugin shipped for one release.
  assert.strictEqual(row(catalog, "msys2").label, "MSYS2", "MSYS2 keeps its own label");
  assert.strictEqual(row(catalog, "gitbash").label, "Git Bash", "Git Bash keeps its own label");
  assert.ok(row(catalog, "msys2").argv!.includes("-l"), "msys2 interactive argv is a login shell");
  assert.ok(!row(catalog, "msys2").argv!.includes("-lc"), "msys2 never uses -lc without an operand (exit 2)");
}

{
  // A switch off wins over availability: "detected" is not "allowed".
  const catalog = buildCatalog(facts({ switches: { gitbash: false, msys2: true, wsl: true } }));
  assert.strictEqual(row(catalog, "gitbash").activated, false, "an explicit off is a real opt-out");
  assert.strictEqual(row(catalog, "gitbash").available, true, "and still reports as installed");
}

{
  // Absent shell: unavailable, not activated, no argv.
  const catalog = buildCatalog(facts({ fsProbe: (p) => !p.includes("Git") }));
  assert.strictEqual(row(catalog, "gitbash").available, false, "missing git bash is not available");
  assert.strictEqual(row(catalog, "gitbash").reason, "not-installed", "with the reason the badge shows");
  assert.strictEqual(row(catalog, "gitbash").argv, undefined, "an unavailable row carries no argv");
}

{
  // WSL with an answered-empty list is "no distro"; an UNANSWERED probe (undefined)
  // stays neutral - treating unknown as absence is the all-false-positive trap.
  assert.strictEqual(row(buildCatalog(facts({ distros: [] })), "wsl").reason, "no-distro", "empty answer means no distro");
  assert.strictEqual(row(buildCatalog(facts({ distros: undefined })), "wsl").available, true, "an unanswered probe does not disable WSL");
}

{
  // The two guards that stop a launcher or a forwarder becoming a "shell".
  assert.ok(isConsoleLauncher("C:\\msys64\\msys2.exe"), "msys2.exe is a launcher");
  assert.ok(isConsoleLauncher("C:\\Program Files\\Git\\git-bash.exe"), "git-bash.exe is a launcher");
  assert.ok(isWslLegacyBash("C:\\Windows\\System32\\bash.exe"), "System32 bash.exe is the WSL forwarder");
  assert.ok(isWslLegacyBash("c:\\windows\\sysnative\\bash.exe"), "and its sysnative mirror");
  assert.ok(!isWslLegacyBash("C:\\msys64\\usr\\bin\\bash.exe"), "MSYS2's bash is not the forwarder");
  const catalog = buildCatalog(facts({ paths: { ...PATHS, msys2: "C:\\msys64\\msys2.exe" } }));
  assert.strictEqual(row(catalog, "msys2").reason, "launcher-only", "a configured launcher is refused, not trusted");
}

// ---- argv / env -------------------------------------------------------------

assert.deepStrictEqual(uiArgv("powershell", PATHS), [PATHS.pwsh, "-NoLogo"], "UI PowerShell keeps the user profile");
assert.ok(!uiArgv("powershell", PATHS).includes("-NoProfile"), "-NoProfile is the tool's policy, not the user's terminal");
assert.deepStrictEqual(uiArgv("gitbash", PATHS), [PATHS.gitbash, "-i"], "gitbash interactive");
assert.deepStrictEqual(uiArgv("wsl", PATHS), [PATHS.wsl, "--", "bash", "-i"], "default distro uses `-- bash -i`");
assert.deepStrictEqual(uiArgv("wsl", PATHS, "Ubuntu"), [PATHS.wsl, "-d", "Ubuntu", "-e", "bash", "-i"], "an explicit distro uses -d/-e");
assert.throws(() => uiArgv("powershell", { ...PATHS, pwsh: undefined }), /unavailable/, "a missing executable is refused loudly");

{
  const env = uiEnv("msys2", { PATH: "C:\\Windows\\System32", NO_COLOR: "1" });
  assert.strictEqual(env.TERM, "xterm-256color", "an xterm, not the tool's dumb");
  assert.strictEqual(env.MSYSTEM, "MINGW64", "MSYS2 needs MSYSTEM or /mingw64/bin never joins PATH");
  assert.strictEqual(env.NO_COLOR, "1", "the user's own NO_COLOR is respected, not stripped");
  assert.strictEqual(env.PATH, "C:\\Windows\\System32", "the base environment is carried over");
  assert.strictEqual(uiEnv("msys2", { MSYSTEM: "UCRT64" }).MSYSTEM, "UCRT64", "an explicit MSYSTEM wins");
  assert.strictEqual(uiEnv("gitbash", {}).MSYSTEM, undefined, "Git Bash must not be forced into MSYS");
  assert.strictEqual(uiEnv("wsl", {}).TERM, "xterm-256color", "WSL gets a real terminal type too");
}

// ---- resolveDefaultShell (R4/R5/R6) ----------------------------------------

const full = buildCatalog(facts());
const only = (ids: string[]) => buildCatalog(facts({ switches: { gitbash: ids.includes("gitbash"), msys2: ids.includes("msys2"), wsl: ids.includes("wsl") } }));

{
  const picked = resolveDefaultShell(full, "gitbash", PATHS);
  assert.strictEqual(picked.id, "gitbash", "an activated, available choice is honoured");
  assert.strictEqual(picked.fellBack, false, "and reports no substitution");
}

{
  // "never chose" is not "chose wrong": no notice, no fellBack.
  const picked = resolveDefaultShell(full, "", PATHS);
  assert.strictEqual(picked.id, "powershell", "empty means take the first candidate");
  assert.strictEqual(picked.fellBack, false, "and that is not a fallback the user must be told about");
}

{
  // A stale choice (the switch was turned off) substitutes and says so. Powershell
  // stays first because it is the floor, not because the user asked for it.
  const picked = resolveDefaultShell(only(["msys2"]), "wsl", PATHS);
  assert.strictEqual(picked.id, "powershell", "the floor still leads the priority order");
  assert.strictEqual(picked.fellBack, true, "a stale value is reported");
  assert.strictEqual(picked.from, "wsl", "with the value it replaced");
}

{
  // Nothing activated at all (R6). The catalog itself still carries powershell as
  // activated - it is the floor - so a fully-populated host never reaches the
  // floor chain below; only a host WITHOUT any powershell executable does.
  const catalog = buildCatalog(facts({ switches: { gitbash: false, msys2: false, wsl: false } }));
  const picked = resolveDefaultShell(catalog, "gitbash", PATHS);
  assert.strictEqual(picked.floor, false, "powershell is activated regardless of switches, so this is not the floor path");
  assert.strictEqual(picked.id, "powershell", "and it is what runs");
  assert.deepStrictEqual([...picked.argv], [PATHS.pwsh, "-NoLogo"], "the floor still launches a real PowerShell");

  const noPwsh = buildCatalog(facts({ paths: { ...PATHS, pwsh: undefined }, switches: { gitbash: false, msys2: false, wsl: false } }));
  const fellBack = resolveDefaultShell(noPwsh, "gitbash", { ...PATHS, pwsh: undefined });
  assert.strictEqual(fellBack.floor, true, "with no usable backend the floor is reported");
  assert.match(fellBack.path, /cmd\.exe$/i, "cmd.exe is the last thing that can be typed into");
}

console.log("ALL SHELL-CATALOG TESTS PASSED");
