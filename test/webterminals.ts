// The browser terminal's host half: registry lifecycle, the route dispatch, and the
// two drift gates (route strings across the two halves, dual manifest versions).
//
// Why the lifecycle rules get their own assertions rather than trusting the port:
// each one is a user-visible contract copied from the host terminal controller -
// closing the TAB is the only thing that ends a process, an exited shell still
// holds its quota, a detached shell survives a reload. A silent change to any of
// them shows up as "my terminal vanished" or "I cannot open another one".

import assert from "node:assert";
import { PassThrough } from "node:stream";
import { readFileSync } from "node:fs";
import { UiTerminalError, UiTerminalRegistry } from "../lib/webterminals/registry.js";
import { WS_PATH } from "../lib/webterminals/ws.js";
import { TERMINAL_API_PATH, registerUiTerminalRoutes } from "../lib/webterminals/host.js";
import { apply } from "../lib/index.js";
import { buildCatalog, uiEnv } from "../lib/shells.js";

const PATHS = {
  pwsh: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
  gitbash: "C:\\Program Files\\Git\\bin\\bash.exe",
  msys2: "C:\\msys64\\usr\\bin\\bash.exe",
  wsl: "C:\\Windows\\System32\\wsl.exe",
};

/** A fake PTY: a stream you can write into, plus a kill you can trigger. */
function fakeHandle(opts: { resizeAble?: boolean; signalAble?: boolean; pid?: number } = {}) {
  const output = new PassThrough();
  let resolveDone: (value: { exitCode: number | null; signal?: string | null }) => void = () => {};
  const handle: Record<string, unknown> = {
    pid: opts.pid ?? 4242,
    output,
    done: new Promise((resolve) => { resolveDone = resolve; }),
    writes: [] as string[],
    resizes: [] as Array<[number, number]>,
    signals: [] as string[],
    terminated: false,
    write(data: string) { (handle.writes as string[]).push(data); },
    signalForeground(signal: string) { (handle.signals as string[]).push(signal); },
    terminate: async () => { handle.terminated = true; resolveDone({ exitCode: 0, signal: null }); },
    exit(exitCode = 0) { resolveDone({ exitCode, signal: null }); },
  };
  if (opts.resizeAble !== false) {
    handle.resize = (cols: number, rows: number) => { (handle.resizes as Array<[number, number]>).push([cols, rows]); };
  }
  if (opts.signalAble === false) delete handle.signalForeground;
  return handle as unknown as FakeHandle & { exit(code?: number): void };
}

type FakeHandle = {
  pid: number;
  output: PassThrough;
  done: Promise<{ exitCode: number | null }>;
  write(data: string): void;
  terminate(): Promise<void>;
};

