// Client plugin logic test: load lib/client.js under a mocked __ModuleLoader__
// and exercise apply(ctx) with mocked slots/locale/configForms services.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { join } from "node:path";
import assert from "node:assert";
const profileRequire = createRequire(join(os.homedir(), ".dsh", "profiles", "web", "package.json"));
function loadShared(name: string): unknown {
  // CI: react is installed into the project node_modules (npm install react --no-save);
  // local dev: resolve from the profile dependency tree instead.
  try {
    return createRequire(import.meta.url)(name);
  } catch {
    return profileRequire(name);
  }
}

interface ReactLike {
  createElement: (tag: unknown, props?: unknown, ...children: unknown[]) => unknown;
}
interface ReactDomServerLike {
  renderToString: (element: unknown) => string;
}

// --- mock defineStore (shape mirrors dsh-client-store: { spec, create }) ---
interface MockStore {
  actions: Record<string, (...params: unknown[]) => void>;
  getSnapshot: () => Record<string, unknown>;
  subscribe: (fn: () => void) => () => boolean;
}
type MockDefineStore = (decl: {
  init: () => Record<string, unknown>;
  actions: Record<string, (state: Record<string, unknown>, ...params: unknown[]) => void>;
}) => MockStore;

const mockDefineStore: MockDefineStore = (decl) => ({
  spec: decl,
  create: (): MockStore => {
    const state = decl.init();
    const listeners = new Set<() => void>();
    const actions: Record<string, (...params: unknown[]) => void> = {};
    for (const key of Object.keys(decl.actions)) {
      actions[key] = (...params: unknown[]) => { decl.actions[key](state, ...params); for (const f of listeners) f(); };
    }
    return {
      actions,
      getSnapshot: () => state,
      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }
    };
  }
}) as unknown as MockStore;

// --- mocked services ---
interface ClientTestContext {
  slots: {
    inject(slot: string, fn: () => unknown, name?: string): void;
    register(options: Record<string, unknown>, Component: unknown): Record<string, unknown>;
    /** The ledger the client reads to decide whether to register its own section. */
    entries?(slot: string): { options: { id?: string; key?: string } }[];
  };
  locale: { register(ns: string, dicts: Record<string, Record<string, string>>): unknown };
  effect(fn: () => unknown): unknown;
  /** Soft reads (the host-terminal probe and the optional betterSidebar). */
  get?(name: string): unknown;
  provide?(name: string, service: unknown): unknown;
  inject?(deps: string[], callback: (arrived: unknown) => void): void;
}
interface ExportedClient {
  inject: string[];
  apply: (ctx: ClientTestContext) => void;
}
const localeRegisters: { ns: string; dicts: Record<string, Record<string, string>> }[] = [];
const slotRegistrations: { slot: string; fn: () => unknown }[] = [];
const provided: Record<string, unknown> = {};
const registeredTabs: Record<string, unknown>[] = [];
const betterSidebarStub = { registerTab: (descriptor: Record<string, unknown>) => { registeredTabs.push(descriptor); return () => {}; } };
const rawCtx: ClientTestContext = {
  slots: {
    inject: (slot: string, fn: () => unknown) => { slotRegistrations.push({ slot, fn }); },
    register: (options: Record<string, unknown>, Component: unknown) => ({ ...options, Component })
  },
  locale: { register: (ns: string, dicts: Record<string, Record<string, string>>) => { localeRegisters.push({ ns, dicts }); } },
  effect: (fn: () => unknown) => { fn(); },
  // The host publishes no `webTerminals` here, and `betterSidebar` is reachable ONLY
  // through the soft read - never as a property.
  get: (name: string) => (name === "betterSidebar" ? betterSidebarStub : undefined),
  provide: (name: string, service: unknown) => { provided[name] = service; },
};
/**
 * The apply context, wrapped the way cordis actually hands one to a client plugin: a
 * Proxy that refuses any property the module did not declare in its `inject` list.
 * Without this the test would keep passing the exact code that crashed on a live
 * 0.2.0-rc.2 host (`ctx.betterSidebar` -> "cannot get property 'betterSidebar' without
 * inject"), because a plain object answers `undefined` where the host throws.
 */
const DECLARED = new Set(["slots", "locale", "effect", "get", "provide", "inject"]);
const ctx = new Proxy(rawCtx, {
  get(target: ClientTestContext, key: string | symbol): unknown {
    if (typeof key === "string" && !DECLARED.has(key) && !(key in target)) {
      throw new Error(`cannot get property "${key}" without inject`);
    }
    return Reflect.get(target, key);
  },
}) as ClientTestContext;

