// The wiring seam between the plugin's live config and the browser terminal.
//
// It lives in its own module because of one hard ordering fact (findings F1): the
// host entry this plugin ships returns early on non-Windows platforms, since the
// *model tool* is Windows-only. The browser terminal is not a Windows-only idea,
// so its mount has to happen before that return - and keeping it in one call makes
// that ordering visible at the call site instead of buried in a 1000-line apply().
//
// Everything environment-dependent arrives as live reads (config fields are
// `.volatile()` on the 0.1.7+ lines, and older lines re-read from the same
// closure), never a snapshot: a switch flipped in the settings page must apply to
// the next allocation without a restart.
import { createCatalogProvider } from "./catalog.js";
import { listWslDistros } from "./catalog.js";
import { reportSettingsSurface, settingsSurface } from "../settings-surface.js";
import { registerUiTerminalRoutes } from "./host.js";
import { UiTerminalRegistry } from "./registry.js";
import { createUiSpawner, detectBackend } from "./pty.js";
import { SHELL_PRIORITY } from "../shells.js";
/** How many terminals one session may hold, and how many exist host-wide. */
const MAX_PER_SESSION = 6;
const MAX_TOTAL = 12;
/** Detached-shell grace: long enough to survive a page reload, short enough to
 * not leak a shell someone abandoned. */
const IDLE_GRACE_MS = 120_000;
/** Replayed screen budget per terminal. */
const SCROLLBACK_BYTES = 200_000;
/** Read a config field that may be a value or a live ref. */
function live(value, fallback) {
    if (typeof value === "object" && value !== null && typeof value.get === "function") {
        const got = value.get();
        return got === undefined ? fallback : got;
    }
    return value === undefined ? fallback : value;
}
/**
 * Mount the browser terminal: routes, socket, registry, catalog cache.
 * @returns the disposer and the availability answer the settings page reads.
 */
export function mountBrowserTerminals(input) {
    const platform = input.platform ?? process.platform;
    const config = input.config;
    /**
     * In-process overrides for the fields this feature writes.
     *
     * Hosts up to 0.1.6 have no config hot-reload: `settings.mutate` persists the
     * value, but the object handed to `apply` never changes, so a switch flipped in
     * the settings page would only take effect after a restart. The plugin's legacy
     * bridge already solves that for `defaultShell` with a `shellOverride`; this is
     * the same mechanism for the activation switches. On 0.1.7+ the `.volatile()` ref
     * is already live, the map merely shadows it with the value we just wrote - a
     * no-op in the good case, the fix in the old one.
     */
    const overrides = new Map();
    const readField = (key, fallback) => {
        if (overrides.has(key))
            return overrides.get(key);
        return live(config[key], fallback);
    };
    const switches = () => ({
        // Powershell is not in here: it is the floor and has no switch by design (R2).
        gitbash: readField("shellGitBash", true),
        msys2: readField("shellMsys2", true),
        wsl: readField("shellWsl", true),
    });
    const wslDistro = () => readField("wslDistro", "").trim();
    /** The master switch: off hides the child switches and refuses allocations. */
    const enabled = () => readField("bottomTerminal", true);
    /**
     * Opt-in to publishing `webTerminals` for the official bottom row. Off by default and
     * deliberately NOT derived from "no controller detected": the client-side check that
     * would be needed for that is a boot-time race, and losing it takes down the host's
     * own terminal (findings D15-1).
     */
    const shimOfficialTerminal = () => readField("shimOfficialTerminal", false);
    // The WSL distro list, probed LAZILY on the first catalog read and re-probed
    // after a switch write. `undefined` is "still unknown / the probe timed out",
    // which the catalog treats as neutral rather than as evidence of absence.
    // Lazy matters: mounting the routes must not spawn `wsl.exe` in a process that
    // never opens a terminal (unit mocks, headless hosts, non-WSL machines).
    let distros;
    let probing = false;
    const reprobe = () => {
        probing = true;
        void listWslDistros(input.paths.wsl).then((found) => {
            distros = found;
            probing = false;
            catalog.invalidate();
        }, () => {
            probing = false;
        });
    };
    const catalog = createCatalogProvider({
        paths: () => input.paths,
        switches,
        wslDistro,
        distros: () => {
            if (distros === undefined && !probing)
                reprobe();
            return distros;
        },
    });
    const backend = detectBackend({ platform, seam: input.ctx.subprocess });
    const spawner = backend === undefined ? undefined : createUiSpawner({ platform, seam: input.ctx.subprocess });
    const registry = new UiTerminalRegistry({
        maxPerSession: MAX_PER_SESSION,
        maxTotal: MAX_TOTAL,
        idleGraceMs: IDLE_GRACE_MS,
        scrollback: SCROLLBACK_BYTES,
        spawn: async (spec) => {
            if (spawner === undefined)
                throw new Error("no PTY backend on this host");
            return await spawner.spawn(spec);
        },
    });
    let unavailable = "not-installed";
    let routes;
    const isLoopback = (request) => {
        const addr = request.socket?.remoteAddress ?? "";
        return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
    };
    const cwdFor = (sessionId) => {
        const sessions = (input.ctx.get?.("sessions") ?? undefined);
        return sessions?.get?.(sessionId)?.header?.cwd ?? process.cwd();
    };
    // webServer arrives only through injection; until then the routes report their
    // absence rather than pretending a terminal is available.
    input.ctx.inject?.(["webServer", "settings"], (svcCtx) => {
        // Classified the moment the settings service arrives: the browser cannot tell which
        // generation it is talking to, and the answer decides whether it paints its own
        // floating panel or stays out of the way.
        reportSettingsSurface(svcCtx.settings);
        routes = registerUiTerminalRoutes(svcCtx.webServer, {
            catalog: () => catalog.catalog(),
            paths: () => input.paths,
            env: (id) => catalog.env(id),
            enabled,
            shimOfficialTerminal,
            settingsSurface,
            configuredShell: input.configuredShell,
            switches,
            wslDistro,
            writeConfig: async (path, value) => {
                await input.persist(svcCtx.settings, path, value);
                // Remember it for this process too (the ≤0.1.6 hot-reload gap above).
                overrides.set(path.join("."), value);
                // A write also forgets the cached catalog and the WSL answer, so the
                // settings row never reports a stale result immediately after a click.
                distros = undefined;
                catalog.invalidate();
            },
            registry,
            cwdFor,
            unavailableReason: () => unavailable,
            isLoopback,
        });
        unavailable = backend === undefined ? "no-pty-backend" : routes.socket === "mounted" ? "ok" : routes.socket;
        input.ctx.logger?.info?.(`dsh-bash-terminal-ts: browser terminal routes ${unavailable} (backend=${backend ?? "none"}, priority=${SHELL_PRIORITY.join(">")})`);
        svcCtx.effect(() => () => {
            routes?.dispose();
            void registry.dispose();
        }, "bash-terminal: browser terminal routes");
    });
    return {
        unavailable: () => unavailable,
        dispose: () => {
            routes?.dispose();
            void registry.dispose();
        },
    };
}