const baseInput = {
  sessionId: "s1",
  cwd: "E:\\work",
  shellId: "powershell" as const,
  shellSpec: { path: PATHS.pwsh, args: ["-NoLogo"], name: "PowerShell" },
  title: "PowerShell",
  argv: [PATHS.pwsh, "-NoLogo"],
  env: { TERM: "xterm-256color" },
  cols: 80,
  rows: 24,
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---- registry lifecycle ------------------------------------------------------

{
  const handles: Record<string, unknown>[] = [];
  // A grace window is required to OBSERVE the exited-but-still-held rule: with
  // `idleGraceMs: 0` the reaper drops an ended shell at once, which is the correct
  // (and separately asserted) behaviour for an abandoned terminal.
  const registry = new UiTerminalRegistry({
    maxPerSession: 2,
    maxTotal: 3,
    idleGraceMs: 60_000,
    scrollback: 1024,
    spawn: async () => { const h = fakeHandle(); handles.push(h as never); return h as never; },
  });

  const first = await registry.open(baseInput);
  assert.strictEqual(first.state, "running", "a fresh terminal runs");
  assert.strictEqual(first.shell.name, "PowerShell", "the info carries the shell spec the browser shows");
  assert.strictEqual(registry.count("s1"), 1, "one held");

  // Adoption: the same identity returns the same terminal, never a second process.
  const adopted = await registry.open({ ...baseInput, terminalId: first.id });
  assert.strictEqual(adopted.id, first.id, "an existing identity is adopted");
  assert.strictEqual(registry.count("s1"), 1, "and costs no extra slot");

  await assert.rejects(() => registry.open({ ...baseInput, terminalId: "gone" }), (e: unknown) => e instanceof UiTerminalError && e.code === "missingTerminal", "an unknown identity is refused");

  const second = await registry.open({ ...baseInput, shellId: "gitbash" });
  await assert.rejects(() => registry.open({ ...baseInput }), (e: unknown) => e instanceof UiTerminalError && e.code === "terminalLimit", "the session quota is enforced");

  // An EXITED terminal still counts until it is closed (the controller's rule).
  (handles[1] as unknown as { exit(code?: number): void }).exit(0);
  await wait(5);
  // Read the LIVE entry, not the info object `open` returned: that snapshot says
  // 'running' because it was taken before the shell ended.
  assert.strictEqual(registry.get(second.id)!.state, "exited", "exit is recorded on the live entry");
  assert.strictEqual(registry.count("s1"), 2, "an exited terminal still holds its slot");
  await registry.close(second.id);
  assert.strictEqual(registry.count("s1"), 1, "close is what frees it");
  assert.strictEqual((handles[1] as unknown as { terminated: boolean }).terminated, true, "close terminates the process");

  // Ring replay and the screen a late attachment gets.
  const third = await registry.open({ ...baseInput, terminalId: first.id });
  const sink: { data: string[] } = { data: [] };
  const detach = registry.attach(third.id, { onData: (chunk) => sink.data.push(chunk), onExit: () => {} });
  (handles[0] as unknown as { output: PassThrough }).output.write("hello ");
  (handles[0] as unknown as { output: PassThrough }).output.write("world");
  await wait(40);
  assert.strictEqual(sink.data.join(""), "hello world", "output is delivered (coalesced)");
  assert.strictEqual(registry.screen(third.id), "hello world", "and lands in the replay ring");
  detach();
  await registry.dispose();
  assert.strictEqual(registry.count(), 0, "dispose ends everything");
}

{
  // resize reports the capability rather than assuming it; write caps are refused.
  const blind = fakeHandle({ resizeAble: false, signalAble: false });
  const registry = new UiTerminalRegistry({
    maxPerSession: 1, maxTotal: 1, idleGraceMs: 0, scrollback: 64,
    spawn: async () => blind as never,
  });
  const info = await registry.open(baseInput);
  assert.strictEqual(await registry.resize(info.id, 120, 40), false, "a backend without resize says so");
  await assert.rejects(() => registry.signal(info.id, "SIGINT"), /cannot signal/, "and a backend without signals says so");
  await assert.rejects(() => registry.write(info.id, "x".repeat(70 * 1024)), (e: unknown) => e instanceof UiTerminalError && e.code === "inputFull", "the per-frame input cap is refused, not truncated");
  await registry.dispose();
}

// ---- the route dispatch ------------------------------------------------------

/** A minimal fake response. */
function fakeRes() {
  const res = { status: 0, body: "" as string, headers: {} as Record<string, string> };
  (res as never as Record<string, unknown>).writeHead = (status: number, headers: Record<string, string>) => { res.status = status; res.headers = headers; };
  (res as never as Record<string, unknown>).end = (body: string) => { res.body = body; };
  return res;
}

/** A fake webserver that captures the route and lets the test drive the handler. */
function fakeServer(loopback: boolean) {
  const routes: Array<{ path: string; handler: (req: never, res: never) => Promise<void> | void }> = [];
  return {
    routes,
    webServer: {
      register: (route: { kind: string; path: string; handler: never }) => { routes.push(route as never); return () => {}; },
      // No registerUpgrade: the socket degradation path is what this test exercises.
    },
    request: () => ({ method: "POST", socket: { remoteAddress: loopback ? "127.0.0.1" : "10.0.0.9" } }),
  };
}

async function drive(route: { handler: (req: never, res: never) => Promise<void> | void }, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = fakeRes();
  const request = {
    method: "POST",
    socket: { remoteAddress: "127.0.0.1" },
    on: (event: string, cb: (chunk: unknown) => void) => {
      if (event === "data") cb(Buffer.from(JSON.stringify(body)));
      if (event === "end") setTimeout(cb, 0);
    },
  };
  await route.handler(request as never, res as never);
  return { status: res.status, json: JSON.parse(res.body) as Record<string, unknown> };
}

async function ask(server: ReturnType<typeof fakeServer>, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  return await drive(server.routes[0]!, body);
}

/** The switch set every harness case starts from. */
const ALL_ON = { gitbash: true, msys2: true, wsl: true, payload: false };

async function harness(options: { loopback?: boolean; unavailable?: string; switches?: { gitbash: boolean; msys2: boolean; wsl: boolean; payload?: boolean }; enabled?: boolean; shim?: boolean } = {}) {
  const switches = { payload: false, ...(options.switches ?? ALL_ON) };
  const enabledState = options.enabled ?? true;
  let shimState = options.shim ?? false;
  const server = fakeServer(options.loopback ?? true);
  const writes: Array<{ path: string[]; value: unknown }> = [];
  const handles: Record<string, unknown>[] = [];
  const registry = new UiTerminalRegistry({
    maxPerSession: 4, maxTotal: 8, idleGraceMs: 60_000, scrollback: 4096,
    spawn: async (spec) => {
      const h = fakeHandle();
      (h as unknown as { specSpawned?: unknown }).specSpawned = spec;
      handles.push(h as never);
      return h as never;
    },
  });
  const mounted = registerUiTerminalRoutes(server.webServer as never, {
    catalog: () => buildCatalog({ paths: PATHS, fsProbe: () => true, distros: ["Ubuntu"], switches, wslDistro: "" }),
    paths: () => PATHS,
    env: (id) => uiEnv(id, process.env),
    configuredShell: () => "gitbash",
    switches: () => switches,
    wslDistro: () => "",
    enabled: () => enabledState,
    shimOfficialTerminal: () => shimState,
    settingsSurface: () => "page",
    writeConfig: async (path, value) => { writes.push({ path: [...path], value }); if (path.length === 1 && path[0] === "shimOfficialTerminal") shimState = value === true; },
    registry,
    cwdFor: () => "E:\\work",
    unavailableReason: () => options.unavailable ?? "ok",
    isLoopback: (request) => (request.socket?.remoteAddress ?? "") === "127.0.0.1",
  });
  return { server, writes, handles, registry, mounted };
}

{
  const h = await harness();
  assert.strictEqual(h.mounted.socket, "no-websocket-route", "a host without upgrade support reports it instead of mounting a dead terminal");

  const denied = await (async () => {
    const res = fakeRes();
    await h.server.routes[0]!.handler({ method: "POST", socket: { remoteAddress: "10.0.0.9" } } as never, res as never);
    return JSON.parse(res.body) as { code?: string };
  })();
  assert.strictEqual(denied.code, "loopback-only", "a non-loopback peer is refused");

  const got = await ask(h.server, { op: "get" });
  assert.strictEqual(got.status, 200);
  const value = got.json.value as Record<string, unknown>;
  assert.strictEqual((value.catalog as unknown[]).length, 5, "the catalog is served (payload row included)");
  assert.strictEqual((value.effective as { id: string }).id, "gitbash", "the effective shell is computed host-side");

  const opened = await ask(h.server, { op: "terminal.open", sessionId: "s1", cols: 100, rows: 30 });
  const payload = opened.json.value as { info: Record<string, unknown>; environment: Record<string, unknown> };
  const info = payload.info;
  assert.ok(payload.environment && typeof payload.environment === "object", "the allocation answers with {info, environment} - the view cannot fit without it");
  assert.strictEqual(typeof payload.environment?.scrollback, "number", "environment carries the replay budget");
  assert.strictEqual(info.cwd, "E:\\work", "the session's cwd is resolved by the host");
  assert.strictEqual((info.shell as { name: string }).name, "Git Bash", "the host picked the activated default");
  assert.strictEqual(h.handles.length, 1, "one process spawned");

  const listed = await ask(h.server, { op: "terminal.list", sessionId: "s1" });
  assert.strictEqual(((listed.json.value as { terminals: unknown[] }).terminals).length, 1, "and it is listed");

  const closed = await ask(h.server, { op: "terminal.close", id: info.id as string });
  assert.deepStrictEqual(closed.json.value, { closed: true }, "close answers");

  const discover = await ask(h.server, { op: "shells.discover" });
  const shells = (discover.json.value as { shells: Array<{ name: string }> }).shells;
  assert.ok(shells.some((shell) => shell.name === "MSYS2"), "the picker sees every installed backend by its own label");

  // The multi-shell tab's whole reason to exist: an EXPLICIT row, side by side with
  // the default one. The host controller cannot offer this because its menu
  // de-duplicates `bash.exe`, so Git Bash and MSYS2 would collapse into one entry.
  const msys = await ask(h.server, { op: "terminal.open", sessionId: "s1", shell: "msys2", cols: 90, rows: 28 });
  const msysInfo = (msys.json.value as { info: Record<string, unknown> }).info;
  assert.strictEqual(msysInfo.shellId, "msys2", "an explicit activated choice is honoured");
  assert.deepStrictEqual((msysInfo.shell as { args: string[] }).args, ["-l"], "with that row's own argv (login shell, never -lc)");
  assert.strictEqual((msysInfo as { shell: { name: string } }).shell.name, "MSYS2", "and the catalog label, not a guess from bash.exe");
  const envRow = h.handles[1] as unknown as { specSpawned?: { env?: Record<string, string | undefined> } };
  assert.strictEqual(envRow.specSpawned?.env?.TERM, "xterm-256color", "the UI shell gets a real terminal type, not the tool's dumb");
  assert.strictEqual(envRow.specSpawned?.env?.MSYSTEM, "MINGW64", "and MSYS2 still gets MSYSTEM");

  // A shell the user switched off cannot be launched by naming it directly.
  const off = await harness({ switches: { gitbash: true, msys2: false, wsl: true } });
  const refused = await ask(off.server, { op: "terminal.open", sessionId: "s1", shell: "msys2" });
  assert.strictEqual(refused.json.ok, false, "a deactivated row is refused");
  assert.strictEqual(refused.json.code, "shellNotActivated", "with the reason the browser can name");
  assert.strictEqual(off.handles.length, 0, "and no process was spawned");
}

{
  // R4: the choice is validated against the catalog, so a shell the user turned
  // OFF cannot be stored through the route even though it is installed - the
  // browser is not the authority on this.
  const h = await harness({ switches: { gitbash: true, msys2: false, wsl: true } });
  const refused = await ask(h.server, { op: "default", defaultShell: "msys2" });
  assert.strictEqual(refused.json.ok, false, "a refusal is an explicit failure, not a silent 200");
  assert.strictEqual(refused.json.code, "shellNotActivated", "named so the browser can say 'enable that shell first'");
  assert.strictEqual(h.writes.length, 0, "and nothing was persisted");

  // An unknown id is refused through the same gate (it is, by definition, not an
  // activated available choice), and an activated one is accepted.
  const unknown = await ask(h.server, { op: "default", defaultShell: "fish" });
  assert.strictEqual(unknown.json.code, "shellNotActivated", "an unknown backend is refused");
  const accepted = await ask(h.server, { op: "default", defaultShell: "wsl" });
  assert.strictEqual(accepted.json.ok, true, "an activated, available choice is stored");
  assert.deepStrictEqual(h.writes, [{ path: ["defaultShell"], value: "wsl" }], "through the shared config writer");
}

{
  const h = await harness();
  const bad = await ask(h.server, { op: "switches", switches: { wsl: false } });
  assert.strictEqual(bad.status, 200, "a switch write succeeds");
  assert.deepStrictEqual(h.writes, [{ path: ["shellWsl"], value: false }], "and persists through the shared config writer");
  const unknown = await ask(h.server, { op: "nope" });
  assert.strictEqual(unknown.status, 404, "an unknown op is a 404, not a silent 200");
}

{
  // The payload row's switch writes through the same table (shellPayload) -
  // without it the settings toggle could not persist and the shell tool's
  // activation gate would never see the user's choice.
  const h = await harness();
  const r = await ask(h.server, { op: "switches", switches: { payload: true } });
  assert.strictEqual(r.status, 200, "the payload switch is accepted");
  assert.deepStrictEqual(h.writes, [{ path: ["shellPayload"], value: true }], "and persists to shellPayload");
}

{
  // The MASTER switch gates everything below it, and is itself always writable - a
  // control that could not be turned back on would be a way to lock the feature off.
  const off = await harness({ enabled: false });
  const got = await ask(off.server, { op: "get" });
  assert.strictEqual((got.json.value as { enabled: boolean; unavailable: string }).enabled, false, "get reports the master switch");
  assert.strictEqual((got.json.value as { unavailable: string }).unavailable, "disabled", "and names 'disabled' rather than 'ok'");
  for (const op of [
    { op: "terminal.open", sessionId: "s1" },
    { op: "switches", switches: { wsl: false } },
    { op: "default", defaultShell: "wsl" },
  ]) {
    const refused = await ask(off.server, op);
    assert.strictEqual(refused.json.code, "disabled", `${String(op.op)} is refused while off`);
    assert.strictEqual(refused.status, 409, "with a conflict status");
  }
  assert.strictEqual(off.writes.length, 0, "nothing was persisted while off");
  assert.strictEqual(off.handles.length, 0, "and no process was spawned");
  const back = await ask(off.server, { op: "enabled", enabled: true });
  assert.strictEqual(back.json.ok, true, "the master switch itself is writable while off");
  assert.deepStrictEqual(off.writes, [{ path: ["bottomTerminal"], value: true }], "through the same config writer");
}

// ---- drift gates -------------------------------------------------------------

{
  // End-to-end through the real apply(), on the SHAPE A ≤0.1.6 HOST HANDS OVER: a
  // plain config object that never changes after apply (no `.volatile()` live refs,
  // no hot-reload). Flipping a switch through the route must therefore be honoured
  // by the same process - otherwise the settings page would lie until a restart.
  const mounted: Array<{ path: string; handler: (req: never, res: never) => Promise<void> | void }> = [];
  const mutations: Array<{ id: string; path: string[]; value: unknown }> = [];
  const ctx16 = {
    logger: { info: () => {}, warn: () => {} },
    systemPrompt: { section: () => {} },
    tools: { register: () => {} },
    on: () => {},
    shellEnv: { collect: () => ({}) },
    sandboxPolicy: { resolve: () => ({ mode: "danger-full-access", workspaceRoot: "C:\\", sessionId: "s" }) },
    sandbox: { confine: (argv: string[]) => ({ argv, enforcement: "none" }) },
    get: () => undefined,
    effect: (fn: () => unknown) => fn(),
    subprocess: null,
    inject: (_deps: string[], cb: (svcCtx: unknown) => void) => {
      cb({
        webServer: {
          register: (route: { path: string; handler: never }) => { mounted.push(route as never); return () => {}; },
          registerUpgrade: (route: { path: string; handler: never }) => { mounted.push(route as never); return () => {}; },
        },
        settings: {
          mutate: async (id: string, ops: Array<{ op: string; path: string[]; value: unknown }>) => {
            for (const op of ops) mutations.push({ id, path: op.path, value: op.value });
          },
        },
        effect: (fn: () => unknown) => fn(),
      });
    },
  };
  apply(ctx16 as never, { defaultShell: "gitbash", gitBashPath: PATHS.gitbash, shellGitBash: true, shellMsys2: true, shellWsl: true, wslDistro: "" } as never);
  const route = mounted.find((entry) => entry.path === TERMINAL_API_PATH);
  assert.ok(route, "apply() mounted the terminals route");

  const before = await drive(route!, { op: "get" });
  const beforeRows = (before.json.value as { catalog: Array<{ id: string; activated: boolean }> }).catalog;
  assert.strictEqual(beforeRows.find((row) => row.id === "gitbash")!.activated, true, "git bash starts activated (config default)");

  await drive(route!, { op: "switches", switches: { gitbash: false } });
  assert.deepStrictEqual(mutations.map((m) => m.path), [["shellGitBash"]], "the flip went through settings.mutate");

  const after = await drive(route!, { op: "get" });
  const afterRows = (after.json.value as { catalog: Array<{ id: string; activated: boolean }> }).catalog;
  assert.strictEqual(afterRows.find((row) => row.id === "gitbash")!.activated, false, "and the SAME process already honours it (no restart)");
}

{
  // The route strings must agree across the halves: a browser posting to a path the
  // host never registered fails as "the bridge did not answer", which is exactly the
  // kind of breakage that ships green through a typecheck.
  const source = readFileSync(new URL("../src/webterminals/browser/api.ts", import.meta.url), "utf8");
  assert.ok(source.includes(`"${TERMINAL_API_PATH.replace(/^\//, "")}"`), "the browser posts to the host's api path");
  assert.ok(source.includes(`"${WS_PATH.replace(/^\//, "")}"`), "and dials the host's socket path");
}

{
  // Dual manifest: a version that differs between package.json and dsh.plugin.json
  // is a family-level P0 (the loader reads one, npm reads the other).
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string; engines: { dsh: string } };
  const manifest = JSON.parse(readFileSync(new URL("../dsh.plugin.json", import.meta.url), "utf8")) as { version: string; engines: { dsh: string } };
  assert.strictEqual(manifest.version, pkg.version, "dsh.plugin.json version matches package.json");
  assert.strictEqual(manifest.engines.dsh, pkg.engines.dsh, "dsh.plugin.json engines match package.json");
}

