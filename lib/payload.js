// dsh-bash-terminal-ts: the pinned backup POSIX runtime payload - discovery
// plus a fail-closed digest gate.
//
// Naming policy (operator decision, 2026-10): OUR artifacts never carry the
// tokens `bash`, `gitbash` or `msys` - the bare name `bash` on Windows is the
// WSL forwarder's territory, and dsh-ops ships `@dsh-ops/bash-*`/msys-named
// payloads we must not shadow or be confused with. The runtime inside the
// payload still IS Git-for-Windows (its binary is literally bash.exe - an
// upstream fact, not our name); our namespace is `posix-runtime`.
//
// Why this exists: the plugin otherwise runs whatever Git Bash / MSYS2 the
// machine happens to have, at whatever version the package manager left it at.
// dsh-ops solved that by carrying its own pinned payload and refusing to run
// anything whose digest it had not verified. We absorb the SEMANTICS (only an
// executor whose SHA-256 is in a ledger we control may run), not the shipping
// form: nothing is downloaded at install, no binary rides in the main tarball.
// The payload is provisioned by the operator through
// `scripts/provision-payload.mjs`, which reverse-unpacks a LOCAL PortableGit
// SFX (our own repack of the upstream runtime - we never consume dsh-ops's
// packages), records the digests, and drops a `payload.trust.json` beside it.
//
// The gate (fail-closed, on purpose):
//   - a root whose `bin/bash.exe` + `usr/bin/msys-2.0.dll` digests match the
//     embedded ledger or the local trust file is USABLE;
//   - anything else - unreadable, missing, unknown digest, mismatch after a
//     "was fine" state - is NOT. We never run an unverified bash, and we never
//     silently fall through to one: the reason surfaces as a note the plugin
//     logs once at startup. This matters MORE for us than for a confined
//     runner: MSYS bash cannot be wrapped by the DSH ACL restricted-token
//     sandbox (CreateFileMapping error 5), so digest verification is the only
//     security layer between us and the binary.
//
// The WSL preference rule (revised 2026-10 same day): a real WSL bash IS the
// better POSIX shell, but once the payload became a first-class backend with a
// double opt-in (operator gate + row switch), a hard veto made our own picker
// stricter than the host's official menu, which lists bash-terminal.exe right
// next to WSL's bash. So now: a detected WSL distro is an ADVISORY note, not a
// gate. The digest gate remains the only hard no.
//
// Purity: every OS touch goes through the `PayloadProbe` seam so the whole
// decision table is unit-testable without a payload on disk. The default probe
// is the real fs/spawn one; hash results are memoized on (size, mtimeMs) so a
// stable payload costs one re-read per change, per call.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
/** npm package name of OUR POSIX runtime repack (optionalDependency-style; absent = simply no payload). */
export const PAYLOAD_PACKAGE = "@drscrewdriver/posix-runtime-win32-x64";
/** Trust record written next to a provisioned payload root by scripts/provision-payload.mjs. */
export const TRUST_FILE_NAME = "payload.trust.json";
/** Files every payload root must expose for verification, normalized to forward slashes, lowercase. */
export const REQUIRED_FILES = ["bin/bash.exe", "usr/bin/msys-2.0.dll"];
/**
 * Built-in ledger, keyed by payload build label. Populated by
 * `provision-payload.mjs --emit-ledger` at release time (V-flow). EMPTY on a
 * fresh checkout by design: with no ledger entry, a root is only usable if the
 * operator's local trust file pins it - which is an explicit human act, the
 * same posture as `dsh-ops provision-shells` but self-managed.
 */
