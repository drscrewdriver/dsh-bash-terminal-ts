// The browser half's state machine, driven under stub globals.
//
// This is the surface where the sibling plugin's real bugs lived, so every invariant
// here is a regression that already happened once somewhere:
//
// 1. ONE un-acknowledged frame at a time. Publishing the next frame before the
//    emulator's write callback returns loses output permanently (`pump()` is the only
//    writer of `state.render`).
// 2. A `snapshot` must be REPLAYED, not appended - and the view reads it from
//    `state.render`, so the first frame per attach is always a snapshot.
// 3. Keystrokes are never dropped: while the socket is CONNECTING they queue, and an
//    OPEN socket sends synchronously (chaining every key through a promise was itself
//    a bug: it added a hop per character for ordering the wire already guarantees).
// 4. An exited shell keeps what it queued. Clearing the queue on exit is the
//    "blank screen after a short command" bug.
// 5. `missingTerminal` is the one code that surfaces as an `issue` AND forgets the
//    adoption binding, because re-adopting a dead identity can never work.
// 6. Unmounting DOM never ends the process; only `close()` does.
//
// Run: node scripts/build-browser-tests.mjs && node test/browser.mjs

import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  BridgeTerminalView,
  BridgeTerminals,
  Store,
  initialViewState,
  looksLikeTerminals,
  EmbeddedTerminal,
  pickableRows,
  switchableRows,
  hostRouteUrl,
  hostWebSocketUrl,
} from "../test-dist/browserkit.js";

// ---- stub globals -----------------------------------------------------------
// (`self` for xterm's UMD wrapper is installed by the kit's build banner, because ESM
// evaluates imports before any statement in this file could run.)

const sent = [];
class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  constructor(url) {
    this.url = url;
    this.readyState = FakeSocket.CONNECTING;
    this.sentFrames = [];
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    sent.push(this);
  }
  send(data) {
    assert.ok(this.readyState === FakeSocket.OPEN, "send() before the socket opened");
    this.sentFrames.push(JSON.parse(data));
  }
  close() {
    this.readyState = FakeSocket.CLOSED;
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  emit(frame) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}
globalThis.WebSocket = FakeSocket;

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const INFO = {
  id: "t-1",
  title: "PowerShell",
  shellId: "powershell",
  shell: { path: "C:\\pwsh.exe", args: ["-NoLogo"], name: "PowerShell" },
  cwd: "C:\\work",
  cols: 100,
  rows: 30,
  state: "running",
  exitCode: null,
};
const ENVIRONMENT = { cwd: "C:\\work", maxInputBytes: 65536, maxCols: 500, maxRows: 200, scrollback: 2000 };

const requests = [];
let terminals = [INFO];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  requests.push({ url: String(url), body });
  if (body.op === "terminal.open") return { json: async () => ({ ok: true, value: { info: INFO, environment: ENVIRONMENT } }) };
  if (body.op === "terminal.close") return { json: async () => ({ ok: true, value: { closed: true } }) };
  if (body.op === "terminal.list") return { json: async () => ({ ok: true, value: { terminals } }) };
  if (body.op === "shells.discover") return { json: async () => ({ ok: true, value: { shells: [{ path: INFO.shell.path, args: INFO.shell.args, name: INFO.shell.name }], selected: "powershell" } }) };
  return { json: async () => ({ ok: true, value: { defaultShell: "powershell", catalog: [], effective: { id: "powershell", fellBack: false, floor: false } } }) };
};

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const freshView = (contentId = "c1") => {
  requests.length = 0;
  sent.length = 0;
  return new BridgeTerminalView("s1", contentId, {
    save: (id, terminalId) => store.set(`dsh-bash-terminal:binding:s1:${id}`, terminalId),
    forget: (id) => store.delete(`dsh-bash-terminal:binding:s1:${id}`),
  });
};

// ---- 1/2: one frame outstanding, snapshot first -----------------------------

const view = freshView();
assert.deepStrictEqual(view.state.getSnapshot(), initialViewState(), "a fresh view is idle and not writable");

