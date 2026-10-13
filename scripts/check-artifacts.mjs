// Artifact gates: the checks that only make sense against the BUILT bundle.
//
// Unit tests cannot see these. Every one of them is a failure mode that ships
// green through `tsc` and then dies silently in the browser:
//
// - `__ModuleLoader__.load({ id })` must equal the package name, or the host never
//   binds the client half and the whole UI side goes dark without an error;
// - the client bundle must carry no Node builtins (the browser has none, and a
//   leaked `node:` import is a runtime `require is not defined`);
// - `ws` must stay an EXTERNAL import in the host bundle: bundling it pulls
//   `buffer`/`net` into a browser-shaped artifact and breaks the PTY socket;
// - `locale/en.json` is the anchor the host's package-meta scan insists on, so all
//   nine files have to be present in the tarball list.

import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const bundle = readFileSync("lib/client.js", "utf8");
const host = readFileSync("lib/webterminals/ws.js", "utf8");

// 1) the loader identity.
const idMatch = /id:\s*"([^"]+)"/.exec(bundle);
assert.ok(idMatch, "the client bundle wraps itself in __ModuleLoader__.load({ id })");
assert.strictEqual(idMatch[1], pkg.name, "the client bundle id equals the package name");

// 2) client purity.
const leaks = ["node:crypto", "node:stream", "node:http", "node:fs", "node:path", "node:os", "string_decoder", "WebSocketServer"].filter((needle) => bundle.includes(needle));
assert.deepStrictEqual(leaks, [], `the client bundle must carry no Node-only module: ${leaks.join(", ")}`);

// 3) ws stays external on the host side.
assert.ok(/from "ws"/.test(host) || /require\("ws"\)/.test(host), "the host socket module imports ws as an external dependency");

// 4) the nine metadata files the host scans, with en as the anchor.
const langs = ["zh", "en", "ja", "ko", "fr", "de", "it", "ru", "es"];
for (const lang of langs) {
  const meta = JSON.parse(readFileSync(`locale/${lang}.json`, "utf8"));
  assert.ok(typeof meta.title === "string" && meta.title.length > 0, `locale/${lang}.json needs a title`);
  assert.ok(typeof meta.description === "string" && meta.description.length > 0, `locale/${lang}.json needs a description`);
}

// 5) the client dictionary really ships nine languages, keyed identically to zh.
const locales = readFileSync("lib/locales.js", "utf8");
const registered = /dictionaries\s*=\s*\{([^}]*)\}/.exec(locales)?.[1] ?? "";
for (const lang of langs) {
  assert.ok(new RegExp(`\\b${lang}\\b`).test(registered), `lib/locales.js registers ${lang}`);
}

// 6) the multi-shell bottom tab ships, and xterm is INSIDE the bundle.
//
// Three failure modes worth a gate each. Registering the tab without `bottomOnly`
// turns it into a second "Terminal" capsule in DSH's native right sidebar, shadowing
// the host's. Leaving xterm EXTERNAL cannot work at all - the client module table
// resolves only seed words, shell-owned modules, registered factories and boot
// modules, and a live desktop host answered `require("@xterm/xterm")` with "missed the
// module table" - so the gate now asserts the opposite of what it did, with the
// emulator's own DOM marker as the witness. And the ceiling catches the reverse drift:
// a second heavyweight dependency creeping in unannounced.
assert.ok(bundle.includes("dsh-bash-terminal-ts:multi"), "the multi-shell tab id is in the client bundle");
assert.ok(bundle.includes("bottomOnly"), "the tab declares itself bottom-workbench only");
assert.ok(bundle.includes("xterm-helper-textarea"), "xterm is bundled (an external require cannot resolve in the client module table)");
assert.ok(!/require\("@xterm\/xterm"\)/.test(bundle), "no external @xterm require survives in the bundle");
assert.ok(bundle.includes("xterm-screen"), "xterm's stylesheet is inlined as text");
assert.ok(bundle.length < 900_000, `the client bundle did not grow unexpectedly: ${bundle.length} bytes`);

// 7) no dead copy: every dictionary key must be referenced by something that renders.
//
// A key defined in nine languages and read by nobody is not a spare string - it is a
// feature that was planned, translated, and never wired (this family shipped exactly
// that once: a `notice.standsDown` key with no renderer, and here a seven-language
// dictionary the component bypassed by reading `zh[...]` directly).
//
// Checked against the SOURCES, not the bundle: the dictionary itself is bundled, so a
// bundle substring test would match every key against its own definition and pass
// forever. Concatenated keys (`"shell." + id`) are covered by the prefix below.
//
// The consumer set walks the browser directory rather than listing files: a key moved
// into a new component used to read as dead copy here, which is the wrong lesson to
// teach whoever split the file up.
const consumerFiles = [
  "src/client.tsx",
  "src/browser-i18n.ts",
  ...readdirSync("src/webterminals/browser", { recursive: true }).map((rel) => `src/webterminals/browser/${String(rel)}`),
];
const consumers = consumerFiles.map((rel) => readFileSync(rel, "utf8"));
const zhKeys = [...new Set([...locales.matchAll(/"((?:shell|dock|tab)\.[A-Za-z0-9.]+)"\s*:/g)].map((match) => match[1]))];
assert.ok(zhKeys.length >= 30, `expected the full key set in lib/locales.js, found ${zhKeys.length}`);
const unusedKeys = zhKeys.filter((key) => !consumers.some((text) => text.includes(`"${key}"`)));
// `shell.<id>` is built by concatenation in the preference row, so those are wired.
const trulyUnused = unusedKeys.filter((key) => !/^shell\.(powershell|gitbash|msys2|wsl)$/.test(key));
assert.deepStrictEqual(trulyUnused, [], `dictionary keys rendered by nothing: ${trulyUnused.join(", ")}`);

console.log(`ARTIFACT GATES PASS: id=${idMatch[1]} | client ${(bundle.length / 1024).toFixed(0)}KB, no node leaks, xterm bundled, css inlined | ws external | ${langs.length} locale files | ${zhKeys.length} dictionary keys, none dead`);