export const PAYLOAD_LEDGER = {};
/** Environment directory carrying auto-discovered payload roots. */
export function payloadStoreDir(env = process.env) {
    const localAppData = env.LOCALAPPDATA;
    if (typeof localAppData !== "string" || localAppData.trim().length === 0)
        return undefined;
    return join(localAppData, "dsh-bash-terminal-ts", "payloads");
}
// ---- default probe (real fs / wsl) --------------------------------------------
const defaultProbe = {
    exists: (p) => {
        try {
            return existsSync(p);
        }
        catch {
            return false;
        }
    },
    read: (p) => {
        try {
            return readFileSync(p);
        }
        catch {
            return undefined;
        }
    },
    stamp: (p) => {
        try {
            const st = statSync(p);
            return `${st.size}|${st.mtimeMs}`;
        }
        catch {
            return undefined;
        }
    },
    readdir: (d) => {
        try {
            return readdirSync(d);
        }
        catch {
            return [];
        }
    },
    resolvePackageRoot: () => {
        try {
            const req = createRequire(import.meta.url);
            return dirname(req.resolve(`${PAYLOAD_PACKAGE}/package.json`));
        }
        catch {
            return undefined;
        }
    },
    wslDistros: () => {
        try {
            // The child_process face is loaded lazily so importers that never touch
            // the default probe (browser-side graphs, pure unit tests with an
            // injected probe) do not pull it in; spawnSync with a short timeout:
            // `wsl -l -q` is fast when WSL is present and hangs (or errors) when it
            // is a stub, which is exactly the "cannot answer" case.
            const { spawnSync } = require_child_process();
            // wsl.exe writes UTF-16LE (measured: "Ubuntu" arrives as U\0b\0u\0...),
            // so `encoding: "utf8"` would turn an EMPTY distro list into one
            // mojibake line - a false "WSL has a distro" that would veto the
            // payload on machines that have none. Read bytes and decode by shape:
            // NUL interleaving means UTF-16LE, everything else is ascii/utf8.
            const r = spawnSync("wsl.exe", ["-l", "-q"], { timeout: 5000, windowsHide: true });
            if (r.error !== undefined || r.status === null || !Buffer.isBuffer(r.stdout))
                return undefined;
            const raw = r.stdout;
            const text = raw.includes(0x00) ? raw.toString("utf16le") : raw.toString("utf8");
            const names = text.split(/\r?\n/).map((l) => l.replaceAll("\u0000", "").trim()).filter((l) => l.length > 0);
            return names;
        }
        catch {
            return undefined;
        }
    }
};
// Type-only import above, runtime require here: the module reference is erased
// at compile time, so the host graph stays free of a static child_process edge.
function require_child_process() {
    return createRequire(import.meta.url)("node:child_process");
}
// ---- hashing -------------------------------------------------------------------
const hashCache = new Map();
/** sha256 hex of one file, memoized on (size, mtimeMs); undefined when unreadable. */
export function hashFile(path, probe = defaultProbe) {
    const stamp = probe.stamp(path);
    if (stamp === undefined)
        return undefined;
    const hit = hashCache.get(path);
    if (hit !== undefined && hit.stamp === stamp)
        return hit.sha;
    const buf = probe.read(path);
    if (buf === undefined)
        return undefined;
    const sha = createHash("sha256").update(buf).digest("hex");
    hashCache.set(path, { stamp, sha });
    return sha;
}
/** Test/backdoor: drop the memo (a payload replaced in place must re-verify). */
export function clearHashCache() {
    hashCache.clear();
}
// ---- verification ----------------------------------------------------------------
function normalizeRel(p) {
    return p.replaceAll("\\", "/").toLowerCase();
}
function digestMapsMatch(actual, pinned) {
    const keys = Object.keys(pinned);
    if (keys.length === 0)
        return false;
    return keys.every((k) => {
        const want = pinned[k];
        const got = actual[normalizeRel(k)];
        return typeof want === "string" && typeof got === "string" && want.toLowerCase() === got;
    });
}
/**
 * Verify one payload root: both REQUIRED_FILES exist, their digests match the
 * built-in ledger OR the root-local trust file. Everything else fails closed.
 */
