// dsh-bash-terminal-ts client plugin (compat-legacy): a "Default terminal"
// preference row contributed to the family settings tab (dsh-family.tab,
// hosted by dsh-thinking-levels), with a shell.overlay floating-gear fallback
// for hosts without any settings surface (0.1.0/0.1.1).
//
// compat-legacy rewiring vs upstream 0.7.1:
//  - no @deepseek-ai/dsh-client-store / dsh-client-ui-primitives requires:
//    0.1.0/0.1.1 have no browser module table and 0.1.2 is unverified; the
//    row reads/writes defaultShell through the host config bridge
//    (GET/POST /api/bash-terminal/config) which works on every line.
//  - ui-primitives Menu/Icon replaced by a native select (same capsule CSS).
//  - every surface registration is independently guarded (one unknown slot
//    name on one line must not take down the rest).

import { useEffect, useState } from "react";

const SETTINGS_NS = "settings.bash-terminal";
const SHELLS = ["powershell", "gitbash", "msys2", "wsl"] as const;

// Injected once when the browser loads the bundle (node tests guard on document).
const ROW_CSS =
  ".btRow{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}.btRowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}.btTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}.btDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}.btSelector{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.btSelector:hover{background:var(--dsw-alias-interactive-bg-hover)}.btGear{position:fixed;right:16px;bottom:110px;z-index:10000;width:40px;height:40px;border-radius:50%;border:1px solid rgba(127,127,127,.4);background:rgba(30,30,32,.85);color:inherit;cursor:pointer;font-size:17px;box-shadow:0 4px 16px rgba(0,0,0,.35)}.btOverlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45)}.btPanel{position:fixed;top:6vh;left:50%;transform:translateX(-50%);width:min(760px,92vw);max-height:84vh;overflow-y:auto;z-index:10001;background:var(--dsw-alias-bg-module-platform,rgba(30,30,32,.92));border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));border-radius:14px;padding:20px;color:var(--dsw-alias-label-primary)}";
if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="bash-terminal-row"]') === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-bash-terminal-ts";
  tag.dataset.pluginCss = "bash-terminal-row";
  tag.textContent = ROW_CSS;
  document.head.appendChild(tag);
}

const zh: Record<string, string> = {
  "shell.title": "默认终端",
  "shell.description": "shell 工具执行命令时使用的终端",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "设置面不可用:宿主配置桥未响应(检查宿主是否为 compat 版)"
};
const en: Record<string, string> = {
  "shell.title": "Default terminal",
  "shell.description": "Terminal used by the shell tool",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Settings unavailable: the host config bridge did not respond (is the host a compat build?)"
};
const fr: Record<string, string> = {
  "shell.title": "Terminal par défaut",
  "shell.description": "Terminal utilisé par l'outil shell",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Paramètres indisponibles: le pont de configuration de l'hôte n'a pas répondu"
};
const de: Record<string, string> = {
  "shell.title": "Standardterminal",
  "shell.description": "Terminal für den Shell-Befehl",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Einstellungen nicht verfügbar: Die Konfigurationsbrücke des Hosts hat nicht geantwortet"
};
const it: Record<string, string> = {
  "shell.title": "Terminale predefinito",
  "shell.description": "Terminale usato dal comando shell",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Impostazioni non disponibili: il bridge di configurazione dell'host non ha risposto"
};
const ru: Record<string, string> = {
  "shell.title": "Терминал по умолчанию",
  "shell.description": "Терминал для команд оболочки",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Настройки недоступны: мост конфигурации хоста не ответил"
};
const es: Record<string, string> = {
  "shell.title": "Terminal predeterminada",
  "shell.description": "Terminal usada por el comando shell",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Configuración no disponible: el puente de configuración del host no respondió"
};

const zhDictTitle = (): string => zh["shell.title"] ?? "Terminal";

async function bridgeConfig(): Promise<{ defaultShell?: string } | null> {
  try {
    const r = await fetch("/api/bash-terminal/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const d = await r.json();
    return d && d.ok ? (d.value as { defaultShell?: string }) : null;
  } catch {
    return null;
  }
}

async function bridgeWrite(value: string): Promise<boolean> {
  try {
    const r = await fetch("/api/bash-terminal/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultShell: value }),
    });
    const d = await r.json();
    return !!(d && d.ok);
  } catch {
    return false;
  }
}

/** 默认终端选择行:配置读写全部走宿主 config bridge(六线统一)。 */
function ShellPreferenceRow() {
  const [shell, setShell] = useState("powershell");
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  useEffect(() => {
    let alive = true;
    bridgeConfig().then((v) => {
      if (!alive) return;
      if (v && v.defaultShell) {
        setShell(v.defaultShell);
        setStatus("ready");
      } else {
        setStatus("unavailable");
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  const change = (value: string): void => {
    setShell(value);
    void bridgeWrite(value);
  };
  if (status === "unavailable") {
    return (
      <div className="btRow">
        <div className="btRowText">
          <div className="btTitle">{zh["shell.title"]}</div>
          <div className="btDesc">{zh["shell.unavailable"]}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="btRow">
      <div className="btRowText">
        <div className="btTitle">{zh["shell.title"]}</div>
        <div className="btDesc">{zh["shell.description"]}</div>
      </div>
      <select
        className="btSelector"
        value={shell}
        onChange={(e) => change((e.target as HTMLSelectElement).value)}
      >
        {SHELLS.map((id) => (
          <option key={id} value={id}>
            {zh["shell." + id] ?? id}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ClientContext {
  effect(fn: () => unknown, name?: string): unknown;
  locale: { register(ns: string, dicts: Record<string, Record<string, string>>): unknown };
  slots: {
    inject(slot: string, fn: () => unknown, name?: string): void;
    register(options: Record<string, unknown>, Component: unknown): Record<string, unknown>;
  };
}

/** 无设置页宿主(0.1.0/0.1.1)兜底:浮窗齿轮 + 固定定位面板承载设置行。 */
function SettingsOverlayEntry() {
  const [open, setOpen] = useState(false);
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
          <ShellPreferenceRow />
        </div>
      ) : null}
      <button type="button" className="btGear" title={zhDictTitle()} onClick={() => setOpen(!open)}>
        ⚙
      </button>
    </div>
  );
}

export function apply(ctx: ClientContext): void {
  const safe = (tag: string, fn: () => void): void => {
    try {
      fn();
    } catch (e) {
      console.warn(`[dsh-bash-terminal-ts] client surface '${tag}' failed:`, e);
    }
  };
  safe("locale", () => {
    ctx.effect(
      () => ctx.locale.register(SETTINGS_NS, { zh, en, fr, de, it, ru, es }),
      "bash-terminal: settings dictionaries",
    );
  });
  safe("dsh-family.tab", () => {
    ctx.slots.inject(
      "dsh-family.tab",
      () =>
        ctx.slots.register(
          {
            name: "dsh-family.tab",
            id: "bash-terminal-shell",
            order: 60,
            label: zhDictTitle,
            locale: SETTINGS_NS,
            inject: () => ({}),
          },
          () => <ShellPreferenceRow />,
        ),
      "bash-terminal: settings row",
    );
  });
  safe("shell.overlay", () => {
    ctx.slots.inject(
      "shell.overlay",
      () =>
        ctx.slots.register({ name: "shell.overlay", id: "bash-terminal-settings" }, () => (
          <SettingsOverlayEntry />
        )),
    );
  });
}
