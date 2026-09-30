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
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_dsh_client_store = require("@deepseek-ai/dsh-client-store");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
var SETTINGS_NS = "settings.bash-terminal";
var ENTRY_ID = "tool-bash-terminal";
var SHELLS = ["powershell", "gitbash", "msys2", "wsl"];
var ROW_CSS = ".btRow{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}.btRowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}.btTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}.btDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}.btSelector{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.btSelector:hover{background:var(--dsw-alias-interactive-bg-hover)}.btChevron{flex:none}";
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
  "shell.unavailable": "\u8BBE\u7F6E\u9762\u4E0D\u53EF\u7528\uFF1A\u5BBF\u4E3B\u672A\u63D0\u4F9B\u672C\u63D2\u4EF6\u7684 configForms \u6761\u76EE\uFF08\u68C0\u67E5 cordis.patch.yml \u7684 entry id\uFF09"
};
var en = {
  "shell.title": "Default terminal",
  "shell.description": "Terminal used by the shell tool",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Settings unavailable: the host exposes no configForms entry for this plugin (check the cordis.patch.yml entry id)"
};
var fr = {
  "shell.title": "Terminal par d\xE9faut",
  "shell.description": "Terminal utilis\xE9 par l'outil shell",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Param\xE8tres indisponibles : l'h\xF4te n'expose aucune entr\xE9e configForms pour ce plugin (v\xE9rifiez l'entry id du cordis.patch.yml)"
};
var de = {
  "shell.title": "Standard-Terminal",
  "shell.description": "Terminal, das vom Shell-Tool verwendet wird",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Einstellungen nicht verf\xFCgbar: Der Host stellt keinen configForms-Eintrag f\xFCr dieses Plugin bereit (Entry-ID in cordis.patch.yml pr\xFCfen)"
};
var it = {
  "shell.title": "Terminale predefinito",
  "shell.description": "Terminale usato dallo strumento shell",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Impostazioni non disponibili: l'host non espone alcuna voce configForms per questo plugin (verifica l'entry id in cordis.patch.yml)"
};
var ru = {
  "shell.title": "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
  "shell.description": "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u043C\u044B\u0439 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u043E\u043C shell",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B: \u0445\u043E\u0441\u0442 \u043D\u0435 \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u044C configForms \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u043F\u043B\u0430\u0433\u0438\u043D\u0430 (\u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 entry id \u0432 cordis.patch.yml)"
};
var es = {
  "shell.title": "Terminal predeterminado",
  "shell.description": "Terminal que usa la herramienta shell",
  "shell.powershell": "PowerShell",
  "shell.gitbash": "Git Bash",
  "shell.msys2": "MSYS2",
  "shell.wsl": "WSL",
  "shell.unavailable": "Configuraci\xF3n no disponible: el host no expone ninguna entrada configForms para este plugin (comprueba el entry id de cordis.patch.yml)"
};
var inject = ["slots", "locale", "configForms"];
function ShellPreferenceRow({ t, useStore, setShell }) {
  const shell = useStore((s) => s.shell);
  const writable = useStore((s) => s.writable);
  const status = useStore((s) => s.status);
  const [open, setOpen] = (0, import_react.useState)(false);
  const items = SHELLS.map((id) => ({ id, label: t("shell." + id) }));
  if (status === "unavailable") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "btRow", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "btRowText", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "btTitle", children: t("shell.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "btDesc", children: t("shell.unavailable") })
    ] }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "btRow", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "btRowText", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "btTitle", children: t("shell.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "btDesc", children: t("shell.description") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.Menu,
      {
        open,
        onClose: () => setOpen(false),
        items,
        selectedId: shell,
        onSelect: (id) => {
          setOpen(false);
          setShell(id);
        },
        align: "end",
        portal: true,
        anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            className: "btSelector",
            "aria-haspopup": "menu",
            "aria-expanded": open,
            disabled: !writable,
            onClick: () => setOpen(!open),
            style: !writable ? { opacity: 0.5, cursor: "not-allowed" } : void 0,
            children: [
              t("shell." + shell),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineMedium, { className: "btChevron" })
            ]
          }
        )
      }
    )
  ] });
}
var zhDictTitle = () => zh["shell.title"] ?? "\u7EC8\u7AEF";
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en, fr, de, it, ru, es }), "bash-terminal: settings dictionaries");
  const scope = ctx.configForms.get(ENTRY_ID);
  const store = (0, import_dsh_client_store.defineStore)({
    init: () => ({ shell: "powershell", revision: -1, writable: false, status: "loading" }),
    actions: {
      sync: (d, shell, revision, writable, status) => {
        if (revision !== void 0 && revision <= d.revision) return;
        if (shell !== void 0) d.shell = shell;
        if (revision !== void 0) d.revision = revision;
        if (writable !== void 0) d.writable = writable;
        if (status !== void 0) d.status = status;
      }
    }
  });
  let bound;
  const push = (snap) => {
    bound?.sync(snap.value?.defaultShell, snap.revision, snap.writable, snap.status);
  };
  ctx.slots.inject(
    "dsh-family.tab",
    () => ctx.slots.register(
      {
        name: "dsh-family.tab",
        id: "bash-terminal-shell",
        order: 60,
        label: () => zhDictTitle(),
        store,
        locale: SETTINGS_NS,
        inject: (actions) => {
          bound = actions;
          push(scope.getSnapshot());
          return { setShell: (value) => void scope.set("defaultShell", value) };
        }
      },
      ShellPreferenceRow
    ),
    "bash-terminal: settings row"
  );
  ctx.effect(() => scope.subscribe(() => push(scope.getSnapshot())), "bash-terminal: settings watch");
}