export function verifyPayloadRoot(root, probe = defaultProbe) {
    const bashPath = join(root, "bin", "bash.exe");
    const dllPath = join(root, "usr", "bin", "msys-2.0.dll");
    if (!probe.exists(root))
        return { ok: false, reason: `missing-root:${root}` };
    if (!probe.exists(bashPath) || !probe.exists(dllPath)) {
        return { ok: false, reason: `missing-files:${root}` };
    }
    const actual = {
        "bin/bash.exe": hashFile(bashPath, probe),
        "usr/bin/msys-2.0.dll": hashFile(dllPath, probe)
    };
    if (Object.values(actual).some((v) => v === undefined)) {
        return { ok: false, reason: `unreadable:${root}` };
    }
    for (const pinned of Object.values(PAYLOAD_LEDGER)) {
        if (digestMapsMatch(actual, pinned))
            return { ok: true, bashPath, source: "ledger" };
    }
    const trustRaw = probe.read(join(root, TRUST_FILE_NAME));
    if (trustRaw !== undefined) {
        let trust;
        try {
            trust = JSON.parse(trustRaw.toString("utf8"));
        }
        catch {
            return { ok: false, reason: `trust-unparsed:${root}` };
        }
        const files = trust.files;
        if (files !== null && typeof files === "object") {
            const map = {};
            for (const [k, v] of Object.entries(files)) {
                if (typeof v === "string")
                    map[normalizeRel(k)] = v.toLowerCase();
            }
            // The trust file must pin EVERY required file, or it does not constitute
            // an approval of the executor we are about to run.
            if (REQUIRED_FILES.every((f) => f in map) && digestMapsMatch(actual, map)) {
                return { ok: true, bashPath, source: "trust" };
            }
        }
        return { ok: false, reason: `digest-mismatch:${root}` };
    }
    return { ok: false, reason: `digest-unknown:${root}` };
}
// ---- root discovery ----------------------------------------------------------------
/** Candidate payload roots in preference order: explicit path, npm package, store dir. */
export function findPayloadRoots(config, probe = defaultProbe, env = process.env) {
    const roots = [];
    const push = (r) => {
        if (typeof r === "string" && r.trim().length > 0 && !roots.includes(r))
            roots.push(r);
    };
    const explicit = (config.payloadBashPath ?? "").trim();
    if (explicit.length > 0 && /bash\.exe$/i.test(explicit))
        push(dirname(dirname(explicit)));
    else if (explicit.length > 0)
        push(explicit); // a root directory is also honoured
    push(probe.resolvePackageRoot());
    const store = payloadStoreDir(env);
    if (store !== undefined) {
        for (const child of probe.readdir(store)) {
            const full = join(store, child);
            if (probe.exists(join(full, "bin", "bash.exe")))
                push(full);
        }
    }
    return roots;
}
/**
 * The whole decision table for one startup. Call ONLY when the payload feature
 * is enabled; the caller wires the resulting `bashPath` into the gitbash slot
 * of `resolveAllPaths` as the last-resort source.
 */
export function resolvePayloadBash(config, probe = defaultProbe, env = process.env) {
    const notes = [];
    const distros = probe.wslDistros();
    const wslPreferred = distros !== undefined && distros.length > 0;
    if (wslPreferred) {
        notes.push(`posix-payload: WSL distro(s) detected (${distros.slice(0, 3).join(", ")}) - a real WSL bash is usually the better POSIX shell, prefer the "wsl" backend when in doubt. The payload stays selectable; this is a hint, not a gate.`);
    }
    const roots = findPayloadRoots(config, probe, env);
    if (roots.length === 0) {
        notes.push("posix-payload: enabled but no payload root found (provision one with scripts/provision-payload.mjs or set payloadPosixPath).");
        return { engaged: false, wslPreferred, notes };
    }
    const failures = [];
    for (const root of roots) {
        const verdict = verifyPayloadRoot(root, probe);
        if (verdict.ok) {
            return { engaged: true, bashPath: verdict.bashPath, wslPreferred, notes };
        }
        failures.push(verdict.reason);
    }
    notes.push(`posix-payload: every candidate root failed the digest gate, fail-closed (not run): ${failures.join("; ")}`);
    return { engaged: false, wslPreferred, notes };
}
