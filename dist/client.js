window.__ModuleLoader__.load({
	id: "dsh-bash-terminal-ts",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var SETTINGS_NS = "settings.bash-terminal";
var SHELLS = ["powershell", "gitbash", "msys2", "wsl"];
var ROW_CSS = ".btRow{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}.btRowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}.btTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}.btDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}.btSelector{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.btSelector:hover{background:var(--dsw-alias-interactive-bg-hover)}.btGear{position:fixed;right:16px;bottom:110px;z-index:10000;width:40px;height:40px;border-radius:50%;border:1px solid rgba(127,127,127,.4);background:rgba(30,30,32,.85);color:inherit;cursor:pointer;font-size:17px;box-shadow:0 4px 16px rgba(0,0,0,.35)}.btOverlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45)}.btPanel{position:fixed;top:6vh;left:50%;transform:translateX(-50%);width:min(760px,92vw);max-height:84vh;overflow-y:auto;z-index:10001;background:var(--dsw-alias-bg-module-platform,rgba(30,30,32,.92));border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));border-radius:14px;padding:20px;color:var(--dsw-alias-label-primary)}";
if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="bash-terminal-row"]') === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-bash-terminal-ts";
  tag.dataset.pluginCss = "bash-terminal-row";
  tag.textContent = ROW_CSS;
  document.head.appendChild(tag);
}
var zh = {
  "shell.title": "\u9ED8\u8BA4\u7EC8\u7AEF",
  "shell.description": "shell \u5DE5\u5177\u6267\u884C\u547D\u4EE4\u65F6\u4F7F\u7528\u7684\u7EC8\u7AEF",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "\u8BBE\u7F6E\u9762\u4E0D\u53EF\u7528:\u5BBF\u4E3B\u914D\u7F6E\u6865\u672A\u54CD\u5E94(\u68C0\u67E5\u5BBF\u4E3B\u662F\u5426\u4E3A compat \u7248)"
};
var en = {
  "shell.title": "Default terminal",
  "shell.description": "Terminal used by the shell tool",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Settings unavailable: the host config bridge did not respond (is the host a compat build?)"
};
var fr = {
  "shell.title": "Terminal par d\xE9faut",
  "shell.description": "Terminal utilis\xE9 par l'outil shell",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Param\xE8tres indisponibles: le pont de configuration de l'h\xF4te n'a pas r\xE9pondu"
};
var de = {
  "shell.title": "Standardterminal",
  "shell.description": "Terminal f\xFCr den Shell-Befehl",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Einstellungen nicht verf\xFCgbar: Die Konfigurationsbr\xFCcke des Hosts hat nicht geantwortet"
};
var it = {
  "shell.title": "Terminale predefinito",
  "shell.description": "Terminale usato dal comando shell",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Impostazioni non disponibili: il bridge di configurazione dell'host non ha risposto"
};
var ru = {
  "shell.title": "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
  "shell.description": "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B \u0434\u043B\u044F \u043A\u043E\u043C\u0430\u043D\u0434 \u043E\u0431\u043E\u043B\u043E\u0447\u043A\u0438",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B: \u043C\u043E\u0441\u0442 \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u0438 \u0445\u043E\u0441\u0442\u0430 \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B"
};
var es = {
  "shell.title": "Terminal predeterminada",
  "shell.description": "Terminal usada por el comando shell",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Configuraci\xF3n no disponible: el puente de configuraci\xF3n del host no respondi\xF3"
};
var zhDictTitle = () => zh["shell.title"] ?? "Terminal";
async function bridgeConfig() {
  try {
    const r = await fetch("/api/bash-terminal/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const d = await r.json();
    return d && d.ok ? d.value : null;
  } catch {
    return null;
  }
}
async function bridgeWrite(value) {
  try {
    const r = await fetch("/api/bash-terminal/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultShell: value })
    });
    const d = await r.json();
    return !!(d && d.ok);
  } catch {
    return false;
  }
}
function ShellPreferenceRow() {
  const [shell, setShell] = (0, import_react.useState)("powershell");
  const [status, setStatus] = (0, import_react.useState)("loading");
  (0, import_react.useEffect)(() => {
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
  const change = (value) => {
    setShell(value);
    void bridgeWrite(value);
  };
  if (status === "unavailable") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "btRow", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "btRowText", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "btTitle", children: zh["shell.title"] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "btDesc", children: zh["shell.unavailable"] })
    ] }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "btRow", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "btRowText", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "btTitle", children: zh["shell.title"] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "btDesc", children: zh["shell.description"] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "select",
      {
        className: "btSelector",
        value: shell,
        onChange: (e) => change(e.target.value),
        children: SHELLS.map((id) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: id, children: zh["shell." + id] ?? id }, id))
      }
    )
  ] });
}
function SettingsOverlayEntry() {
  const [open, setOpen] = (0, import_react.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { position: "fixed", right: "16px", bottom: "110px", zIndex: 1e4 }, children: [
    open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "btOverlay", onClick: () => setOpen(false) }) : null,
    open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "btPanel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "btSelector",
          style: { float: "right", height: "30px", fontSize: "12px", marginBottom: "8px" },
          onClick: () => setOpen(false),
          children: "\u2715"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShellPreferenceRow, {})
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "btGear", title: zhDictTitle(), onClick: () => setOpen(!open), children: "\u2699" })
  ] });
}
function apply(ctx) {
  const safe = (tag, fn) => {
    try {
      fn();
    } catch (e) {
      console.warn(`[dsh-bash-terminal-ts] client surface '${tag}' failed:`, e);
    }
  };
  safe("locale", () => {
    ctx.effect(
      () => ctx.locale.register(SETTINGS_NS, { zh, en, fr, de, it, ru, es }),
      "bash-terminal: settings dictionaries"
    );
  });
  safe("dsh-family.tab", () => {
    ctx.slots.inject(
      "dsh-family.tab",
      () => ctx.slots.register(
        {
          name: "dsh-family.tab",
          id: "bash-terminal-shell",
          order: 60,
          label: zhDictTitle,
          locale: SETTINGS_NS,
          inject: () => ({})
        },
        () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShellPreferenceRow, {})
      ),
      "bash-terminal: settings row"
    );
  });
  safe("shell.overlay", () => {
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register({ name: "shell.overlay", id: "bash-terminal-settings" }, () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsOverlayEntry, {}))
    );
  });
}

		return module.exports;
	}
});
