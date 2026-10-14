// dsh-bash-terminal-ts client plugin (compat-legacy): a "Default terminal"
// preference row plus the bottom-terminal shell section, surfaced on the bundle
// detail card and on this plugin's OWN top-level settings section (it left the
// dsh-family tab in 2026-10-14 — it keeps a first-class nav row, so it no longer
// needs the family container), with a shell.overlay floating-gear fallback for
// hosts without any settings surface (0.1.0/0.1.1).
//
// compat-legacy rewiring vs upstream 0.7.1:
//  - no @deepseek-ai/dsh-client-store / dsh-client-ui-primitives requires:
//    0.1.0/0.1.1 have no browser module table and 0.1.2 is unverified; the
//    row reads/writes through the host config bridge (GET/POST
//    /api/bash-terminal/config) and the terminal through /api/bash-terminal/terminals,
//    both of which work on every line.
//  - ui-primitives Menu/Icon replaced by a native select (same capsule CSS).
//  - every surface registration is independently guarded (one unknown slot
//    name on one line must not take down the rest).
//
// 0.8.0 adds two surfaces and removes one idea:
//  - the shell activation section (Git Bash / MSYS2 / WSL switches with a
//    per-row availability badge, and a default-shell choice restricted to the
//    activated-and-available set), all state coming from the HOST's catalog so the
//    browser never decides twice;
//  - a bottom-dock tab of our own (`ctx.betterSidebar.registerTab`, bottomOnly), which
//    is what makes Git Bash and MSYS2 reachable side by side - the host's own terminal
//    menu de-duplicates shells by executable file name and both are `bash.exe`;
//  - NO `ctx.provide('webTerminals')`. That was the bridge plugin's approach and it is
//    fatal on any host that ships its terminal controller: see the webTerminals block
//    near the bottom of this file.

import { useEffect, useState } from "react";
import { setTranslator, tr as translate } from "./browser-i18n";
import { dictionaries } from "./locales";
import { BridgeTerminals } from "./webterminals/browser/bridge";
import { looksLikeTerminals } from "./webterminals/browser/face";
import { MultiShellTerminal } from "./webterminals/browser/tab";
import { ShellPicker } from "./webterminals/browser/shell-picker";
import { switchableRows } from "./webterminals/browser/xterm";
import { post, readConfig, readLegacyConfig, writeDefaultShell, writeLegacyDefault } from "./webterminals/browser/api";
import type { CatalogEntry, ConfigSnapshot } from "./webterminals/browser/api";

const SETTINGS_NS = "settings.bash-terminal";
const SHELLS = ["powershell", "gitbash", "msys2", "wsl"] as const;

// Injected once when the browser loads the bundle (node tests guard on document).
const ROW_CSS =
  ".btRow{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}.btRowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}.btTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}.btDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}.btSelector{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.btSelector:hover{background:var(--dsw-alias-interactive-bg-hover)}.btGear{position:fixed;right:16px;bottom:110px;z-index:10000;width:40px;height:40px;border-radius:50%;border:1px solid rgba(127,127,127,.4);background:rgba(30,30,32,.85);color:inherit;cursor:pointer;font-size:17px;box-shadow:0 4px 16px rgba(0,0,0,.35)}.btOverlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45)}.btPanel{position:fixed;top:6vh;left:50%;transform:translateX(-50%);width:min(760px,92vw);max-height:84vh;overflow-y:auto;z-index:10001;background:var(--dsw-alias-bg-module-platform,rgba(30,30,32,.92));border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));border-radius:14px;padding:20px;color:var(--dsw-alias-label-primary)}.btBadge{border-radius:10px;padding:2px 8px;font-size:11px;line-height:16px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);white-space:nowrap}.btBadgeOk{color:var(--dsw-alias-label-primary)}.btNotice{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;padding:8px 0}.btWarn{color:var(--dsw-status-warning-default,#b8860b)}.btRowSwitch{padding-right:0}.btSwitch{width:40px;height:24px;border-radius:12px;border:none;cursor:pointer;background:var(--dsw-alias-bg-module-platform);position:relative;flex:none;transition:background .15s ease;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2)}.btSwitch::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--dsw-alias-label-tertiary);transition:transform .15s ease,background .15s ease}.btSwitchOn{background:var(--dsw-alias-interactive-brand,#2f6fed)}.btSwitchOn::after{transform:translateX(16px);background:#fff}.btSwitch:disabled{cursor:not-allowed;opacity:.4}.btSwitch:disabled::after{background:var(--dsw-alias-label-quaternary,#8a8a8a)}.btInput{background:var(--dsw-alias-bg-module-platform);height:32px;border:none;border-radius:8px;color:var(--dsw-alias-label-primary);padding:0 10px;font:inherit;min-width:0;flex:1}.btPick{position:relative;display:inline-block}.btPickBtn{gap:6px}.btPickSm{height:28px;padding:0 10px;border-radius:14px;font-size:12px;line-height:18px}.btPickBtn:disabled{opacity:.4;cursor:not-allowed}.btPickText{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.btPickCaret{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1}.btPickList{position:absolute;z-index:1000;top:calc(100% + 4px);left:0;min-width:100%;max-height:260px;overflow-y:auto;padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-overlay);box-shadow:0 8px 24px rgba(0,0,0,.28)}.btPickOpt{padding:6px 10px;font-size:12px;line-height:18px;border-radius:6px;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}.btPickOpt:hover{background:var(--dsw-alias-interactive-bg-hover)}.btPickOptOn{color:var(--dsw-alias-interactive-brand);font-weight:600}";
