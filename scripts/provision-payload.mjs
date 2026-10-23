#!/usr/bin/env node
// scripts/provision-payload.mjs - operator-side provisioning of the pinned
// backup POSIX runtime payload for dsh-bash-terminal-ts.
//
// Naming: the artifact is OUR `posix-runtime` package - by policy our names
// never carry the bash/gitbash/msys tokens (bare `bash` on Windows belongs to
// the WSL forwarder's namespace; dsh-ops ships bash-*/msys-named payloads).
// The tree inside is the Git-for-Windows runtime, unmodified - upstream facts
// keep upstream file names.
//
// What this does: takes a LOCAL Git for Windows PortableGit SFX (or an already
// extracted runtime directory), unpacks/accepts it, checks the runtime is real
// (`bash --version`), computes SHA-256 of the two files the plugin's digest
// gate reads (`bin/bash.exe`, `usr/bin/msys-2.0.dll`), and writes
// `payload.trust.json` next to the root. From then on the plugin may run THAT
// exact binary and nothing else: unknown or drifted digests fail closed.
//
// What this deliberately does NOT do:
//   - no downloads. The archive must exist on this machine (`--from`). We
//     repack upstream ourselves; we never consume dsh-ops's payload packages.
//   - no PATH / system changes. The payload lives under %LOCALAPPDATA% (or
//     wherever --into says) and is reachable only through the plugin.
//   - no silent promotion. Writing the trust file IS the human approval step;
//     --emit-ledger only prints a snippet, turning a local trust into a
//     shipped ledger entry stays a release-time code change.
//
// Usage:
//   node scripts/provision-payload.mjs --from "E:\dl\PortableGit-2.56.0.2-64-bit.7z.exe"
//   node scripts/provision-payload.mjs --from "D:\PortableGit" [--into <dir>] [--pack <dir>] [--emit-ledger] [--label <name>]
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync,
  statSync, writeFileSync
} from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ensurePayloadAlias, payloadAliasPaths } from "./payload-alias.mjs";

const REQUIRED = [
  ["bin/bash.exe", "bin/bash.exe"],
  ["usr/bin/msys-2.0.dll", "usr/bin/msys-2.0.dll"]
];

const { values: opt } = parseArgs({
  options: {
    from: { type: "string" },
    into: { type: "string" },
    label: { type: "string" },
    pack: { type: "string" },
    "emit-ledger": { type: "boolean", default: false },
    help: { type: "boolean", default: false }
  }
});

if (opt.help || !opt.from) {
  console.log(`usage: node scripts/provision-payload.mjs --from <PortableGit sfx | extracted dir>
                  [--into <payload root>] [--label <build label>]
                  [--pack <staging dir>] [--emit-ledger]`);
  process.exit(opt.help ? 0 : 2);
}

const from = resolve(opt.from);
if (!existsSync(from)) fail(`--from does not exist: ${from}`);

