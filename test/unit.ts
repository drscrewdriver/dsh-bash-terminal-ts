
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildArgv, buildEnv, candidateGitBashPaths, candidateMsys2Paths, candidatePwshPaths, internals } from "../lib/index.js";
const { renderResult, resolveAllPaths, validateArgs, toolDescription, SHELL_DESCRIPTIONS } = internals;
import assert from "node:assert";
import { findPayloadRoots, resolvePayloadBash, verifyPayloadRoot, clearHashCache, TRUST_FILE_NAME } from "../lib/payload.js";

const paths = { pwsh: "C:\\pwsh.exe", gitbash: "C:\\Git\\bin\\bash.exe", msys2: "C:\\msys64\\usr\\bin\\bash.exe", wsl: "C:\\Windows\\System32\\wsl.exe" };
assert.deepStrictEqual(buildArgv("powershell", "echo hi", paths), ["C:\\pwsh.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "echo hi"]);
assert.deepStrictEqual(buildArgv("gitbash", "ls", paths), ["C:\\Git\\bin\\bash.exe", "-lc", "ls"]);
// msys2 must use -lc: /etc/profile is what puts /usr/bin and /mingw64/bin on PATH.
assert.deepStrictEqual(buildArgv("msys2", "ls", paths), ["C:\\msys64\\usr\\bin\\bash.exe", "-lc", "ls"]);
assert.deepStrictEqual(buildArgv("wsl", "pwd", paths, undefined), ["C:\\Windows\\System32\\wsl.exe", "-e", "bash", "-lc", "pwd"]);
assert.deepStrictEqual(buildArgv("wsl", "pwd", paths, "Ubuntu"), ["C:\\Windows\\System32\\wsl.exe", "-d", "Ubuntu", "-e", "bash", "-lc", "pwd"]);
assert.throws(() => buildArgv("fish", "x", paths));

const env = buildEnv("gitbash", { DSH_WEB_URL: "http://127.0.0.1:3080" });
assert.strictEqual(env.DSH_WEB_URL, "http://127.0.0.1:3080");
assert.strictEqual(env.NO_COLOR, "1");
// msys2 selects the MINGW64 environment so /mingw64/bin (gcc, make) joins PATH.
assert.strictEqual(buildEnv("msys2", undefined).MSYSTEM, "MINGW64");
assert.strictEqual(buildEnv("msys2", { DSH_WEB_URL: "http://x" }).MSYSTEM, "MINGW64");
// An explicitly supplied MSYSTEM always wins.
assert.strictEqual(buildEnv("msys2", { MSYSTEM: "UCRT64" }).MSYSTEM, "UCRT64");
assert.strictEqual(buildEnv("msys2", { MSYSTEM: "CLANG64" }).MSYSTEM, "CLANG64");
// ...and the default never leaks into the other backends.
assert.strictEqual(buildEnv("gitbash", undefined).MSYSTEM, undefined);
assert.strictEqual(buildEnv("powershell", undefined).MSYSTEM, undefined);
// WSLENV is WSL's allow-list, so the host's value must be LAYERED ONTO, never
// rebuilt from dshEnv alone. The inherited value is passed explicitly so these
// assertions do not depend on the ambient environment (this host really has
// WSLENV set, Windows Terminal exports WT_SESSION:WT_PROFILE_ID:).
const INHERITED = "WT_SESSION:WT_PROFILE_ID:";
const wslEnv = buildEnv("wsl", { DSH_WEB_URL: "http://x", DSH_TEST: "1" }, INHERITED);
assert.ok(wslEnv.WSLENV!.includes("DSH_WEB_URL"), "dsh key listed: " + wslEnv.WSLENV);
assert.ok(wslEnv.WSLENV!.includes("DSH_TEST"), "dsh key listed: " + wslEnv.WSLENV);
assert.ok(wslEnv.WSLENV!.includes("WT_SESSION"), "inherited WSLENV entries preserved: " + wslEnv.WSLENV);
assert.ok(wslEnv.WSLENV!.includes("WT_PROFILE_ID"), "inherited WSLENV entries preserved: " + wslEnv.WSLENV);
assert.strictEqual(wslEnv.WSLENV, "WT_SESSION:WT_PROFILE_ID:DSH_WEB_URL:DSH_TEST", "layered, in order");
assert.ok(!wslEnv.WSLENV!.includes("::"), "no empty WSLENV entry from the inherited trailing colon: " + wslEnv.WSLENV);
assert.ok(!wslEnv.WSLENV!.endsWith(":"), "no trailing separator: " + wslEnv.WSLENV);
assert.ok(!wslEnv.WSLENV!.split(":").includes("WSLENV"), "WSLENV itself is never appended: " + wslEnv.WSLENV);
// An explicit caller-supplied WSLENV wins over the inherited one.
assert.strictEqual(buildEnv("wsl", { DSH_WEB_URL: "http://x", WSLENV: "CALLER_ONLY" }, INHERITED).WSLENV, "CALLER_ONLY:DSH_WEB_URL", "declared WSLENV wins");
assert.strictEqual(buildEnv("wsl", { WSLENV: "CALLER_ONLY" }, INHERITED).WSLENV, "CALLER_ONLY", "declared WSLENV alone is kept");
// No inherited value and no declared value -> exactly the DSH keys. An explicit
// `undefined` would re-trigger the default parameter (JS semantics: defaults fire
// on undefined), so opting out of inheritance means passing the empty string.
assert.strictEqual(buildEnv("wsl", { DSH_WEB_URL: "http://x" }, "").WSLENV, "DSH_WEB_URL", "empty inherited base");
assert.ok(buildEnv("wsl", { DSH_WEB_URL: "http://x" }).WSLENV!.includes("DSH_WEB_URL"), "default base is the ambient WSLENV");
assert.strictEqual(buildEnv("wsl", undefined, INHERITED).WSLENV, undefined, "no dsh keys -> WSLENV untouched");
// msys2 must not grow a WSLENV.
assert.strictEqual(buildEnv("msys2", { DSH_WEB_URL: "http://x" }, INHERITED).WSLENV, undefined, "WSLENV is wsl-only");

assert.strictEqual(renderResult({ stdout: { text: "hello", truncated: false }, stderr: { text: "", truncated: false }, exitCode: 0, signal: null, timedOut: false, timeoutMs: 1000 }), "hello");
assert.ok(renderResult({ stdout: { text: "out", truncated: false }, stderr: { text: "err", truncated: false }, exitCode: 3, signal: null, timedOut: false, timeoutMs: 1000 }).includes("[stderr]"));
assert.ok(renderResult({ stdout: { text: "out", truncated: false }, stderr: { text: "", truncated: false }, exitCode: 3, signal: null, timedOut: false, timeoutMs: 1000 }).includes("[exit code: 3]"));
assert.ok(renderResult({ stdout: { text: "", truncated: false }, stderr: { text: "", truncated: false }, exitCode: 0, signal: null, timedOut: true, timeoutMs: 5000 }).includes("[timed out after 5000ms]"));

const real = resolveAllPaths({}, process.env);
console.log("resolved paths:", JSON.stringify(real));
assert.ok(real.pwsh, "pwsh should resolve");
assert.ok(real.gitbash && real.gitbash.toLowerCase().includes("git"), "gitbash should resolve: " + real.gitbash);
assert.ok(real.wsl, "wsl should resolve");
// The msys2 backend must never resolve to msys2.exe: the console-allocating
// Cygwin launcher returns exit 0 with ZERO bytes on both streams under piped
// stdio, so every command would silently produce no output.
if (real.msys2 !== undefined) {
  assert.ok(real.msys2.toLowerCase().endsWith("bash.exe"), "msys2 must resolve to bash.exe, not msys2.exe: " + real.msys2);
  assert.ok(!real.msys2.toLowerCase().endsWith("msys2.exe"), "msys2.exe must never win resolution: " + real.msys2);
}

const cgb = candidateGitBashPaths({ ...process.env, PATH: "C:\\Windows\\System32;C:\\Program Files\\Git\\bin" });
assert.ok(!cgb.some((p) => p.toLowerCase().includes("system32")), "system32 bash excluded");

// candidateMsys2Paths: a real bash.exe always outranks the msys2.exe fallback.
const cmz = candidateMsys2Paths({ ...process.env, PATH: "C:\\msys64\\usr\\bin;C:\\msys64\\mingw64\\bin" });
assert.ok(cmz.length > 0, "msys2 candidates produced");
assert.ok(cmz[0].toLowerCase().endsWith("bash.exe"), "first msys2 candidate is a bash.exe: " + cmz[0]);
assert.ok(/usr[\\/]bin[\\/]bash\.exe$/i.test(cmz[0]), "first candidate is the usr\\bin\\bash.exe: " + cmz[0]);
const firstMsys2Exe = cmz.findIndex((p) => p.toLowerCase().endsWith("msys2.exe"));
const lastBashExe = cmz.reduce((acc, p, i) => (p.toLowerCase().endsWith("bash.exe") ? i : acc), -1);
assert.ok(firstMsys2Exe !== -1, "msys2.exe kept as last-resort fallback");
assert.ok(lastBashExe !== -1, "bash.exe candidates present");
assert.ok(lastBashExe < firstMsys2Exe, `every bash.exe must precede msys2.exe (lastBash=${lastBashExe}, firstExe=${firstMsys2Exe}): ${JSON.stringify(cmz)}`);
assert.ok(cmz.some((p) => /mingw64/i.test(p)), "MINGW64 PATH bash.exe entries are considered");

// Live smoke test: the ported backend must actually RETURN OUTPUT. A 0-byte
// stdout here is the msys2.exe dead end this port exists to avoid.
if (real.msys2 !== undefined && real.msys2.toLowerCase().endsWith("bash.exe")) {
  const smokeArgv = buildArgv("msys2", "echo MSYS2_OK; command -v gcc make bash; echo MSYSTEM=$MSYSTEM", real as never);
  const smoke = spawnSync(smokeArgv[0] as string, smokeArgv.slice(1) as string[], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: { ...process.env, ...buildEnv("msys2", undefined) } as NodeJS.ProcessEnv,
    timeout: 30000
  });
  const smokeOut = smoke.stdout ?? "";
  console.log("msys2 smoke stdout:", JSON.stringify(smokeOut.trim()));
  assert.strictEqual(smoke.status, 0, "msys2 smoke command exits 0 (stderr: " + (smoke.stderr ?? "").trim() + ")");
  assert.ok(smokeOut.trim().length > 0, "msys2 smoke stdout must not be empty");
  assert.ok(smokeOut.includes("MSYS2_OK"), "msys2 smoke prints the marker");
  assert.ok(smokeOut.includes("MSYSTEM=MINGW64"), "msys2 env carries MSYSTEM=MINGW64");
  assert.ok(smokeOut.includes("/usr/bin/bash"), "login-shell PATH exposes /usr/bin: " + JSON.stringify(smokeOut));
  // gcc is only present when the MSYS2 install has the mingw64 toolchain; when
  // it resolves at all it must come from /mingw64/bin (i.e. MSYSTEM=MINGW64
  // took effect through /etc/profile).
  if (smokeOut.includes("gcc")) {
    assert.ok(smokeOut.includes("/mingw64/bin/gcc"), "gcc resolves under /mingw64/bin: " + JSON.stringify(smokeOut));
  } else {
    console.log("NOTE: no gcc in this MSYS2 install; skipping the /mingw64/bin/gcc assertion");
  }
} else {
  console.log("NOTE: msys2 backend not installed; skipping the live smoke assertion");
}

// candidatePwshPaths is exercised for parity with the JS baseline.
assert.ok(candidatePwshPaths({}).length > 0, "pwsh candidates produced");

validateArgs({ command: "ls", description: "list" });
assert.throws(() => validateArgs({ command: "  ", description: "x" }));
// shell is user-settings controlled: a stale shell arg must be tolerated
validateArgs({ command: "ls", description: "x", shell: "fish" });
assert.throws(() => validateArgs({ command: "ls", description: "x", timeoutMs: -5 }));

// ---- backend-aware tool description -----------------------------------------

// Every backend is covered by its own lead sentence.
assert.deepStrictEqual(Object.keys(SHELL_DESCRIPTIONS).sort(), ["gitbash", "msys2", "payload", "powershell", "wsl"]);
// The payload backend has its own lead too, and it names the digest gate.
const payloadDesc = toolDescription(true, "payload");
assert.ok(payloadDesc.includes("POSIX runtime payload"), "payload lead names the backend: " + payloadDesc);
assert.ok(payloadDesc.includes("is payload"), "payload names the active backend");

// gitbash -> bash-flavored description; the active backend is named up front.
const gitDesc = toolDescription(true, "gitbash");
assert.ok(gitDesc.includes("bash -lc"), "gitbash lead mentions bash -lc: " + gitDesc);
assert.ok(gitDesc.includes("POSIX syntax"), "gitbash lead mentions POSIX");
assert.ok(gitDesc.includes("The user's chosen default terminal (Settings -> General -> Default terminal) is gitbash"), "gitbash names the active backend");
assert.ok(gitDesc.includes("Git Bash"), "gitbash mentions Git Bash unconfined");
assert.ok(gitDesc.includes("run unconfined"), "gitbash description advertises unconfined execution");

// msys2 -> MSYS2 bash-flavored description; the lead names bash -lc, not msys2.exe.
const msysDesc = toolDescription(true, "msys2");
assert.ok(msysDesc.includes("MSYS2 bash -lc"), "msys2 lead mentions MSYS2 bash -lc: " + msysDesc);
assert.ok(!msysDesc.includes("msys2.exe"), "msys2 lead never advertises the msys2.exe dead end");
assert.ok(msysDesc.includes("POSIX syntax"), "msys2 lead mentions POSIX");
assert.ok(msysDesc.includes("is msys2"), "msys2 names the active backend");
assert.ok(msysDesc.includes("MSYS2"), "msys2 description names MSYS2 in the sandbox sentence");

// powershell -> PowerShell-flavored description.
const psDesc = toolDescription(true, "powershell");
assert.ok(psDesc.includes("pwsh -NoLogo -NoProfile -NonInteractive -Command"), "powershell lead mentions pwsh argv");
assert.ok(psDesc.includes("PowerShell syntax"), "powershell lead mentions PowerShell");
assert.ok(psDesc.includes("is powershell"), "powershell names the active backend");

// wsl -> Linux-bash-flavored description.
const wslDesc = toolDescription(true, "wsl");
assert.ok(wslDesc.includes("wsl [-d <distro>] -e bash -lc"), "wsl lead mentions wsl argv");
assert.ok(wslDesc.includes("/mnt/"), "wsl lead mentions /mnt/ paths");
assert.ok(wslDesc.includes("is wsl"), "wsl names the active backend");

// Shared tail: fresh shell, exit codes, background controls.
for (const desc of [gitDesc, msysDesc, psDesc, wslDesc]) {
  assert.ok(desc.includes("spawns a fresh shell"), "shared fresh-shell tail");
  assert.ok(desc.includes("[exit code: N]"), "shared exit-code tail");
  assert.ok(desc.includes("run_in_background: true"), "background advertised when enabled");
  assert.ok(desc.includes("under the DSH sandbox"), "sandbox honored in description");
  assert.ok(!desc.includes("outside the DSH sandbox"), "no stale outside-sandbox claim");
}
assert.ok(!toolDescription(false, "gitbash").includes("run_in_background"), "background hidden when disabled");

// Unknown backend falls back to the default lead without throwing.
assert.ok(toolDescription(true, "fish").includes("is powershell"), "unknown backend falls back to default");

// ---- pinned backup bash payload (src/payload.ts) ----------------------------
// Fake probe: paths are case/backslash normalized like the real fs helpers,
// stamps carry the content length so a "changed" file re-hashes (the real
// stamp is size|mtime and the cache must invalidate on both).
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const norm = (p: string) => p.replaceAll("\\", "/").toLowerCase();
function fakeProbe(files: Record<string, string>, opts: { distros?: readonly string[]; pkgRoot?: string } = {}) {
  const map = new Map(Object.entries(files).map(([k, v]) => [norm(k), v]));
  const keys = [...map.keys()];
  return {
    // A path exists when it is a known file OR a prefix directory of one.
    exists: (p: string) => { const n = norm(p); return map.has(n) || keys.some((k) => k.startsWith(n + "/")); },
    read: (p: string) => { const v = map.get(norm(p)); return v === undefined ? undefined : Buffer.from(v); },
    stamp: (p: string) => { const v = map.get(norm(p)); return v === undefined ? undefined : `${v.length}|1`; },
    readdir: (d: string) => {
      const prefix = norm(d) + "/";
      const out = new Set<string>();
      for (const k of map.keys()) if (k.startsWith(prefix)) out.add(k.slice(prefix.length).split("/")[0]!);
      return [...out];
    },
    resolvePackageRoot: () => opts.pkgRoot,
    wslDistros: () => opts.distros,
  };
}
const ROOT = "C:/payloads/bash-2.56";
const BASH = `${ROOT}/bin/bash.exe`;
const DLL = `${ROOT}/usr/bin/msys-2.0.dll`;
const TRUST = `${ROOT}/${TRUST_FILE_NAME}`;
const reasonOf = (v: { ok: boolean; reason?: string } | { ok: boolean; bashPath: string }): string =>
  (v as { reason?: string }).reason ?? "";
const runtime = { [BASH]: "BASHBIN", [DLL]: "MSYSDLL" };

// No trust file, empty ledger: the digest is UNKNOWN - fail closed, never run.
clearHashCache();
assert.ok(!verifyPayloadRoot(ROOT, fakeProbe(runtime) as never).ok, "unpinned payload must not verify");
assert.ok(reasonOf(verifyPayloadRoot(ROOT, fakeProbe(runtime) as never)).startsWith("digest-unknown"));

// Missing required file: missing-files, also closed.
const noDll = { [BASH]: "BASHBIN" };
assert.ok(reasonOf(verifyPayloadRoot(ROOT, fakeProbe(noDll) as never)).startsWith("missing-files"));

// Operator trust file pinning the exact digests: usable, source "trust".
const trustOk = { ...runtime, [TRUST]: JSON.stringify({
  schema: 1,
  files: { "bin/bash.exe": sha("BASHBIN"), "usr/bin/msys-2.0.dll": sha("MSYSDLL") }
}) };
clearHashCache();
const vOk = verifyPayloadRoot(ROOT, fakeProbe(trustOk) as never);
assert.equal(vOk.ok, true);
assert.equal((vOk as { source?: string }).source, "trust");
assert.ok(String((vOk as { bashPath?: string }).bashPath).toLowerCase().endsWith("bash.exe"));

// Drifted binary vs pinned digest: mismatch, closed (this is the tampered /
// silently-upgraded payload case the whole gate exists for).
const drifted = { ...runtime, [DLL]: "MSYSDLL2" };
const trustDrift = { ...drifted, [TRUST]: trustOk[TRUST] };
clearHashCache();
assert.ok(reasonOf(verifyPayloadRoot(ROOT, fakeProbe(trustDrift) as never)).startsWith("digest-mismatch"));

// A trust file that does not pin EVERY required file is not an approval.
const trustPartial = { ...runtime, [TRUST]: JSON.stringify({ files: { "bin/bash.exe": sha("BASHBIN") } }) };
clearHashCache();
assert.ok(!verifyPayloadRoot(ROOT, fakeProbe(trustPartial) as never).ok, "partial trust file must not unlock the gate");

// findPayloadRoots: an explicit .../bin/bash.exe maps to its runtime ROOT two levels up.
const roots = findPayloadRoots({ payloadBashPath: BASH }, fakeProbe(runtime) as never, {});
assert.ok(roots.some((r) => norm(r) === norm(ROOT)), `explicit bash.exe mapped to root: ${JSON.stringify(roots)}`);
// The npm package root and store-dir children are discovered too. The store
// dir is <LOCALAPPDATA>\dsh-bash-terminal-ts\payloads - the fake tree mirrors
// that full layout, not a bare LOCALAPPDATA.
const STORE_CHILD = "C:/la/dsh-bash-terminal-ts/payloads/bash-2.56";
const withStore = {
  ...runtime, [TRUST]: trustOk[TRUST],
  [`${STORE_CHILD}/bin/bash.exe`]: "BASHBIN",
  [`${STORE_CHILD}/usr/bin/msys-2.0.dll`]: "MSYSDLL"
};
const r2 = findPayloadRoots({ payloadBashPath: "" }, fakeProbe(withStore, { pkgRoot: "C:/node_modules/x/@drscrewdriver/posix-runtime-win32-x64" }) as never, { LOCALAPPDATA: "C:/la" } as NodeJS.ProcessEnv);
assert.ok(r2.some((r) => norm(r).includes("posix-runtime-win32-x64")), "package root discovered");
assert.ok(r2.some((r) => norm(r) === norm(STORE_CHILD)), `store dir child with bin/bash.exe discovered: ${JSON.stringify(r2)}`);

// resolvePayloadBash decision table:
// (a) WSL distro positively present -> ADVISORY note, but a verified payload
//     still engages (the official menu lists both; our picker must not be
//     stricter than the host's).
clearHashCache();
const a = resolvePayloadBash({ payloadBashPath: BASH }, fakeProbe(withStore, { distros: ["Ubuntu"] }) as never, {});
assert.equal(a.engaged, true, "WSL presence is a hint, not a veto");
assert.ok(a.notes.some((n) => n.includes("WSL distro")), `wsl-preference advisory note: ${JSON.stringify(a.notes)}`);
assert.ok(a.notes.some((n) => n.includes("hint, not a gate")), "the note says so explicitly");
// (b) WSL cannot answer (undefined) -> not evidence of absence either way; a
//     verified root may engage.
const b = resolvePayloadBash({ payloadBashPath: BASH }, fakeProbe(withStore, { distros: undefined }) as never, {});
assert.equal(b.engaged, true);
// (c) no roots at all -> closed with a provisioning hint.
const c = resolvePayloadBash({ payloadBashPath: "" }, fakeProbe({}, {}) as never, {});
assert.equal(c.engaged, false);
assert.ok(c.notes.some((n) => n.includes("no payload root")));
// (d) root present but unpinned -> closed, NOT silently run.
const d = resolvePayloadBash({ payloadBashPath: BASH }, fakeProbe(runtime, { distros: [] }) as never, {});
assert.equal(d.engaged, false);
assert.ok(d.notes.some((n) => n.includes("digest gate")));

// resolveAllPaths wiring: the payload is its OWN slot - it never substitutes
// for gitbash (a "Git Bash" row must name a shell the machine actually has),
// and an explicit config path still wins its own slot.
const bareEnv = { ProgramFiles: "Z:\\none", SystemRoot: "C:\\Windows", PATH: "", LOCALAPPDATA: "" } as unknown as NodeJS.ProcessEnv;
const p1 = resolveAllPaths({}, bareEnv, "C:\\payload\\bin\\bash.exe");
assert.equal(p1.gitbash, undefined, "gitbash stays absent when the machine has no Git Bash");
assert.equal(p1.payload, "C:\\payload\\bin\\bash.exe", "payload fills its own slot");
const p2 = resolveAllPaths({ gitBashPath: "C:\\Git\\bin\\bash.exe" }, bareEnv, "C:\\payload\\bin\\bash.exe");
assert.equal(p2.gitbash, "C:\\Git\\bin\\bash.exe", "an explicit gitbash config keeps its own slot");
assert.equal(p2.payload, "C:\\payload\\bin\\bash.exe", "and the payload still fills its own");
assert.equal(buildArgv("payload", "ls", {})[0], undefined, "payload argv without a path yields an undefined executable (caller fails closed)");
assert.deepEqual(buildArgv("payload", "ls", { payload: "C:\\p\\bin\\bash.exe" }), ["C:\\p\\bin\\bash.exe", "-lc", "ls"]);

console.log("ALL UNIT TESTS PASSED");
