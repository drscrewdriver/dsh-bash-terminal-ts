#!/usr/bin/env node
// agent-presets/install-presets.mjs - copy a terminal-semantics preset template
// into the DSH deployment (%USERPROFILE%\.dsh\.agent-presets by default).
//
// What it does:
//   1. resolves the %%placeholder%% tokens from --set key=value pairs;
//   2. DROPS any line whose placeholder was not provided (the line is optional
//      machine guidance by design - an unfilled `%%pythonPath%%` sentence is
//      worse than no sentence);
//   3. backs up an existing same-name preset OUTSIDE .agent-presets (a backup
//      inside the preset dir would be mounted as a preset), then writes.
// It never deletes anything: overwrite happens only after the backup copy.
import { parseArgs } from "node:util";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = readdirSync(HERE, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string", multiple: true },
    all: { type: "boolean", default: false },
    dest: { type: "string" },
    set: { type: "string", multiple: true },
    "dry-run": { type: "boolean", default: false },
    list: { type: "boolean", default: false },
    help: { type: "boolean", default: false }
  }
});

if (opt.help || opt.list) {
  console.log(`templates here: ${TEMPLATES.join(", ")}`);
  if (opt.help) {
    console.log([
      "usage:",
      "  node install-presets.mjs --list                         # what is available",
      "  node install-presets.mjs --name <preset> [--name ...]   # install selected templates",
      "  node install-presets.mjs --all [--dry-run]              # everything, or preview first",
      "  from an installed plugin (profile dir):",
      "    node node_modules/dsh-bash-terminal-ts/agent-presets/install-presets.mjs --name <preset>",
      "  from the source repo:  npm run presets:install -- --name <preset>",
      "",
      "what each template anchors (default terminal + its failure-mode guidance):",
      "  standard-win          PowerShell (pwsh) - the Windows default, six-item pitfall list",
      "  standard-win-gitbash  Git Bash          - POSIX bash, /c/... paths, MSYS path-conversion traps",
      "  standard-win-msys2    MSYS2 bash        - + msys-vs-mingw64 dual-runtime guidance",
      "  standard-win-wsl2     WSL2 Linux bash   - /mnt/c paths, case-sensitivity/CRLF/wslpath traps",
      "  standard-win-payload  pinned POSIX payload - digest-verified backup runtime; opt-in twice, see below",
      "",
      "placeholders (%%token%% lines in the persona):",
      "  --set pythonPath=<path>         Windows interpreter; bash templates want /c/... form",
      "  --set winPythonWslPath=<path>   the same interpreter as WSL sees it (/mnt/c/... form)",
      "A line whose token was not --set is DROPPED whole - installing with no --set flags",
      "is always safe and machine-neutral (no %% residue can ever be written).",
      "",
      "after installing - keep the three layers in agreement:",
      "  1. restart / hot-reload DSH (the host mounts %USERPROFILE%\\.dsh\\.agent-presets at boot);",
      "  2. pick the preset for the session (subagents inherit it through agentPreset);",
      "  3. set this plugin's default terminal to the SAME shell: Settings -> General ->",
      "     Default terminal (or defaultShell in cordis.patch.yml). For the payload",
      "     template ALSO: enablePosixPayload: true in cordis.patch.yml (operator gate,",
      "     takes effect on restart) AND the 'POSIX payload' row switch shellPayload: true",
      "     on the settings page - the payload is deliberately opt-in twice.",
      "",
      "safety: an existing same-name preset is copied OUTSIDE the mount root",
      "(%USERPROFILE%\\.dsh\\_agent-presets-backup\\<timestamp>\\) before overwriting; nothing is deleted.",
      "",
      "companion: install the dsh-preset-doctor plugin (npm) - it scans these mounted",
      "presets across host-version migrations, auto-realigns what it can and gives",
      "per-row switches inside each preset card, so the templates stay governable",
      "without hand-editing YAML."
    ].join("\n"));
  }
  process.exit(0);
}

