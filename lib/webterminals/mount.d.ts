import type { ResolvedPaths } from "../dsh-types.js";
/** The service-arrival context cordis hands the `inject` callback. */
interface ArrivalContext {
    webServer?: unknown;
    settings?: unknown;
    effect(fn: () => unknown, name?: string): unknown;
}
/** What the caller passes; all of it comes from the plugin's own context. */
export interface MountInput {
    /** The plugin context, widened: only three reads are used. */
    ctx: {
        subprocess?: {
            spawnTerminal?: unknown;
        };
        get?(name: string): unknown;
        effect(fn: () => unknown, name?: string): unknown;
        inject?(deps: string[], fn: (svcCtx: ArrivalContext) => void): void;
        logger?: {
            info?(msg: string): void;
            warn?(msg: string): void;
        };
    };
    config: Record<string, unknown>;
    paths: ResolvedPaths;
    /** The stored default shell ('' when the user never chose one). */
    configuredShell(): string;
    /**
     * Persist one config path. index.ts owns this (it holds the settings-service
     * dance for every line, including the <=0.1.6 self-registration retry), and the
     * service instance only exists here, so it is passed back in.
     */
    persist(svc: unknown, path: readonly string[], value: unknown): Promise<void>;
    /**
     * True when the startup payload gate was vetoed by a detected WSL distro
     * (index.ts owns the answer; the catalog only uses it for the row badge).
     */
    payloadSuppressed?(): boolean;
    platform?: NodeJS.Platform;
}
/** The mount outcome, reported through the routes' `unavailable` field. */
export interface BrowserTerminalMount {
    /** 'ok', or why a terminal cannot be offered. */
    unavailable(): string;
    dispose(): void;
}
/**
 * Mount the browser terminal: routes, socket, registry, catalog cache.
 * @returns the disposer and the availability answer the settings page reads.
 */
export declare function mountBrowserTerminals(input: MountInput): BrowserTerminalMount;
export {};