function fail(msg) {
  console.error(`provision-payload: ${msg}`);
  process.exit(1);
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// ---- 1. obtain a runtime root --------------------------------------------------

let root;
let sourceKind;
const st = statSync(from);
if (st.isFile()) {
  // 7-Zip SFX used by Git for Windows PortableGit: `-y -o<dir>` extracts, overwrite-all.
  const target = opt.into ? resolve(opt.into) : defaultStoreDir();
  if (target && existsSync(join(target, "bin", "bash.exe"))) {
    console.log(`payload root already unpacked at ${target}; re-verifying digests only (delete it to re-extract)`);
    root = target;
    sourceKind = "pre-extracted";
  } else {
    mkdirSync(target, { recursive: true });
    console.log(`extracting ${from} -> ${target} ...`);
    const r = spawnSync(from, ["-y", `-o${target}`], { windowsHide: true, stdio: "inherit" });
    if (r.error !== undefined || (r.status !== 0 && r.status !== 1 && r.status !== 2)) {
      fail(`SFX extraction failed (status=${r.status}, error=${r.error?.message ?? "none"})`);
    }
    if (!existsSync(join(target, "bin", "bash.exe"))) fail(`extraction produced no bin/bash.exe under ${target}`);
    root = target;
    sourceKind = "sfx";
  }
} else if (st.isDirectory()) {
  root = from;
  sourceKind = "directory";
  if (opt.into) {
    // Copying a ~350 MB tree is the operator's explicit choice, never a side effect.
    const target = resolve(opt.into);
    if (!existsSync(join(target, "bin", "bash.exe"))) {
      fail(`--into ${target} is not a populated runtime directory; copying a payload tree is not automated here. Extract the SFX into it or point --into at an existing root.`);
    }
    root = target;
  }
} else {
  fail(`--from must be an SFX file or a directory, got: ${from}`);
}

// ---- 2. the runtime must be real -------------------------------------------------

const bashPath = join(root, "bin", "bash.exe");
const dllPath = join(root, "usr", "bin", "msys-2.0.dll");
for (const p of [bashPath, dllPath]) {
  if (!existsSync(p)) fail(`payload root is missing ${p}`);
}
const ver = spawnSync(bashPath, ["--version"], { encoding: "utf8", timeout: 15000, windowsHide: true });
if (ver.error !== undefined || ver.status !== 0) {
  fail(`bin/bash.exe --version failed (status=${ver.status}, error=${ver.error?.message ?? "none"})`);
}
const versionLine = String(ver.stdout ?? "").split(/\r?\n/)[0] ?? "";
const bashVersion = /version\s+(\S+)-release/.exec(versionLine)?.[1] ?? "unknown";
console.log(`verified bash ${bashVersion} at ${bashPath}`);

// ---- 3. digests + trust file ------------------------------------------------------

const files = {};
for (const [, rel] of REQUIRED) files[rel] = sha256(join(root, rel.replaceAll("/", "\\")));
const label = opt.label ?? `posix-${bashVersion}-${new Date().toISOString().slice(0, 10)}`;
const trustPath = join(root, "payload.trust.json");
const trust = {
  schema: 1,
  label,
  bashVersion,
  files,
  source: { kind: sourceKind, path: from },
  provisionedAt: new Date().toISOString(),
  note: "operator-provisioned payload for dsh-bash-terminal-ts; digests pinned here are the ONLY version this plugin will run"
};
writeFileSync(trustPath, JSON.stringify(trust, null, 2) + "\n", "utf8");
console.log(`trust record written: ${trustPath}`);

// The official right-sidebar menu entry (hard link + stable junction). Only
// reached after the runtime verified real, so the link can never point at an
// unverified binary.
{
  const paths = payloadAliasPaths(process.env);
  if (paths !== undefined) {
    const done = ensurePayloadAlias({ root, junction: paths.junction });
    if (done.skipped !== undefined) console.log(`NOTE: payload menu alias incomplete: ${done.skipped}`);
    else console.log(`menu alias ready: ${paths.candidate}`);
  }
}

// ---- 4. optional self-managed npm package ------------------------------------------

if (opt.pack) {
  const staging = resolve(opt.pack);
  mkdirSync(staging, { recursive: true });
  const pkgDir = join(staging, "@drscrewdriver", "posix-runtime-win32-x64");
  mkdirSync(pkgDir, { recursive: true });
  // The WHOLE runtime tree travels, not just bin+usr: bash resolves its POSIX
  // root as <dir-of>/bin/../usr and sources <root>/etc/profile (`-lc` without
  // etc is a PATH-less shell). We regenerate the trust/provenance/package.json
  // ourselves, so copies of them inside the root are skipped.
  const SKIP = new Set(["payload.trust.json", "provenance.json", "package.json"]);
  for (const name of readdirSync(root)) {
    if (SKIP.has(name.toLowerCase())) continue;
    const s = join(root, name);
    const ist = statSync(s);
    if (ist.isDirectory()) cpTree(s, join(pkgDir, name));
    else if (ist.isFile()) copyFileSync(s, join(pkgDir, name));
  }
  const provenance = {
    label,
    upstream: "Git for Windows runtime tree, repacked by us unmodified - NOT dsh-ops's payload package",
    source: trust.source,
    bashVersion,
    files,
    packedAt: new Date().toISOString()
  };
  writeFileSync(join(pkgDir, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n", "utf8");
  writeFileSync(join(pkgDir, "payload.trust.json"), JSON.stringify(trust, null, 2) + "\n", "utf8");
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify({
    name: "@drscrewdriver/posix-runtime-win32-x64",
    version: "0.1.0",
    description: `Pinned POSIX runtime payload (Git-for-Windows tree) for dsh-bash-terminal-ts (win32-x64, bash ${bashVersion}). Contents: the upstream tree plus provenance/trust records; licenses travel with it.`,
    os: ["win32"],
    cpu: ["x64"],
    license: "SEE LICENSE IN LICENSE.txt",
    publishConfig: { registry: "https://registry.npmjs.org", access: "public" },
    dsh: { payload: { kind: "posix", bashVersion, label, digests: files } }
  }, null, 2) + "\n", "utf8");
  console.log(`package tree staged at ${pkgDir} (npm pack/publish is a separate, registry-pinned release step)`);
}

// ---- 5. ledger snippet --------------------------------------------------------------

if (opt["emit-ledger"]) {
  console.log("\n// drop into src/payload.ts PAYLOAD_LEDGER (release-time edit, then rebuild):\n");
  console.log(`  ${JSON.stringify(label)}: ${JSON.stringify(files)},`);
}

console.log(`\ndone. enable in the plugin config:  enablePosixPayload: true${opt.into ? "" : `  (root: ${root})`}`);

// ---- helpers ------------------------------------------------------------------------

function defaultStoreDir() {
  const local = process.env.LOCALAPPDATA;
  if (!local) fail("no --into given and %LOCALAPPDATA% is unset - pass --into explicitly");
  const versionTag = bashVersionTagGuess();
  return join(local, "dsh-bash-terminal-ts", "payloads", `posix-${versionTag}`);
}

function bashVersionTagGuess() {
  // Before extraction we only have the archive name; fall back to a date tag.
  const m = /(\d+\.\d+\.\d+(?:\.\d+)?)/.exec(from);
  return m ? m[1] : new Date().toISOString().slice(0, 10);
}

function cpTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    const ist = statSync(s);
    if (ist.isDirectory()) cpTree(s, d);
    else if (ist.isFile()) copyFileSync(s, d);
  }
}