if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="bash-terminal-row"]') === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-bash-terminal-ts";
  tag.dataset.pluginCss = "bash-terminal-row";
  tag.textContent = ROW_CSS;
  document.head.appendChild(tag);
}

/**
 * Whether the host itself owns `webTerminals` (the normal case on a DSH build that
 * mounts its terminal controller). Set once by `apply()`; the dock section states it,
 * because without that line a user cannot tell why the official terminal row and this
 * plugin's coexist - or which one their switches are affecting.
 *
 * A getter rather than a cached boolean: the controller may activate after our apply
 * runs, and a snapshot taken at apply time would be a permanent false negative. Every
 * render asks again, so the notice cannot go stale.
 */
let hostOwnsTerminals: () => boolean = () => false;

/**
 * Claim `webTerminals` for dsh-better-sidebar's OFFICIAL bottom terminal row - the one
 * thing this plugin can only do on a host that has no terminal controller. Returns what
 * actually happened so the settings row can say it, because the honest answer depends on
 * a live read of the service, not on the switch's own value.
 *
 * Replacing this stub is how `apply()` hands the component the real context. It stays a
 * function rather than a `ctx` global so the component never has to know that the apply
 * context is a Proxy which throws on undeclared property reads.
 */
let tryPublishShim: () => "published" | "host-provides" = () => "host-provides";

/** The published instance, kept so a later disable can dispose it. */
let shimInstance: BridgeTerminals | undefined;

/**
 * Read the current shell and, when the terminal route answers, its catalog.
 * The op route is preferred (it carries the catalog and validates choices); the
 * legacy bridge is the fallback so the row still works on a host where only the
 * preference channel exists.
 */
async function bridgeConfig(): Promise<ConfigSnapshot | null> {
  try {
    return await readConfig();
  } catch {
    return await readLegacyConfig();
  }
}

/** The catalog if the terminal routes answered, else null (the old bridge shape). */
function catalogOf(snapshot: ConfigSnapshot | null): CatalogEntry[] | null {
  if (!Array.isArray(snapshot?.catalog)) return null;
  return snapshot.catalog as CatalogEntry[];
}

/** The availability badge for one catalog row. */
function badgeKey(row: CatalogEntry): string {
  // The floor row gets its own word: the lock EXPLANATION belongs in the row's
  // description, and putting it in both places reads as a rendering bug.
  if (!row.togglable) return "dock.state.floor";
  if (row.available) return "dock.state.available";
  return row.reason === "no-distro"
    ? "dock.state.noDistro"
    : row.reason === "launcher-only"
      ? "dock.state.launcherOnly"
      : "dock.state.notInstalled";
}

