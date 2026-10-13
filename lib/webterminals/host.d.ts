import type { CatalogFacts, ShellEntry, ShellSwitches } from "../shells.js";
import type { SettingsSurface } from "../settings-surface.js";
import type { ShellId } from "../shell-id.js";
import type { UiTerminalRegistry } from "./registry.js";
import { type UpgradeCapableServer } from "./ws.js";
/** The JSON route path (POST-only, loopback-gated like the config bridge). */
export declare const TERMINAL_API_PATH = "/api/bash-terminal/terminals";
/** What the caller must supply; everything fs/session-related stays outside this file. */
export interface UiBridgeDeps {
    /** A live catalog (the caller owns the TTL cache). */
    catalog(): ShellEntry[];
    /** The catalog facts, for the paths the fallback chain still needs. */
    paths(): CatalogFacts["paths"];
    /** The stored default (`''` when the user never chose). */
    configuredShell(): string;
    /** The stored switches, already defaulted against discovery. */
    switches(): ShellSwitches;
    /** The stored WSL distro (`''` = the WSL default), echoed so the input can show it. */
    wslDistro(): string;
    /** The UI environment for one backend (process.env plus its own rules). */
    env(id: ShellId): Record<string, string | undefined>;
    /**
     * The master switch. Off is not "no shells chosen": the child switches are hidden
     * (a switch for something that cannot run is a lie), and no allocation is served.
     */
    enabled(): boolean;
    /**
     * The opt-in that lets this plugin publish the `webTerminals` service for
     * dsh-better-sidebar's OFFICIAL terminal row. Default false: on a host that ships
     * its own terminal controller, the first client to `provide` that name wins and the
     * loser's entry fails - and the controller's provide is unguarded, so an opt-out
     * default would break the first-party terminal (measured on 0.2.0-rc.2).
     */
    shimOfficialTerminal(): boolean;
    /**
     * Whether this host line renders a settings page at all (`src/settings-surface.ts`).
     * The client cannot probe this and must not guess: on 0.1.0/0.1.1 the `settings.*` slot
     * map exists but no page renders it, so a registered card is unreachable - and those are
     * the only lines where the plugin's own floating panel is the way in.
     */
    settingsSurface(): SettingsSurface;
    /** Persist one config path (the caller wires `settings.mutate`). */
    writeConfig(path: readonly string[], value: unknown): Promise<void>;
    /** Allocate a terminal for one session; the host picks the shell. */
    registry: UiTerminalRegistry;
    /** The session's working directory ('' when the host cannot say). */
    cwdFor(sessionId: string): string;
    /** Why the bridge cannot serve a terminal, or 'ok'. */
    unavailableReason(): string;
    /** Loopback gate, shared with the config bridge's rule. */
    isLoopback(request: {
        socket?: {
            remoteAddress?: string;
        };
    }): boolean;
    log?(level: "info" | "warn", message: string): void;
}
/**
 * Register the terminal routes.
 * @param webServer - the host webserver (may lack upgrade support).
 * @param deps - the wiring above.
 * @returns a disposer, plus the reason when the host cannot carry a socket.
 */
export declare function registerUiTerminalRoutes(webServer: UpgradeCapableServer | undefined, deps: UiBridgeDeps): {
    dispose(): void;
    socket: "mounted" | "no-websocket-route";
};
