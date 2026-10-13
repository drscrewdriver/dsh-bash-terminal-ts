// Bundle the browser half so the Node-side assert script can test it.
//
// Why esbuild and not tsc: the browser modules import each other extensionlessly
// (that is what `moduleResolution: Bundler` in tsconfig.client.json allows), and Node's
// ESM resolver refuses extensionless specifiers. Emitting per-file would produce JS that
// no runtime can load; bundling resolves the graph the same way the real client bundle
// does, so the test runs against the same module shapes the browser gets.

import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
mkdirSync(join(root, "test-dist"), { recursive: true });

await build({
  entryPoints: [join(root, "src", "webterminals", "browser", "testkit.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile: join(root, "test-dist", "browserkit.js"),
  // Bundled the same way the real client build bundles it: xterm comes along inside
  // the kit, so the test exercises the same module graph the browser loads (an
  // external here would be a different artifact from the shipped one), and the
  // stylesheet resolves to text.
  loader: { ".css": "text" },
  // The kit bundles xterm, whose UMD wrapper reads its global through `self` while it
  // is being evaluated. A statement in the test file cannot help: ESM evaluates the
  // imports first, so the shim has to be the first line of the bundle itself.
  banner: { js: "globalThis.self ??= globalThis;" },
  tsconfigRaw: { compilerOptions: { target: "ES2022", useDefineForClassFields: true } },
  logLevel: "warning",
});

console.log("built test-dist/browserkit.js");
