// The browser terminal's PTY backend: which allocator to use, and one adapter
// that makes both look the same to the registry.
//
// Two backends, chosen the way the model tool already chooses them:
//
// - **node-pty** on win32. The official seam's process inspector is POSIX-only
//   (`createProcessInspector` throws on win32), which is why the tool path goes
//   direct here too. This is also the backend that makes the plugin work on a
//   deployment with no terminal controller at all - the whole point of the shim.
// - **`ctx.subprocess.spawnTerminal`** elsewhere, so the shell runs under the
//   host's own execution provider (remote/ssh deployments included).
//
// `UI_PTY_STYLE` (not the tool's `TOOL_PTY_STYLE`) is what keeps colours and
// cursor control alive; `uiEnv` (not `buildEnv`) is what keeps the user's own
// environment in the child. Both live in the shared layer on purpose - see
// findings F2/F3/F4.

import { spawnPtyHandle, UI_PTY_STYLE } from "../terminal.js";
import type { TerminalSpawnSpec } from "../dsh-types.js";
import type { UiPtyHandle, UiSpawnSpec } from "./registry.js";

/** Which allocator a terminal would be created with. */
export type PtyBackend = "node-pty" | "seam";

/** The host seam, narrowed to the one call this module makes. */
export interface SeamLike {
  spawnTerminal?(spec: TerminalSpawnSpec & { terminalType?: string }): Promise<{
    pid: number;
    output: NodeJS.ReadableStream;
    done: Promise<{ exitCode: number | null; signal?: string | null }>;
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
export function detectBackend(deps: SpawnerDeps): PtyBackend | undefined {
  if (deps.platform === "win32") return "node-pty";
  return typeof deps.seam?.spawnTerminal === "function" ? "seam" : undefined;
}

/**
 * Build the allocator the registry calls.
 * @throws Error when `detectBackend` found nothing (callers must check first).
 */
export function createUiSpawner(deps: SpawnerDeps): { backend: PtyBackend; spawn(spec: UiSpawnSpec): Promise<UiPtyHandle> } {
  const backend = detectBackend(deps);
  if (backend === undefined) throw new Error("terminal-bridge: no PTY backend on this host");
  const spawn = async (spec: UiSpawnSpec): Promise<UiPtyHandle> => {
    if (backend === "node-pty") {
      try {
        return await spawnPtyHandle({ argv: [...spec.argv], cwd: spec.cwd, env: spec.env, rows: spec.rows, cols: spec.cols }, UI_PTY_STYLE);
      } catch (error) {
        // The one failure mode a user can act on: node-pty ships as a native
        // module, and pnpm silently skips its build script unless approved.
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message} - if node-pty failed to build, run \`pnpm approve-builds\` in the profile directory`, { cause: error });
      }
    }
    const seam = deps.seam?.spawnTerminal;
    if (typeof seam !== "function") throw new Error("terminal-bridge: ctx.subprocess.spawnTerminal disappeared after detection");
    // `terminalType` is honoured on newer host lines and ignored on the build
    // that hardcodes a dumb emulator; `uiEnv`'s `TERM` is what actually reaches
    // the shell on that line, so the two together cover both.
    return await seam.call(deps.seam, {
      argv: [...spec.argv],
      cwd: spec.cwd,
      env: spec.env,
      rows: spec.rows,
      cols: spec.cols,
      terminalType: UI_PTY_STYLE.name,
      graceMs: deps.seamGraceMs ?? 5000,
    });
  };
  return { backend, spawn };
}