{
  // The host's right-sidebar terminal row IS overridden now (user decision, 2026-10-13,
  // which retires the old R3 ban and this gate's original direction). That flips which
  // mistake is dangerous: a patch that replaces the row but forgets a key silently
  // deletes that limit, because a replaced row provides no input for the fields it does
  // not mention and zod's `.default()` only fires on absent input. So the gate is now
  // "all of them, every time" - a host upgrade that adds a thirteenth key fails here
  // rather than quietly dropping a bound.
  const patch = readFileSync(new URL("../cordis.patch.yml", import.meta.url), "utf8");
  const at = patch.indexOf("- id: terminal-controller");
  assert.ok(at >= 0, "the bundle patch overrides the host terminal-controller row");
  const block = patch.slice(at);
  for (const key of [
    "shellCandidates",
    "maxTerminals",
    "maxCols",
    "maxRows",
    "scrollback",
    "maxBufferedBytes",
    "maxInputBytes",
    "disposeGraceMs",
    "unattendedTimeoutMs",
    "activityPollIntervalMs",
    "cleanupRetryMs",
  ]) {
    assert.ok(new RegExp(`^ {4}${key}:`, "m").test(block), `the override carries ${key} (a replaced row has no default to fall back on)`);
  }
  assert.ok(!/^ {4}shell:/m.test(block), "and sets no explicit default shell, so the environment's own default still rules");
  // The override may ADD entries; it may never remove one. `discoverShells` keeps the
  // EARLIEST entry per executable file name, and a bare `bash` on Windows resolves to
  // `C:\Windows\System32\bash.exe` - the WSL forwarder. Listing `Git\bin\bash.exe` ahead
  // of it (an earlier revision of this patch did exactly that) silently deleted WSL from
  // the official menu. The rule in terms of the host's own logic: the FIRST entry whose
  // file-name kind is `bash` must be the bare `bash`, so PATH resolution still wins.
  const candidates = block.slice(block.indexOf("shellCandidates:"), block.indexOf("maxTerminals:"));
  const lines = candidates
    .split("\n")
    .map((line) => /^ {6}- '?([^'\n]+?)'?\s*$/.exec(line)?.[1])
    .filter((entry): entry is string => entry !== undefined);
  // The same `executableName`/`shellKind` reduction the host applies.
  const kindOf = (entry: string) => entry
    .slice(Math.max(entry.lastIndexOf("/"), entry.lastIndexOf("\\")) + 1)
    .toLowerCase()
    .replace(/\.exe$/u, "");
  assert.deepEqual(lines.length, 8, "the override lists every stock candidate plus the two aliases");
  for (const stock of ["zsh", "bash", "fish", "pwsh", "powershell", "cmd"]) {
    assert.ok(lines.includes(stock), `the override keeps the stock \`${stock}\` candidate`);
  }
  const firstBashKind = lines.findIndex((entry) => kindOf(entry) === "bash");
  assert.strictEqual(lines[firstBashKind], "bash", "nothing steals the `bash` key away from the WSL forwarder");
  assert.ok(lines.indexOf("msys-bash.exe") < firstBashKind && lines.indexOf("git-bash.exe") < firstBashKind, "both aliases are prepended, ahead of the untouched stock list");

  // An absolute candidate is a file this package cannot create for the operator, so the
  // README must carry the command that does. A patch that grows an alias its docs do not
  // mention leaves a menu entry missing with nobody able to find out why.
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  for (const entry of lines.filter((line) => /^[a-z]:\\/i.test(line))) {
    assert.ok(readme.includes(entry), `README documents how to create the alias ${entry}`);
  }
  assert.ok(readme.includes("link-shells.mjs"), "and points at the script that creates them");
  // The script must exist and agree with the patch, or the documented fix is a dead link.
  const linker = readFileSync(new URL("../scripts/link-shells.mjs", import.meta.url), "utf8");
  for (const entry of lines.filter((line) => /^[a-z]:\\/i.test(line))) {
    assert.ok(linker.includes(entry.replace(/\\/g, "\\\\")), `scripts/link-shells.mjs creates ${entry} too`);
  }

  // No new model-facing capability: the terminal is a human surface only.
  const manifest = JSON.parse(readFileSync(new URL("../dsh.plugin.json", import.meta.url), "utf8")) as { contributes?: { tools?: unknown[] } };
  assert.ok(manifest.contributes === undefined || (manifest.contributes.tools ?? []).length === 0, "no model-visible tool is contributed by the terminal feature");
}