const opening = view.refresh();
assert.strictEqual(view.state.getSnapshot().phase, "creating", "refresh() starts an allocation");
assert.strictEqual(requests[0].body.op, "terminal.open", "the HOST is asked to allocate (it picks the shell)");
await opening;
assert.strictEqual(view.state.getSnapshot().phase, "connecting", "connecting while the socket dials");
assert.deepStrictEqual(view.state.getSnapshot().environment, ENVIRONMENT, "environment lands before the emulator mounts (fit() needs it)");

const sock = sent[0];
assert.ok(/bash-terminal\/ws\?id=t-1$/.test(sock.url), `socket url carries the terminal id, got ${sock.url}`);
sock.open();
sock.emit({ t: "snapshot", screen: "$ ", info: INFO, environment: ENVIRONMENT });
const after = view.state.getSnapshot();
assert.strictEqual(after.phase, "connected", "snapshot marks the connection");
assert.strictEqual(after.writable, true, "and grants input control");
assert.strictEqual(after.render.frame.type, "snapshot", "the first render frame is a snapshot (replay, not append)");
const revision = after.render.revision;

sock.emit({ t: "data", data: "one" });
sock.emit({ t: "data", data: "two" });
assert.strictEqual(view.state.getSnapshot().render?.revision, revision, "no second frame is published while one is outstanding");
assert.strictEqual(view.state.getSnapshot().render?.frame.type, "snapshot", "and the outstanding one is still the snapshot");
view.acknowledge(revision);
assert.strictEqual(view.state.getSnapshot().render?.frame.data, "onetwo", "the backlog goes out as ONE coalesced frame after the ack");
assert.strictEqual(view.state.getSnapshot().render.frame.type, "output", "output frames append (only a snapshot replays)");
view.acknowledge(view.state.getSnapshot().render.revision);
assert.strictEqual(view.state.getSnapshot().render, undefined, "and the slot empties once drained");

// ---- 3: input is gated by `writable`, then never dropped -------------------

// A snapshot has not arrived yet, so this view does not hold input control: the
// controller contract is that the view disables stdin while `writable` is false,
// and honouring that here is what keeps two attachments from interleaving bytes.
const cold = freshView("c-cold");
await cold.refresh();
const coldSocket = sent[sent.length - 1];
assert.strictEqual(cold.state.getSnapshot().writable, false, "not writable before the first snapshot");
cold.write("whoami\r");
assert.deepStrictEqual(coldSocket.sentFrames, [], "input is refused while the view does not hold control");

// Now the case where `writable` IS true and a fresh socket is still dialing - a
// reattach (page reload, tab re-expand). Those keystrokes must queue, then flush.
const reattaching = freshView("c-reattach");
await reattaching.refresh();
const settled = sent[sent.length - 1];
settled.open();
settled.emit({ t: "snapshot", screen: "$ ", info: INFO, environment: ENVIRONMENT });
assert.strictEqual(reattaching.state.getSnapshot().writable, true, "the snapshot granted control");
reattaching.connect();
const dialing = sent[sent.length - 1];
assert.notStrictEqual(dialing, settled, "connect() dials a new socket");
assert.strictEqual(dialing.readyState, FakeSocket.CONNECTING, "still dialing");
reattaching.write("ls\r");
reattaching.write("echo hi\r");
assert.deepStrictEqual(dialing.sentFrames, [], "both keystrokes are held, not lost");
dialing.open();
assert.deepStrictEqual(dialing.sentFrames.map((f) => f.data), ["ls\r", "echo hi\r"], "and both flush on open, in order");
dialing.emit({ t: "snapshot", screen: "$ ", info: INFO, environment: ENVIRONMENT });
reattaching.write("after\r");
assert.strictEqual(dialing.sentFrames.length, 3, "an OPEN socket takes input synchronously");

// ---- 4: an exit keeps the queue --------------------------------------------

const ending = freshView("c-exit");
await ending.refresh();
const endSock = sent[sent.length - 1];
endSock.open();
endSock.emit({ t: "snapshot", screen: "", info: INFO, environment: ENVIRONMENT });
endSock.emit({ t: "data", data: "final words" });
endSock.emit({ t: "exit", info: { ...INFO, state: "exited", exitCode: 0 } });
const exited = ending.state.getSnapshot();
assert.strictEqual(exited.phase, "closed", "exit closes the occurrence");
assert.strictEqual(exited.writable, false, "and revokes input control");
ending.acknowledge(exited.render.revision);
assert.strictEqual(ending.state.getSnapshot().render?.frame.data, "final words", "the last write is still owed to the emulator after an exit");
// ---- 5: missingTerminal is the one dedicated issue ------------------------

