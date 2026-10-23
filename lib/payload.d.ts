/** npm package name of OUR POSIX runtime repack (optionalDependency-style; absent = simply no payload). */
export declare const PAYLOAD_PACKAGE = "@drscrewdriver/posix-runtime-win32-x64";
/** Trust record written next to a provisioned payload root by scripts/provision-payload.mjs. */
export declare const TRUST_FILE_NAME = "payload.trust.json";
/** Files every payload root must expose for verification, normalized to forward slashes, lowercase. */
export declare const REQUIRED_FILES: readonly string[];
/** One pinned payload build = one digest map. Keyed by the `posix-*` label. */
export type DigestMap = Record<string, string>;
/**
 * Built-in ledger, keyed by payload build label. Populated by
 * `provision-payload.mjs --emit-ledger` at release time (V-flow). EMPTY on a
 * fresh checkout by design: with no ledger entry, a root is only usable if the
 * operator's local trust file pins it - which is an explicit human act, the
 * same posture as `dsh-ops provision-shells` but self-managed.
 */
export declare const PAYLOAD_LEDGER: Readonly<Record<string, DigestMap>>;
export type PayloadVerdict = {
    readonly ok: true;
    readonly bashPath: string;
    readonly source: "ledger" | "trust";
} | {
    readonly ok: false;
    readonly reason: string;
};
/** The OS face this module needs; tests substitute a table-driven fake. */
export interface PayloadProbe {
    exists(path: string): boolean;
    read(path: string): Buffer | undefined;
    /** `size|mtimeMs` fingerprint for the hash cache, or undefined when unstatable. */
    stamp(path: string): string | undefined;
    readdir(dir: string): string[];
    /** Directory holding `package.json` of PAYLOAD_PACKAGE, if installed. */
    resolvePackageRoot(): string | undefined;
    /**
     * WSL distro probe: names of installed distros, or undefined when the probe
     * cannot answer (undefined is NOT "no distro" - absence needs a positive
     * empty list, same three-valued rule as the browser catalog's distros fact).
     */
    wslDistros(): readonly string[] | undefined;
}
/** Environment directory carrying auto-discovered payload roots. */
export declare function payloadStoreDir(env?: NodeJS.ProcessEnv): string | undefined;
/** sha256 hex of one file, memoized on (size, mtimeMs); undefined when unreadable. */
export declare function hashFile(path: string, probe?: PayloadProbe): string | undefined;
/** Test/backdoor: drop the memo (a payload replaced in place must re-verify). */
export declare function clearHashCache(): void;
/**
 * Verify one payload root: both REQUIRED_FILES exist, their digests match the
 * built-in ledger OR the root-local trust file. Everything else fails closed.
 */
export declare function verifyPayloadRoot(root: string, probe?: PayloadProbe): PayloadVerdict;
/** Candidate payload roots in preference order: explicit path, npm package, store dir. */
export declare function findPayloadRoots(config: {
    payloadBashPath?: string;
}, probe?: PayloadProbe, env?: NodeJS.ProcessEnv): string[];
export interface PayloadOutcome {
    /** True only when a verified payload bash was selected. */
    readonly engaged: boolean;
    readonly bashPath?: string;
    /** True when a WSL distro was positively detected - advisory, not a veto. */
    readonly wslPreferred?: boolean;
    /** One-shot human-readable notes for the plugin log. */
    readonly notes: readonly string[];
}
/**
 * The whole decision table for one startup. Call ONLY when the payload feature
 * is enabled; the caller wires the resulting `bashPath` into the gitbash slot
 * of `resolveAllPaths` as the last-resort source.
 */
export declare function resolvePayloadBash(config: {
    payloadBashPath?: string;
}, probe?: PayloadProbe, env?: NodeJS.ProcessEnv): PayloadOutcome;
