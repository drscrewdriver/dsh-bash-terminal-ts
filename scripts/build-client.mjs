// Build the browser client bundle for dsh-bash-terminal-ts.
// Output: lib/client.js (primary, consumed by DSH loader/reload precheck) and
// dist/client.js (legacy compatibility) — a __ModuleLoader__.load({ id, factory })
// wrapper around the esbuild CJS bundle; shared deps (react, @deepseek-ai/*)
// resolve through the loader's require.

import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
mkdirSync(join(root, "dist"), { recursive: true });
mkdirSync(join(root, "lib"), { recursive: true });

// xterm is BUNDLED, not external. Measured on a live desktop host: the client module
// table resolves only platform seed words, shell-owned modules, registered package
// factories and boot modules - a plugin asking for `@xterm/xterm` gets
// "missed the module table" and the tab dies at mount. dsh-better-sidebar works around
// the same limit with its own chunk loader (it fetches a plugin-owned script that
// registers on a private global registry); copying that machinery for one dependency is
// not worth it, so the emulator ships inside this bundle and the only thing resolved at
// runtime is the platform's own react/jsx-runtime.

await build({
  entryPoints: [join(root, "src", "client.tsx")],
  bundle: true,
  format: "cjs",
  platform: "browser",
  outfile: join(root, "dist", "client.core.js"),
  external: ["react", "react/jsx-runtime", "react-dom", "@deepseek-ai/*"],
  loader: { ".css": "text" },
  jsx: "automatic",
  // Pin the TS options instead of letting esbuild discover a tsconfig by walking
  // up from the entry point: an in-repo build found the repo-root tsconfig.json
  // (emitting a leading "use strict";) while the same source built from an
  // out-of-repo worktree did not — two different committed artifacts for one
  // source. These are the values that tsconfig actually supplied, so behavior is
  // unchanged; only the stray line disappears.
  tsconfigRaw: { compilerOptions: { target: "ES2022", useDefineForClassFields: true } },
  logLevel: "warning"
});

const core = readFileSync(join(root, "dist", "client.core.js"), "utf8");
const wrapper = `window.__ModuleLoader__.load({
	id: "dsh-bash-terminal-ts",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
${core}
		return module.exports;
	}
});
`;
writeFileSync(join(root, "lib", "client.js"), wrapper);
writeFileSync(join(root, "dist", "client.js"), wrapper);
console.log("built lib/client.js + dist/client.js (" + wrapper.length + " bytes)");
