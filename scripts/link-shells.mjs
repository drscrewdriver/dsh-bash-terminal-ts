// Create the shell aliases the host's terminal menu needs, and say what is missing.
//
// Why this exists as a script: `@deepseek-ai/dsh-api-terminal-controller` builds its
// shell list with `discoverShells`, which keys a Map by the executable FILE NAME and
// keeps the earliest entry. Git Bash and MSYS2 are both `bash.exe`, so on the stock list
// one of them cannot appear at all - the fix is a hard link with its own name, which is
// free (same inode, no copy, deleting the link reverts it) but is a filesystem change
// outside this package.
//
// The two links are not equal in privilege: `C:\msys64` is user-writable, while
// `C:\Program Files\Git\bin` is not - CreateHardLink needs write access to the SOURCE
// file, so the Git link cannot be moved to a writable directory even though a link can
// physically live anywhere on the same volume (and it must not: bash derives its POSIX
// root from its own path). That one therefore needs an elevated run, and this script
// prints the exact command instead of failing with a bare EPERM.
//
// Run: node scripts/link-shells.mjs          (checks and creates what it can)
//      as Administrator: same command, to also create the Git one.

import { existsSync, linkSync, statSync } from "node:fs";

/** Each alias: the link to create and the shell it must point at. */
const ALIASES = [
  {
    id: "msys2",
    link: "C:\\msys64\\usr\\bin\\msys-bash.exe",
    source: "C:\\msys64\\usr\\bin\\bash.exe",
    elevation: false,
  },
  {
    id: "gitbash",
    link: "C:\\Program Files\\Git\\bin\\git-bash.exe",
    source: "C:\\Program Files\\Git\\bin\\bash.exe",
    elevation: true,
  },
];

let blocked = 0;
let missing = 0;

for (const alias of ALIASES) {
  if (!existsSync(alias.source)) {
    // Not an error: a machine without MSYS2 should not gain an entry for it. The
    // candidate stays listed in cordis.patch.yml and the host skips it per-candidate.
    console.log(`skip    ${alias.id.padEnd(8)} ${alias.source} not found on this machine`);
    missing += 1;
    continue;
  }
  if (existsSync(alias.link)) {
    const a = statSync(alias.source);
    const b = statSync(alias.link);
    const shared = a.ino === b.ino && a.dev === b.dev;
    console.log(`${shared ? "ok      " : "BAD     "} ${alias.id.padEnd(8)} ${alias.link}${shared ? ` (same inode, nlink=${b.nlink})` : " (exists but is NOT a hard link of the source!)"}`);
    if (!shared) blocked += 1;
    continue;
  }
  try {
    linkSync(alias.source, alias.link);
    console.log(`created ${alias.id.padEnd(8)} ${alias.link}`);
  } catch (error) {
    const code = error instanceof Error ? error.code ?? error.message : String(error);
    console.log(`denied  ${alias.id.padEnd(8)} ${code}`);
    console.log(`        run this in an elevated PowerShell or cmd:`);
    console.log(`          cmd /c mklink /H "${alias.link}" "${alias.source}"`);
    blocked += 1;
  }
}

console.log("");
if (blocked > 0) {
  console.log(`${blocked} alias(es) still missing - the official shell menu will not offer them until they exist.`);
  process.exitCode = 1;
} else {
  console.log(missing === ALIASES.length ? "no MSYS2 / Git installs found; nothing to do" : "all present aliases are in place");
}