// --- load the built client bundle under a fake module loader ---
function readBundle(rel: string): string {
  try {
    return readFileSync(new URL(rel, import.meta.url), "utf8");
  } catch (error) {
    throw new Error("built bundle missing: " + rel + " - run `npm run build` (" + String(error) + ")", { cause: error });
  }
}

// Bundle-name guards. Two directions, both earned: (a) the retired
// `dsh-client-runtime` name must never come back (the platform seed table spells
// the store `@deepseek-ai/dsh-client-store`, so the old name resolves to nothing);
// (b) this plugin deliberately requires NO client package at all - 0.1.0/0.1.1 have
// no browser module table, so every read/write goes through the host config bridge
// (`src/client.tsx` header). Guard EVERY shipped bundle: package.json "files" ships
// both lib/ and dist/, DSH's loader reads lib/client.js, and dist/client*.js is the
// legacy compatibility copy consumed by older hosts. A regression that only reaches
// one artifact still ships through npm.
const BUNDLE_PATHS = ["../lib/client.js", "../dist/client.js", "../dist/client.core.js"];
for (const rel of BUNDLE_PATHS) {
  const text = readBundle(rel);
  assert.ok(!text.includes("dsh-client-runtime"), rel + " does not request the retired client runtime");
  assert.ok(!text.includes("@deepseek-ai/dsh-client-store"), rel + " stays free of client-package requires (compat-legacy bridge only)");
}

const bundle = readBundle("../lib/client.js");
assert.ok(bundle.includes("window.__ModuleLoader__.load"), "bundle wrapped");
// Menu props are captured so the rendered option list can be inspected: this
// branch renders a Menu of items, not a <select> of <option>.
const menuProps: { items?: { id: string; label: string }[] }[] = [];
let exported: ExportedClient | undefined;
const globalWithWindow = globalThis as typeof globalThis & { window?: unknown; self?: unknown };
// The bundle now carries xterm, whose UMD wrapper resolves its global through `self`
// at evaluation time. A browser always has it; the harness must not pretend otherwise
// just because node does not.
globalWithWindow.self = globalThis;
globalWithWindow.window = {
  __ModuleLoader__: {
    load: ({ id, factory }: { id: string; factory: (require: (name: string) => unknown) => unknown }) => {
      assert.strictEqual(id, "dsh-bash-terminal-ts");
      exported = factory((name) => {
        if (name === "@deepseek-ai/dsh-client-store") return { defineStore: mockDefineStore };
        if (name === "react/jsx-runtime" || name === "react" || name === "react-dom/server") return loadShared(name);
        if (name === "@deepseek-ai/dsh-client-ui-primitives") {
          const React = loadShared("react") as ReactLike;
          return {
            Menu: (props: { anchor: unknown; items?: { id: string; label: string }[] }) => {
              menuProps.push(props);
              return React.createElement(
                "div",
                null,
                props.anchor,
                ...(props.items ?? []).map((item) => React.createElement("span", { key: item.id }, item.label))
              );
            },
            IconChevronDownOutlineMedium: () => null
          };
        }
        throw new Error("unexpected require: " + name);
      }) as ExportedClient;
    }
  }
};
new Function(bundle)();
assert.ok(exported, "client module exports");
assert.deepStrictEqual(exported!.inject, ["slots", "locale"]);
assert.strictEqual(typeof exported!.apply, "function");

// --- run apply ---
exported!.apply(ctx);