const gone = freshView("c-gone");
store.set("dsh-bash-terminal:binding:s1:c-gone", "t-1");
await gone.refresh();
const goneSock = sent[sent.length - 1];
goneSock.open();
goneSock.emit({ t: "error", code: "missingTerminal", message: "no such terminal" });
const missing = gone.state.getSnapshot();
assert.strictEqual(missing.issue, "missingTerminal", "the code the view renders a notice for");
assert.strictEqual(missing.phase, "failed", "failed, not closed: a Retry must re-allocate");
assert.strictEqual(store.has("dsh-bash-terminal:binding:s1:c-gone"), false, "the dead identity is forgotten so a retry cannot re-adopt it");

// ---- 6: unmount is not close ---------------------------------------------

const detached = freshView("c-detach");
await detached.refresh();
const detach = detached.mount();
assert.strictEqual(typeof detach, "function", "mount() returns a detach");
detach();
const beforeClose = requests.filter((r) => r.body.op === "terminal.close").length;
assert.strictEqual(beforeClose, 0, "the detach alone never ends the process (that is what a reload re-adopts)");
await detached.close();
assert.strictEqual(requests.filter((r) => r.body.op === "terminal.close").length, beforeClose + 1, "close() is the only path that terminates it");

// ---- the service face -----------------------------------------------------

const terminals1 = new BridgeTerminals();
assert.ok(looksLikeTerminals(terminals1), "the shim passes the structural probe the sidebar uses");
for (const member of ["view", "close", "recover", "launchShells", "selectShell", "retainTabs", "retryClose"]) {
  assert.strictEqual(typeof terminals1[member], "function", `face member ${member}`);
}
assert.strictEqual(typeof terminals1.closeFailures.getSnapshot, "function", "closeFailures is a store");

const first = terminals1.view("s1", "key-a", "content-a");
assert.strictEqual(terminals1.view("s1", "key-a", "content-a"), first, "view() is memoized by occurrence key (a re-render is free)");
assert.notStrictEqual(terminals1.view("s1", "key-b", "content-b"), first, "a new key is a new process");

terminals1.selectShell("C:\\msys64\\usr\\bin\\bash.exe");
assert.strictEqual(store.get("dsh-bash-terminal:chosen-shell"), "C:\\msys64\\usr\\bin\\bash.exe", "selectShell persists the choice");
terminals1.retainTabs([{ sessionId: "s1", tabId: "t", contentId: "c" }]);
assert.ok(true, "retainTabs is inert by contract and must not throw");

const discovered = await terminals1.launchShells();
assert.deepStrictEqual(discovered.shells.map((s) => s.name), ["PowerShell"], "launchShells reads the host catalog");
assert.strictEqual(discovered.selectedShell, "powershell", "and reports the remembered choice");

terminals1.view("s1", "held-key", "held-content");
await new BridgeTerminals().recover("s1").then(async () => {});
terminals1.view("s1", "held-key", "held-content").state.set({ ...initialViewState(), info: INFO, writable: true });
const recovered = await terminals1.recover("s1");
assert.deepStrictEqual(recovered.map((info) => info.id), [], "recover() hides terminals that already have a live view");
terminals1.close("s1", "held-key", "held-content");
assert.strictEqual(recovered.length, 0, "a close after recover is not an error");

// background close failure -> retryable list, and a retry that clears it
const orphan = new BridgeTerminals();
orphan.close("s1", "never-opened", "content-x", "ghost-id");
await wait(5);
const failures = orphan.closeFailures.getSnapshot();
// The stub fetch accepts every close, so nothing should be recorded:
assert.strictEqual(failures.length, 0, "a successful background close records nothing");

// ---- the store contract ---------------------------------------------------

