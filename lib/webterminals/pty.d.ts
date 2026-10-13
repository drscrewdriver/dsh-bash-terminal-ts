import type { TerminalSpawnSpec } from "../dsh-types.js";
import type { UiPtyHandle, UiSpawnSpec } from "./registry.js";
/** Which allocator a terminal would be created with. */
export type PtyBackend = "node-pty" | "seam";
/** The host seam, narrowed to the one call this module makes. */
export interface SeamLike {
    spawnTerminal?(spec: TerminalSpawnSpec & {
        terminalType?: string;
    }): Promise<{
        pid: number;
        output: NodeJS.ReadableStream;
        done: Promise<{
            exitCode: number | null;
            signal?: string | null;
        }>;
        write(data: string): void | Promise<void>;
        resize?(cols: number, rows: number): void | Promise<void>;
        signalForeground?(signal: string): void | Promise<unknown>;
        terminate(): void | Promise<void>;
    }>;
}
/** What the caller must report about the deployment. */
export interface SpawnerDeps {
    platform: NodeJS.Platform;
    /** The host seam, or undefined/absent when this build has none. */
    seam: SeamLike | undefined;
    /** TERM->SIGKILL grace handed to the seam on allocation. */
    seamGraceMs?: number;
}
/**
 * Which backend this deployment gets. `undefined` means neither is reachable and
 * the browser must be told `no-pty-backend` rather than shown a dead terminal.
 */
export declare function detectBackend(deps: SpawnerDeps): PtyBackend | undefined;
/**
 * Build the allocator the registry calls.
 * @throws Error when `detectBackend` found nothing (callers must check first).
 */
export declare function createUiSpawner(deps: SpawnerDeps): {
    backend: PtyBackend;
    spawn(spec: UiSpawnSpec): Promise<UiPtyHandle>;
};
