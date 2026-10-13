// A barrel that exposes the browser-only modules to the Node-side test bundle.
//
// The browser half is deliberately absent from the host tsconfig graph (it imports no
// Node builtins and reads `document`/`WebSocket`/`localStorage`), which also means no
// `lib/webterminals/browser/*.js` exists to import in an assert script. This file is
// the seam: `scripts/build-browser-tests.mjs` bundles it with esbuild into
// `test-dist/browserkit.js`, so `test/browser.mjs` can drive the REAL view state
// machine under stub globals instead of skipping it.
//
// It ships in `src/` on purpose - if a browser module gains a Node-only import, the
// client tsconfig graph fails here rather than at build time in someone's browser.

export { BridgeTerminalView } from "./view";
export { BridgeTerminals } from "./bridge";
export { Store } from "./store";
export { initialViewState, looksLikeTerminals } from "./face";
export { readConfig, post, terminalSocketUrl, writeDefaultShell } from "./api";
export { hostRouteUrl, hostWebSocketUrl, hostTransportBase } from "./url";
export { EmbeddedTerminal, pickableRows, switchableRows } from "./xterm";
export type { EmbeddedPhase } from "./xterm";
export type { TerminalViewState, WebTerminalsFace } from "./face";