// The service-collision gate (measured on a live 0.2.0-rc.2 host). This assertion used
// to read the opposite way - "provided when the host has none" - which is exactly how
// the defect got baked in: the host's `dsh-api-terminal-controller` provides
// `webTerminals` with an UNGUARDED ctx.provide, so if our client wins the boot race the
// controller's provide throws, the entry fails, and the whole web boot renders
// "Failed to load plugins". Winning a race over a first-party service is never
// acceptable, so the client must not publish this name at all - the bottom-dock feature
// is this plugin's own tab, which needs no service.
{
  assert.strictEqual(provided["webTerminals"], undefined, "the client never provides webTerminals");
  for (const rel of ["../src/client.tsx"]) {
    // Strip comments first: this file DOCUMENTS why it must not provide the service, so
    // a raw substring test would match its own prose and the gate would be unfixable.
    const code = readFileSync(new URL(rel, import.meta.url), "utf8")
      .split("\n")
      // Both comment shapes: `// line` and the ` * ...` body of a block comment.
      .filter((line) => !/^(\/\/|\*|\/\*)/.test(line.trimStart()))
      .map((line) => line.replace(/\/\/[^'"`]*$/u, ""))
      .join("\n");
    // Exactly one publish site, and it must be the gated one. "Never provide" was the
    // first cut of this rule and it was too strong: the official bottom row genuinely
    // needs the service on deployments with no controller. What is NOT acceptable is
    // providing it without first reading whether the name is free - that is the race
    // that failed the host's own controller entry on 0.2.0-rc.2.
    const provideSites = [...code.matchAll(/\.provide\??\.?\(/g)];
    assert.strictEqual(provideSites.length, 1, `${rel} has exactly one ctx.provide call site`);
    for (const site of provideSites) {
      const guard = code.slice(Math.max(0, site.index - 400), site.index);
      assert.ok(guard.includes("looksLikeTerminals("), `${rel} checks the service is free before publishing it`);
    }
    // The client context is a Proxy: reading a service that is not in the declared
    // `inject` list throws "cannot get property X without inject" and takes the whole
    // guarded block down with it. Only ctx.get may look at an undeclared service.
    for (const name of ["betterSidebar", "webTerminals"]) {
      assert.ok(!new RegExp(`ctx\\.${name}[^:]`).test(code), `${rel} reads ${name} through ctx.get, never as a property`);
    }
  }
}

// locale dictionaries registered
assert.strictEqual(localeRegisters.length, 1);
assert.strictEqual(localeRegisters[0].ns, "settings.bash-terminal");
assert.ok(localeRegisters[0].dicts.zh["shell.title"]);
assert.ok(localeRegisters[0].dicts.en["shell.title"]);

// Drift guard: the Web UI must offer exactly the backends the host supports, in
// the host's order. src/client.tsx cannot import the host module (it pulls
// node: builtins), so the contract is asserted against the shipped bundle and
// the rendered menu instead. The host list is spelled out here on purpose: if a
// backend is added to src/index.ts SHELLS without the client half, this fails.
const hostShells = ["powershell", "gitbash", "msys2", "wsl", "payload"];
const bundleShells = /var SHELLS = \[([^\]]*)\]/.exec(bundle);
assert.ok(bundleShells, "client bundle declares its shell list");
const parsedShells = bundleShells[1].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
assert.deepStrictEqual(parsedShells, hostShells, "client shell list matches the host list, in host order");
const zhDict = localeRegisters[0].dicts.zh;
const enDict = localeRegisters[0].dicts.en;
for (const id of hostShells) {
  assert.strictEqual(typeof zhDict["shell." + id], "string", "zh dictionary missing shell." + id);
  assert.strictEqual(typeof enDict["shell." + id], "string", "en dictionary missing shell." + id);
  assert.strictEqual(zhDict["shell." + id], enDict["shell." + id], "shell." + id + " is a proper noun and must not be translated");
}
assert.strictEqual(zhDict["shell.msys2"], "MSYS2", "MSYS2 label");
assert.strictEqual(
  Object.keys(enDict).filter((k) => k.startsWith("shell.")).length,
  hostShells.length + 3,
  "en dictionary has an unexpected number of shell.* keys"
);
assert.strictEqual(typeof enDict["shell.unavailable"], "string", "unavailable fallback copy");

// Three arms, two landing points: the bundle detail page (plus its 0.1.2/0.1.5
// era-equivalent, the plugin-item card) and this plugin's own top-level section.
// The family-tab arm was deleted (2026-10-14): these settings keep a first-class nav
// row, so they must not depend on another plugin holding the family container.
const seat = (slot: string) => slotRegistrations.find((entry) => entry.slot === slot);
assert.ok(!seat("dsh-family.tab"), "no family-tab arm left behind");
assert.ok(seat("plugins.bundle.config"), "the bundle detail card is injected");
assert.ok(seat("settings.plugin.item"), "the legacy (0.1.2/0.1.5) plugin settings card is injected");
assert.ok(seat("settings.section"), "the own settings section is injected");
// The overlay is still registered - but it renders nothing unless the HOST reports that
// its line has no settings page at all (0.1.0/0.1.1). Deciding at apply time would race
// the probe, so the gate lives in the component.
const overlay = seat("shell.overlay");
assert.ok(overlay, "the last-resort panel is registered on every line");
const overlayObj = overlay!.fn() as Record<string, unknown>;
assert.strictEqual(typeof overlayObj.Component, "function", "overlay component passed");
// One source of truth: every landing point renders THE SAME component, so a change to
// the settings body cannot land on one surface and silently miss another. The bundle
// card is the reference now that the family arm is gone.
const bundleCard = seat("plugins.bundle.config")!.fn() as Record<string, unknown>;
const Component = bundleCard.Component;
assert.strictEqual(typeof Component, "function", "the settings body is a component");
assert.strictEqual(bundleCard.key, "dsh-bash-terminal-ts", "the bundle card is keyed by the package name");
const pluginCard = seat("settings.plugin.item")!.fn() as Record<string, unknown>;
assert.strictEqual(pluginCard.key, "settings.bash-terminal", "the legacy card is keyed by the settings namespace");
assert.strictEqual(pluginCard.Component, Component, "and renders the same component too");

// The multi-shell bottom tab: this is what makes Git Bash and MSYS2 both reachable on
// a host that ships its OWN terminal controller (that menu de-duplicates by
// executable file name, so both `bash.exe` entries collapse into one). `bottomOnly`
// is load-bearing: without it the type also becomes a capsule in DSH's native right
// sidebar, i.e. a second "Terminal" row next to the host's.
{
  assert.strictEqual(registeredTabs.length, 1, "exactly one tab registered when betterSidebar is present");
  const descriptor = registeredTabs[0] as Record<string, unknown>;
  assert.strictEqual(descriptor.id, "dsh-bash-terminal-ts:multi", "the tab id is namespaced to this plugin");
  assert.strictEqual(descriptor.bottomOnly, true, "offered only in the bottom workbench");
  assert.strictEqual(typeof descriptor.title, "function", "title follows the active locale");
  assert.ok(typeof descriptor.title === "function" && String(descriptor.title()).length > 0, "and is not empty");
  assert.strictEqual(typeof descriptor.description, "function", "the + menu shows a real description");
  assert.strictEqual(typeof descriptor.component, "function", "a component is provided");
  assert.strictEqual(typeof descriptor.available, "function", "with an availability predicate");
}

// The row renders through real React with NO host services reachable (there is no
// fetch server in a node run), which is exactly the degradation path that must not
// throw: the preference row shows its static shell list and the dock section says
// the routes are not mounted, rather than rendering a blank card.
const React = loadShared("react") as ReactLike;
const { renderToString } = loadShared("react-dom/server") as ReactDomServerLike;
const html = renderToString(React.createElement(Component, {}));
assert.ok(html.includes("默认终端"), "row renders the zh title (the module fallback, since this mock has no locale.bind)");
assert.ok(html.includes("btSelector"), "selector uses the official capsule class");
assert.ok(!html.includes("AI 无法更改"), "removed the 'AI cannot change' phrase");
assert.ok(html.includes("宿主尚未挂载终端路由"), "the dock section reports an unmounted route instead of going blank");

// The overlay stays silent while the host reports a settings page (the probe has not
// answered in this mock, which is the same "do not show a second surface" default).
assert.strictEqual(
  renderToString(React.createElement(overlayObj.Component as () => unknown, {})),
  "",
  "no floating panel while the host has (or may have) a settings page",
);

// The drift guard that matters: the option list the browser offers must be the
// host's own backends, in the host's order, labelled from the dictionaries. The picker
// keeps its options mounted and hides the list with the `hidden` attribute precisely so
// this stays checkable from rendered markup.
const optionIds = [...html.matchAll(/data-shell="([^"]+)"/g)].map((match) => match[1]);
assert.deepStrictEqual(optionIds, hostShells, "rendered options match the host shell list, in host order");
for (const label of ["PowerShell", "Git Bash", "MSYS2", "WSL"]) {
  assert.ok(html.includes(label), `the rendered option list labels ${label}`);
}
assert.ok(html.includes("MSYS2"), "rendered row includes the MSYS2 entry");

// No native <select> anywhere in the client: the option popup it opens is painted by the
// operating system, so it ignored the host theme and came out unreadable in dark mode.
// The replacement must take the host's own overlay token, which is defined per theme.
// Comments are stripped first - this file's own prose explains why <select> is banned, and
// a shape gate that reads documentation as code reports the opposite of what it guards.
const stripComments = (text: string) => text.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
for (const rel of ["../src/client.tsx", "../src/webterminals/browser/tab.tsx", "../src/webterminals/browser/shell-picker.tsx"]) {
  const source = stripComments(readFileSync(new URL(rel, import.meta.url), "utf8"));
  assert.ok(!/<select[\s>]/.test(source), `${rel} renders no native <select>`);
  assert.ok(!/<option[\s>]/.test(source), `${rel} renders no native <option>`);
}
const pickerSource = readFileSync(new URL("../src/webterminals/browser/shell-picker.tsx", import.meta.url), "utf8");
assert.ok(pickerSource.includes("btPickList"), "the picker draws its own list");
const css = readFileSync(new URL("../src/client.tsx", import.meta.url), "utf8");
assert.ok(/\.btPickList\{[^}]*--dsw-alias-bg-overlay/.test(css), "the popup surface uses the host's themed overlay token");

// The own-section rule, across the coupling we removed. The section used to stand down
// while a `dsh-family` row existed (its settings then lived in the family tab); with that
// arm deleted, the section registers under its OWN id no matter what else is seated - the
// family container is no longer a dependency, and shadowing `dsh-family` remains the
// accident the family contract forbids (double nav rows). The decision is still taken when
// the host DECLARES the section, never at apply time.
function sectionArms(ledger: { options: { id?: string } }[]): Record<string, unknown>[] {
  const regs: Record<string, unknown>[] = [];
  const mock: ClientTestContext = {
    slots: {
      inject: (slot: string, fn: () => unknown) => {
        if (slot !== "settings.section") return;
        (fn() as Generator<unknown>).next();
      },
      register: (options: Record<string, unknown>, Card: unknown) => { regs.push({ ...options, Component: Card }); return options; },
      entries: (slot: string) => (slot === "settings.section" ? ledger : []),
    },
    locale: { register: () => undefined },
    effect: (fn: () => unknown) => fn(),
    get: () => undefined,
  };
  exported!.apply(mock);
  return regs;
}
{
  const withFamily = sectionArms([{ options: { id: "dsh-family" } }]);
  const ownWithFamily = withFamily.find((entry) => entry.name === "settings.section");
  assert.ok(ownWithFamily, "our section registers even while the family container exists");
  assert.strictEqual(ownWithFamily!.id, "bash-terminal", "under its own id, never shadowing dsh-family");

  const withoutFamily = sectionArms([]);
  const own = withoutFamily.find((entry) => entry.name === "settings.section");
  assert.ok(own, "and the same when it is absent");
  assert.strictEqual(own!.id, "bash-terminal", "same id either way");
  assert.strictEqual(typeof own!.label, "function", "with a locale-aware label");
  assert.strictEqual(own!.Component, Component, "and the same settings body");
}

// The arrival path. A one-shot `ctx.get('betterSidebar')` would register the tab only
// when dsh-better-sidebar's client happens to run first; on the other order the tab is
// silently absent - the kind of failure that never shows up in a log. So the client
// must also ask to be told when the service arrives.
{
  const lateTabs: Record<string, unknown>[] = [];
  let arrival: ((ctx: unknown) => void) | undefined;
  const lateCtx: ClientTestContext & { inject: (deps: string[], cb: (ctx: unknown) => void) => void } = {
    slots: { inject: () => {}, register: () => ({}) },
    locale: { register: () => undefined },
    effect: (fn: () => unknown) => fn(),
    get: () => undefined,
    inject: (_deps, cb) => {
      arrival = cb;
    },
  };
  exported!.apply(lateCtx);
  assert.ok(arrival !== undefined, "the client subscribed to betterSidebar's arrival");
  assert.strictEqual(registeredTabs.length, 1, "nothing registered before the service showed up");
  arrival!({ betterSidebar: { registerTab: (descriptor: Record<string, unknown>) => { lateTabs.push(descriptor); return () => {}; } } });
  assert.strictEqual(lateTabs.length, 1, "the tab registers the moment it arrives");
  assert.strictEqual(lateTabs[0].bottomOnly, true, "bottom-only on the arrival path too");
  assert.strictEqual(lateTabs[0].id, "dsh-bash-terminal-ts:multi", "same identity as the eager path");
}

console.log("CLIENT LOGIC TESTS PASSED");