/** 默认终端选择行:读写全部走宿主 bridge(六线统一)。 */
function ShellPreferenceRow({ snapshot }: { snapshot?: ConfigSnapshot | null }) {
  const [shell, setShell] = useState("powershell");
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      const v = snapshot ?? (await bridgeConfig());
      if (!alive) return;
      if (v && v.defaultShell) {
        setShell(v.defaultShell);
        setStatus("ready");
      } else {
        setStatus("unavailable");
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [snapshot]);
  const change = (value: string): void => {
    setShell(value);
    // Validated write first; the legacy channel only if the op route is absent.
    void writeDefaultShell(value).catch(async () => {
      try {
        await writeLegacyDefault(value);
      } catch {
        /* the row keeps its optimistic value; the next read reconciles */
      }
    });
  };
  if (status === "unavailable") {
    return (
      <div className="btRow">
        <div className="btRowText">
          <div className="btTitle">{translate("shell.title")}</div>
          <div className="btDesc">{translate("shell.unavailable")}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="btRow">
      <div className="btRowText">
        <div className="btTitle">{translate("shell.title")}</div>
        <div className="btDesc">{translate("shell.description")}</div>
      </div>
      <ShellPicker
        rows={SHELLS.map((id) => ({ id, label: translate("shell." + id) }))}
        value={shell}
        onChange={(next) => change(next)}
      />
    </div>
  );
}

/**
 * Whether the master switch is on, as last seen by the settings row. The bottom tab's
 * `available()` is synchronous, so it reads this cache instead of fetching: the
 * section refreshes on mount and after every write, and the tab re-reads the catalog
 * itself before allocating, so a stale value here can only grey out a menu entry.
 */
let bottomTerminalEnabled = true;

/**
 * The bottom-terminal section: a MASTER switch, then one child switch per shell the
 * machine actually has.
 *
 * Two levels because the two decisions are different in kind: whether this plugin
 * offers a terminal at all, versus which shells it may start. And every state string
 * comes from the host's catalog - the browser probes nothing, because two discovery
 * implementations drift (that is how an MSYS2 `bash.exe` ended up labelled "Git Bash"
 * in the sibling plugin).
 */
function ShellDockSection() {
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  /** Read the catalog once, reporting an absent route as an error rather than a blank. */
  const reload = (): void => {
    bridgeConfig().then((v) => {
      setSnapshot(v);
      if (v === null) setError("no-route");
      else {
        bottomTerminalEnabled = v.enabled !== false;
        hostSettingsSurface = v.settingsSurface ?? "unknown";
      }
    });
  };
  useEffect(() => {
    // The read is a `.then`, not an awaited body: the effect itself must not set
    // state synchronously (the host's own hook lint forbids it, and a synchronous
    // first paint would flash the unmounted state).
    reload();
  }, []);

  const rows = catalogOf(snapshot);
  const [shimNote, setShimNote] = useState("");
  /**
   * Flip the official-row opt-in. The config write comes first (so the choice survives a
   * restart), then - only when turning ON - a live check of the service: if the host (or
   * a previous activation) already publishes `webTerminals`, we must not add a second
   * provider, because cordis refuses it and the loser's entry fails.
   */
  const writeShim = async (next: boolean): Promise<void> => {
    setPending(true);
    setError("");
    try {
      const v = await post<ConfigSnapshot>({ op: "shim", shim: next });
      setSnapshot(v);
      setShimNote(next && v.shimOfficialTerminal === true ? tryPublishShim() : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };
  const write = async (body: Record<string, unknown>): Promise<void> => {
    setPending(true);
    setError("");
    try {
      const v = await post<ConfigSnapshot>(body);
      setSnapshot(v);
      if (typeof v.enabled === "boolean") bottomTerminalEnabled = v.enabled;
      hostSettingsSurface = v.settingsSurface ?? hostSettingsSurface;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  if (rows === null) {
    // The terminal route never answered (the legacy bridge may have). Say so and
    // offer a re-check: silence here is the "settings row exists but does nothing"
    // failure mode.
    return (
      <div className="btNotice">
        {translate("dock.unavailable.notInstalled")}{" "}
        <button type="button" className="btSelector" style={{ height: 28, fontSize: 12 }} onClick={() => reload()}>
          {translate("dock.refresh")}
        </button>
      </div>
    );
  }

  const enabled = snapshot?.enabled !== false;
  const usable = rows.filter((row) => row.activated && row.available);
  // One source of truth for "this row deserves a switch", shared with the tab's own
  // picker and asserted in test/browser.mjs (a render assertion cannot reach it, since
  // the catalog arrives in an effect).
  const switchable = new Set(switchableRows(rows).map((row) => row.id));
  const unavailableReason = snapshot?.unavailable ?? "ok";
  const notice = snapshot?.effective;
  return (
    <div>
      <div className="btRow" style={{ borderBottom: "none", paddingBottom: 4 }}>
        <div className="btRowText">
          <div className="btTitle">{translate("dock.title")}</div>
          <div className="btDesc">{translate("dock.hint")}</div>
        </div>
      </div>
      {unavailableReason !== "ok" && unavailableReason !== "disabled" ? (
        <div className="btNotice btWarn">
          {unavailableReason === "no-pty-backend"
            ? translate("dock.unavailable.noPty")
            : unavailableReason === "no-websocket-route"
              ? translate("dock.unavailable.noSocket")
              : translate("dock.unavailable.notInstalled")}
        </div>
      ) : null}
      {/* Which terminal surface the user is looking at: the host's own, or ours. */}
      {hostOwnsTerminals() ? <div className="btNotice">{translate("dock.hostProvided")}</div> : null}
      {/* ── level 1: the master switch ───────────────────────────────────── */}
      <div className="btRow btRowSwitch">
        <div className="btRowText">
          <div className="btTitle">{translate("dock.enabled.title")}</div>
          <div className="btDesc">{translate("dock.enabled.description")}</div>
        </div>
        <button
          type="button"
          className={"btSwitch" + (enabled ? " btSwitchOn" : "")}
          disabled={pending}
          aria-pressed={enabled}
          onClick={() => void write({ op: "enabled", enabled: !enabled })}
        />
      </div>
      {/* ── level 2: one switch per shell the machine actually has ───────── */}
      {!enabled ? (
        <div className="btNotice">{translate("dock.enabled.off")}</div>
      ) : (
        <>
          {rows.map((row) => (
            <div className="btRow btRowSwitch" key={row.id}>
              <div className="btRowText">
                <div className="btTitle">{row.label}</div>
                {/* The path when a shell was found, the lock rule for the floor, and
                    the reason when there is nothing to switch on. */}
                <div className="btDesc">
                  {!row.togglable
                    ? translate("dock.powershell.locked")
                    : row.available
                      ? (row.path ?? translate("dock.state.notInstalled"))
                      : translate(badgeKey(row))}
                </div>
              </div>
              <span className={"btBadge" + (row.available ? " btBadgeOk" : "")}>{translate(badgeKey(row))}</span>
              {/* No control where a choice cannot be honoured: an absent shell gets a
                  reason, not a switch that would do nothing. */}
              {switchable.has(row.id) ? (
                <button
                  type="button"
                  className={"btSwitch" + (row.activated ? " btSwitchOn" : "")}
                  disabled={pending}
                  aria-pressed={row.activated}
                  onClick={() => void write({ op: "switches", switches: { [row.id]: !row.activated } })}
                />
              ) : null}
            </div>
          ))}
          <div className="btRow btRowSwitch">
        <div className="btRowText">
          <div className="btTitle">{translate("dock.defaultChoice")}</div>
          <div className="btDesc">{translate("shell.description")}</div>
        </div>
        <ShellPicker
          rows={usable.map((row) => ({ id: row.id, label: row.label }))}
          value={usable.some((row) => row.id === (snapshot?.defaultShell ?? "")) ? (snapshot?.defaultShell ?? usable[0]?.id ?? "powershell") : (usable[0]?.id ?? "powershell")}
          onChange={(next) => void write({ op: "default", defaultShell: next })}
        />
      </div>
      <div className="btRow">
        <div className="btRowText">
          <div className="btTitle">{translate("dock.wslDistro")}</div>
        </div>
        <input
          className="btInput"
          type="text"
          defaultValue={snapshot?.wslDistro ?? ""}
          key={snapshot?.wslDistro ?? ""}
          disabled={pending}
          onBlur={(e) => {
            const value = (e.target as HTMLInputElement).value.trim();
            void write({ op: "switches", switches: {}, wslDistro: value });
          }}
        />
      </div>
      {notice?.floor === true ? (
        <div className="btNotice btWarn">{translate("dock.floor.notice", { to: notice.id })}</div>
      ) : notice?.fellBack === true ? (
        <div className="btNotice btWarn">{translate("dock.fallback.notice", { from: notice.from ?? "", to: notice.id })}</div>
      ) : null}
      {typeof snapshot?.terminals === "number" && snapshot.terminals > 0 ? (
        <div className="btNotice">{translate("dock.terminals", { count: snapshot.terminals })}</div>
      ) : null}
      {/* ── the official-row opt-in (off by default; see the description) ──── */}
      <div className="btRow btRowSwitch">
        <div className="btRowText">
          <div className="btTitle">{translate("dock.shim.title")}</div>
          <div className="btDesc">{translate("dock.shim.description")}</div>
        </div>
        <button
          type="button"
          className={"btSwitch" + (snapshot?.shimOfficialTerminal === true ? " btSwitchOn" : "")}
          disabled={pending}
          aria-pressed={snapshot?.shimOfficialTerminal === true}
          onClick={() => void writeShim(snapshot?.shimOfficialTerminal !== true)}
        />
      </div>
      {shimNote === "published" ? <div className="btNotice">{translate("dock.shim.published")}</div> : null}
      {shimNote === "host-provides" ? <div className="btNotice btWarn">{translate("dock.shim.hostProvides")}</div> : null}
        </>
      )}
      {pending ? <div className="btNotice">{translate("dock.applying")}</div> : null}
      {error !== "" && error !== "no-route" ? (
        <div className="btNotice btWarn">{translate("dock.failed", { message: error })}</div>
      ) : null}
    </div>
  );
}

/** dsh-better-sidebar's extension service - optional, because that plugin may be absent. */
interface BetterSidebarService {
  registerTab(descriptor: Record<string, unknown>): () => void;
}

interface ClientContext {
  effect(fn: () => unknown, name?: string): unknown;
  /** Soft read: the ONLY legal way to look at a service missing from `inject`. */
  get?(name: string): unknown;
  /**
   * Publish a service. Exactly one call site, and it is gated: the official-row opt-in
   * re-reads `webTerminals` through `get` first, because providing a name the host's own
   * controller already claimed fails THAT entry (findings D15-1). Never call this from
   * `apply()` unconditionally.
   */
  provide?(name: string, service: unknown): unknown;
  locale: {
    register(ns: string, dicts: Record<string, Record<string, string>>): unknown;
    bind?(ns: string): (key: string, params?: Record<string, string | number>) => string;
  };
  slots: {
    inject(slot: string, fn: () => unknown, name?: string): void;
    register(options: Record<string, unknown>, Component: unknown): Record<string, unknown>;
    /** Read the ledger of a slot: the only way to ask whether another plugin claimed it. */
    entries?(slot: string): { options: { id?: string; key?: string } }[];
  };
  /**
   * Service-arrival callback. Optional because the oldest hosts have no browser module
   * table at all; where it exists it is the reliable way to find `betterSidebar`.
   *
   * Note what is NOT here: a `betterSidebar` property. Cordis exposes requested services
   * as properties on the ARRIVAL context only - on the apply context the same read
   * throws "cannot get property 'betterSidebar' without inject". Keeping the key out of
   * this type is what turns that runtime trap into a compile error.
   */
  inject?(deps: string[], callback: (arrived: { betterSidebar?: BetterSidebarService }) => void): void;
}

/**
 * The settings body. ONE component, rendered by whichever surface carries this plugin's
 * controls - the bundle detail card, the family tab and the fallback section must not be
 * three copies that can drift (the family contract's "one source of truth" rule).
 */
function SettingsBody() {
  return (
    <>
      <ShellPreferenceRow />
      <ShellDockSection />
    </>
  );
}

/**
 * Whether the host renders a settings page, as the host half reported it (`page` /
 * `none` / `unknown`). Only `none` - 0.1.0 and 0.1.1, which declare the `settings.*` slot
 * map but ship no page that renders it - unlocks the floating panel below.
 */
let hostSettingsSurface = "unknown";

/**
 * The 0.1.0/0.1.1 way in, and nothing more.
 *
 * Those two lines declare the whole `settings.*` slot map but ship no settings page, so a
 * registered card there is a card nobody can open - the only surface that renders is a
 * shell-level overlay the plugin brings itself. Everywhere else this returns null, which
 * is why the arm can be registered unconditionally at apply time (the family contract's
 * rule) while the DECISION stays data-driven: the host half probes the first-generation
 * seam and the row obeys the answer.
 */
function SettingsOverlayEntry() {
  const [open, setOpen] = useState(false);
  if (hostSettingsSurface !== "none") return null;
  return (
    <div style={{ position: "fixed", right: "16px", bottom: "110px", zIndex: 10000 }}>
      {open ? <div className="btOverlay" onClick={() => setOpen(false)} /> : null}
      {open ? (
        <div className="btPanel">
          <button
            type="button"
            className="btSelector"
            style={{ float: "right", height: "30px", fontSize: "12px", marginBottom: "8px" }}
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
          <SettingsBody />
        </div>
      ) : null}
      <button type="button" className="btGear" title={translate("shell.title")} onClick={() => setOpen(!open)}>
        ⚙
      </button>
    </div>
  );
}

/**
 * The services this client half consumes. Declared, not guessed: the loader hands
 * `apply` a context carrying exactly these.
 *
 * What the declaration list really controls (learned by being wrong about it on
 * 0.2.0-rc.2): the context is a Proxy, and `ctx.someService` THROWS
 * "cannot get property 'someService' without inject" for any name absent from this
 * list. `ctx.get(name)` and `ctx.inject(names, cb)` are the two legal ways to reach an
 * undeclared or optional service - and optional is exactly what `betterSidebar` and
 * `webTerminals` are, so neither may ever appear as a property read.
 */
export const inject: string[] = ["slots", "locale"];

export function apply(ctx: ClientContext): void {
  const safe = (tag: string, fn: () => void): void => {
    try {
      fn();
    } catch (e) {
      console.warn(`[dsh-bash-terminal-ts] client surface '${tag}' failed:`, e);
    }
  };
  safe("locale", () => {
    ctx.effect(() => ctx.locale.register(SETTINGS_NS, dictionaries), "bash-terminal: settings dictionaries");
    // bind() exists on 0.1.2+; the oldest lines have no locale service at all, and
    // the module fallback (zh) is then the honest answer.
    const bound = ctx.locale.bind?.call(ctx.locale, SETTINGS_NS);
    if (typeof bound === "function") setTranslator(bound);
  });
  /**
   * This plugin NEVER provides `webTerminals`. Measured on 0.2.0-rc.2: the host's
   * `dsh-api-terminal-controller` provides the same service name and its `provide`
   * is unguarded, so whichever entry wins the boot race decides who dies - and ours
   * won, taking down the first-party terminal and the whole web boot with
   * `service "webTerminals" has been registered`. The bottom-dock feature does not
   * need the service either: this plugin ships its own tab, which works whether or
   * not the host has a controller. All that is left here is the read that drives the
   * notice above.
   */
  safe("webTerminals", () => {
    hostOwnsTerminals = () => looksLikeTerminals(ctx.get?.("webTerminals"));
    tryPublishShim = () => {
      if (shimInstance !== undefined) return "published";
      // The check is the whole point of making this opt-in: "the operator said so" is
      // not evidence that the name is free, and taking it anyway would fail the host's
      // own controller entry.
      if (looksLikeTerminals(ctx.get?.("webTerminals"))) return "host-provides";
      const terminals = new BridgeTerminals();
      ctx.effect(() => () => {
        terminals.disposeAll();
        shimInstance = undefined;
      }, "bash-terminal: official-row shim");
      ctx.provide?.("webTerminals", terminals);
      shimInstance = terminals;
      return "published";
    };
  });
  // ── settings surfaces ────────────────────────────────────────────────────────
  //
  // Two landing points plus a fallback that keeps the controls reachable when
  // neither has a host:
  //
  //   1. the bundle detail page (`plugins.bundle.config`, keyed by the package name) -
  //      the host's own per-plugin configuration card, present on 0.1.7+/0.2.0; on
  //      0.1.2/0.1.5 the era-equivalent dispatch is `settings.plugin.item`, keyed by the
  //      settings namespace, so both are declared;
  //   2. this plugin's OWN top-level `settings.section` (id `bash-terminal`), registered
  //      unconditionally. It used to stand down while a `dsh-family` row existed and
  //      contribute a family tab instead; that coupling made the family container a
  //      single point of failure for these settings, and the tab is gone now (2026-10-14).
  //      Registering under our own id — never shadowing `dsh-family` — is what keeps the
  //      family contract intact: two nav rows, no double-rendered section.
  //   3. `shell.overlay` for the lines with no settings page at all.
  //
  // Every arm is registered at apply-time top level (registering from inside an inject
  // callback is the two-generation accident this family keeps re-learning), each is
  // wrapped on its own so one unknown slot name cannot take the rest down, and an inject
  // into a slot the host does not declare simply idles - an undischarged wait never
  // blocks the client half.
  safe("plugins.bundle.config", () => {
    ctx.slots.inject(
      "plugins.bundle.config",
      () => ctx.slots.register({ name: "plugins.bundle.config", key: "dsh-bash-terminal-ts", locale: SETTINGS_NS, inject: () => ({}) }, SettingsBody),
      "bash-terminal: bundle config card",
    );
  });
  safe("settings.plugin.item", () => {
    ctx.slots.inject(
      "settings.plugin.item",
      () => ctx.slots.register({ name: "settings.plugin.item", key: SETTINGS_NS, locale: SETTINGS_NS, inject: () => ({}) }, SettingsBody),
      "bash-terminal: legacy plugin settings card",
    );
  });
  safe("settings.section", () => {
    ctx.slots.inject(
      "settings.section",
      function* () {
        // Unconditional since the family tab was dropped: this plugin owns a nav row,
        // so it must not depend on another plugin's container existing. The register
        // still happens at the declaration event (the generator runs when the host
        // declares the slot), which is what kept the old probe honest about bundle order.
        yield ctx.slots.register(
          {
            name: "settings.section",
            id: "bash-terminal",
            order: 45,
            label: () => translate("shell.title"),
            locale: SETTINGS_NS,
            inject: () => ({}),
          },
          SettingsBody,
        );
      },
      "bash-terminal: own settings section",
    );
  });
  safe("shell.overlay", () => {
    // Registered always, rendered only on the two lines with no settings page (the
    // component itself returns null). Registering conditionally would mean deciding at
    // apply time, before the host's probe has answered.
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register({ name: "shell.overlay", id: "bash-terminal-settings" }, SettingsOverlayEntry),
      "bash-terminal: last-resort panel for hosts with no settings page",
    );
  });
  // The multi-shell bottom tab. Reached through `ctx.inject` rather than a one-shot
  // `ctx.get`: reading once would make this depend on dsh-better-sidebar's client
  // happening to run first in the bundle order, and a silently missing tab is exactly
  // the failure nobody notices until it is not there. `inject` fires when the service
  // arrives; if that plugin is not installed the callback simply never runs - which is
  // also why `betterSidebar` stays out of the declared `inject` list: without it this
  // plugin's settings row and terminal shim must still load.
  let tabRegistered = false;
  const registerMultiShellTab = (service: BetterSidebarService | undefined): void => {
    if (service?.registerTab === undefined || tabRegistered) return;
    tabRegistered = true;
    ctx.effect(
      () =>
        service.registerTab({
          id: "dsh-bash-terminal-ts:multi",
          title: () => translate("tab.title"),
          description: () => translate("tab.description"),
          // Bottom workbench only: without this the type also becomes a capsule in
          // DSH's native right sidebar, i.e. a second "Terminal" next to the host's.
          bottomOnly: true,
          order: 41,
          single: false,
          // Reads the cached master switch: the + menu asks synchronously, and a
          // greyed-out entry is a far better answer than a tab that refuses to open.
          available: () => bottomTerminalEnabled,
          component: (props: unknown) => <MultiShellTerminal {...(props as object)} />,
        }),
      "bash-terminal: multi-shell bottom tab",
    );
  };
  safe("betterSidebar.registerTab", () => {
    // Arrival-driven: dsh-better-sidebar's client may run after ours, and a one-shot
    // read would then leave the tab silently absent.
    if (typeof ctx.inject === "function") {
      ctx.inject(["betterSidebar"], (arrived) => registerMultiShellTab(arrived.betterSidebar));
    }
    // Soft read for the case where the service is already published. `ctx.get` is the
    // ONLY legal way to look at an undeclared service: the client context is a Proxy
    // and `ctx.betterSidebar` throws "cannot get property \"betterSidebar\" without
    // inject" (measured on 0.2.0-rc.2), which used to kill this whole block.
    registerMultiShellTab(ctx.get?.("betterSidebar") as BetterSidebarService | undefined);
  });
}