// The official-row opt-in. Off by default and reported through `get`, because publishing
// `webTerminals` unconditionally is what took down the host's terminal controller on
// 0.2.0-rc.2; the route only ever records the operator's choice, and the client decides
// whether the name is free at click time (see test/client.ts's guard assertion).
{
  const h = await harness();
  const initial = await ask(h.server, { op: "get" });
  assert.strictEqual((initial.json.value as { settingsSurface?: string }).settingsSurface, "page", "the client is told the host has a settings page");
  assert.strictEqual((initial.json.value as { shimOfficialTerminal?: boolean }).shimOfficialTerminal, false, "the opt-in is off unless the operator turns it on");

  const on = await ask(h.server, { op: "shim", shim: true });
  assert.strictEqual(on.json.ok, true, "the switch is writable");
  assert.strictEqual((on.json.value as { shimOfficialTerminal?: boolean }).shimOfficialTerminal, true, "and reads back as on");
  assert.deepStrictEqual(h.writes.at(-1), { path: ["shimOfficialTerminal"], value: true }, "persisted under its own key");

  const off = await ask(h.server, { op: "shim", shim: false });
  assert.strictEqual((off.json.value as { shimOfficialTerminal?: boolean }).shimOfficialTerminal, false, "and reversible");
}

// The generation classifier. Its answer decides whether the browser paints its own
// floating panel, so a wrong branch means either a duplicated settings surface (on a line
// that has a page) or no way in at all (on the two lines that do not). The generations are
// separated by which registration API survives, so the order of the checks is the contract:
// `installSection` first (0.1.2/0.1.5 - has a page), then `register` (0.1.0/0.1.1 - slots
// exist but nothing renders them), then neither (0.1.7+/0.2.0 - has a page).
{
  const { classifySettingsService, reportSettingsSurface, settingsSurface } = await import("../lib/settings-surface.js");
  // The pre-state cannot be read from this module instance: `apply` is imported above and
  // an earlier case already ran it, which legitimately classifies the mock's service.
  // A query specifier is a distinct module key in Node ESM, so the default comes from a
  // fresh instance instead of from hoping nothing ran first.
  const url = new URL("../lib/settings-surface.js", import.meta.url).href;
  const fresh = (await import(`${url}?case=idle`)) as { settingsSurface(): string };
  assert.strictEqual(fresh.settingsSurface(), "unknown", "nothing is claimed before the settings service arrives");
  assert.strictEqual(classifySettingsService(undefined), "unknown", "an absent service is not evidence");
  assert.strictEqual(classifySettingsService({ installSection: () => undefined, register: () => undefined }), "page", "0.1.2/0.1.5: installSection means a real page");
  assert.strictEqual(classifySettingsService({ register: () => undefined }), "none", "0.1.0/0.1.1: register without installSection means no page");
  assert.strictEqual(classifySettingsService({}), "page", "0.1.7+/0.2.0: neither API, and the page exists");
  assert.strictEqual(reportSettingsSurface({ register: () => undefined }), "none", "the route-facing setter records the same answer");
  assert.strictEqual(settingsSurface(), "none", "and the synchronous read agrees");
  reportSettingsSurface({});
}

console.log("ALL BROWSER-TERMINAL HOST TESTS PASSED");