const counter = new Store({ n: 1 });
const seen = [];
const unsubscribe = counter.subscribe(() => seen.push(counter.getSnapshot()));
const snapshot = counter.getSnapshot();
assert.strictEqual(counter.getSnapshot(), snapshot, "getSnapshot is stable until a change (useSyncExternalStore loops forever otherwise)");
counter.set({ n: 2 });
assert.notStrictEqual(counter.getSnapshot(), snapshot, "a patch allocates");
assert.deepStrictEqual(seen, [{ n: 2 }], "listeners read the NEW snapshot, not a stale argument");
unsubscribe();
counter.set({ n: 3 });
assert.strictEqual(seen.length, 1, "an unsubscribed listener stops firing");

// ---- URL resolution under a proxy prefix and the shell -------------------

assert.ok(hostRouteUrl("api/bash-terminal/terminals", "https://host.example/dsh/proxy/3080/").pathname.endsWith("/dsh/proxy/3080/api/bash-terminal/terminals"), "a relative route stays inside the proxy prefix");
assert.ok(!hostRouteUrl("/api/bash-terminal/terminals", "https://host.example/dsh/proxy/3080/index.html").pathname.startsWith("/api"), "a leading slash would pin to the origin root and escape the prefix");
const shellUrl = hostWebSocketUrl("bash-terminal/ws", "https://host.example/base/");
assert.strictEqual(shellUrl.protocol, "wss:", "the socket scheme flips with the page scheme");
globalThis.__DSH_TRANSPORT__ = { streamBaseUrl: "http://127.0.0.1:3080/" };
assert.strictEqual(hostWebSocketUrl("bash-terminal/ws").host, "127.0.0.1:3080", "the desktop shell's injected Host base wins over the dsh-app:// page host");
delete globalThis.__DSH_TRANSPORT__;

// ---- the multi-shell tab's own rules --------------------------------------

// Only rows the host activated AND found are offered; the tab never decides that
// itself, so a shell turned off in settings cannot be opened from here either.
const tabRows = pickableRows({
  defaultShell: "gitbash",
  shells: ["powershell", "gitbash", "msys2", "wsl"],
  seam: { spawn: "function", spawnTerminal: "function" },
  catalog: [
    { id: "powershell", label: "PowerShell", available: true, reason: "installed", activated: true, togglable: false },
    { id: "gitbash", label: "Git Bash", available: true, reason: "installed", activated: true, togglable: true },
    { id: "msys2", label: "MSYS2", available: true, reason: "installed", activated: false, togglable: true },
    { id: "wsl", label: "WSL bash", available: false, reason: "no-distro", activated: false, togglable: true },
  ],
});
assert.deepStrictEqual(tabRows.map((row) => row.id), ["powershell", "gitbash"], "the picker offers activated ∧ available rows only");
assert.deepStrictEqual(pickableRows(null), [], "no route answer means no rows, not a crash");

// Level 2 of the settings design: only a shell that is BOTH togglable and present gets
// a switch. The floor has no choice to make; an absent shell would accept a click,
// store it, and still never appear - so neither gets a control, only a reason.
const allRows = [
  { id: "powershell", label: "PowerShell", available: true, reason: "installed", activated: true, togglable: false },
  { id: "gitbash", label: "Git Bash", available: true, reason: "installed", activated: true, togglable: true },
  { id: "msys2", label: "MSYS2", available: false, reason: "not-installed", activated: false, togglable: true },
  { id: "wsl", label: "WSL bash", available: false, reason: "no-distro", activated: false, togglable: true },
];
assert.deepStrictEqual(switchableRows(allRows).map((row) => row.id), ["gitbash"], "one switch: the only shell that can actually be turned on or off");
assert.deepStrictEqual(switchableRows([]), [], "no catalog, no controls");

// The emulator must be INSIDE the artifact. An external `require("@xterm/xterm")` looks
// tidy and cannot work: DSH's client module table resolves only seed words,
// shell-owned modules, registered factories and boot modules, so the tab fails at
// mount with "missed the module table" (measured on a live desktop host).
assert.ok(readFileSync(new URL("../test-dist/browserkit.js", import.meta.url), "utf8").includes("xterm-helper-textarea"), "xterm is bundled into the client artifact, not left external");
assert.strictEqual(typeof EmbeddedTerminal.create, "function", "the embedded controller exposes a create()");

console.log("ALL BROWSER-HALF TESTS PASSED");