const chosen = opt.all ? TEMPLATES : (opt.name ?? positionals);
if (chosen.length === 0) {
  console.error("install-presets: nothing selected - use --name <preset> or --all");
  process.exit(2);
}
for (const name of chosen) {
  if (!TEMPLATES.includes(name)) {
    console.error(`install-presets: unknown template ${JSON.stringify(name)}; available: ${TEMPLATES.join(", ")}`);
    process.exit(2);
  }
}

const sets = {};
for (const kv of opt.set ?? []) {
  const i = kv.indexOf("=");
  if (i <= 0) {
    console.error(`install-presets: bad --set ${JSON.stringify(kv)} (expected key=value)`);
    process.exit(2);
  }
  sets[kv.slice(0, i).trim()] = kv.slice(i + 1);
}

const dest = resolve(opt.dest ?? join(process.env.USERPROFILE ?? homedir(), ".dsh", "agent-presets"));
// Backup lives OUTSIDE the preset directory: .agent-presets is a mount root and
// every subdirectory of it is treated as a preset by the host.
const backupRoot = resolve(dest, "..", "_agent-presets-backup");

function render(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const tokens = [...line.matchAll(/%%([A-Za-z][\w]*)%%/g)].map((m) => m[1]);
    if (tokens.length === 0) {
      out.push(line);
      continue;
    }
    const missing = tokens.filter((t) => !(t in sets));
    if (missing.length > 0) {
      // An optional machine-guidance line without its value: drop the whole
      // line rather than ship a sentence with a hole in it.
      console.log(`  note: dropped line (missing --set ${missing.join(", ")}): ${line.trim().slice(0, 80)}...`);
      continue;
    }
    out.push(line.replace(/%%([A-Za-z][\w]*)%%/g, (_m, t) => sets[t]));
  }
  return out.join(/\r\n/.test(text) ? "\r\n" : "\n");
}

let wrote = 0;
for (const name of chosen) {
  const srcDir = join(HERE, name);
  const target = join(dest, name);
  console.log(`\n[${name}] -> ${target}`);
  const files = readdirSync(srcDir).filter((f) => statSync(join(srcDir, f)).isFile());
  const rendered = new Map();
  for (const f of files) {
    const raw = readFileSync(join(srcDir, f), "utf8");
    // preset.yml has no placeholders but goes through the same pipe for the
    // BOM/encoding check; render() is a no-op there.
    rendered.set(f, f.endsWith(".yml") ? render(raw) : raw);
  }
  // Refuse to write a file that still contains an unresolved token.
  for (const [f, text] of rendered) {
    const leftover = text.match(/%%[A-Za-z][\w]*%%/g);
    if (leftover !== null) {
      console.error(`install-presets: ${f} still holds ${leftover.join(", ")} - pass --set for each or fix the template`);
      process.exit(1);
    }
  }
  if (opt["dry-run"]) {
    console.log("  dry-run: nothing written");
    continue;
  }
  if (existsSync(target)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const bak = join(backupRoot, stamp, name);
    mkdirSync(dirname(bak), { recursive: true });
    cpSync(target, bak, { recursive: true });
    console.log(`  existing preset backed up to ${bak}`);
  }
  mkdirSync(target, { recursive: true });
  for (const [f, text] of rendered) {
    writeFileSync(join(target, f), text, "utf8");
    console.log(`  wrote ${f}`);
    wrote++;
  }
}
console.log(`\ndone (${wrote} files).`);
console.log("next: 1) restart / hot-reload DSH to mount the presets; 2) pick the preset per session;");
console.log("3) set this plugin's defaultShell (Settings -> General) to the SAME terminal the preset anchors.");
if (chosen.includes("standard-win-payload")) {
  console.log("and for standard-win-payload: enablePosixPayload: true in cordis.patch.yml (restart),");
  console.log("then flip the 'POSIX payload' row switch (shellPayload) on the settings page - opt-in twice.");
}
if (Object.keys(sets).length === 0) {
  console.log("note: no --set was passed, so machine-specific sentences (python path) were dropped;");
  console.log("re-run with --set pythonPath=<path> later if you want them in the prompt.");
}
console.log("tip: the dsh-preset-doctor plugin keeps these presets mountable across host");
console.log("versions (auto-realign + per-row switches in each preset card) - worth installing.");
