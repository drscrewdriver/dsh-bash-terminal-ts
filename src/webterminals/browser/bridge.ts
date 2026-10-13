// The `webTerminals` service this plugin provides: view memoization, the
// `(session, contentId) -> terminalId` persistence binding, background closes and
// the recover query.
//
// Semantics copied from the controller's own client service (`ClientTerminals`)
// because the sidebar consumer depends on them without checking:
//
// - `view()` is **memoized by occurrence key**, so a re-render is free and a new
//   key is a new process - the view calls it from a `useMemo` that must be the
//   only creation path;
// - the binding is what makes a **page reload adopt the same shell**; a "new
//   terminal" mints a new content identity instead, because the old binding points
//   at a process that may already be gone;
// - `close()` is fire-and-forget with a **retryable failure list** - closing a tab
//   must never block on process cleanup;
// - unmounting a view never ends a process (that is `mount()`'s detach contract).
//
// What is deliberately NOT here: the controller's window-hold protocol. The bridge
// has one attachment per terminal and its idle grace is a host timer, so a hold
// would model nothing; the member stays present and inert so the face shape does
// not change if upstream starts calling it.

import { closeTerminal, discoverShellsForPicker, listTerminals } from "./api";
import type { TerminalCloseFailure, TerminalLaunchShells, TerminalViewContract, WebTerminalId, WebTerminalInfo, WebTerminalsFace } from "./face";
import { Store } from "./store";
import { BridgeTerminalView } from "./view";

/** localStorage namespace for the adoption bindings. */
const BINDING_PREFIX = "dsh-bash-terminal:binding:";

/** The one occurrence key of a `(session, key)` pair (NUL-joined: no id can contain it). */
function occurrenceKey(sessionId: string, key: string): string {
  return `${sessionId}\u0000${key}`;
}

/** The binding storage key of one content identity. */
function bindingKey(sessionId: string, contentId: string): string {
  return `${BINDING_PREFIX}${sessionId}:${contentId}`;
}

/** Read one localStorage value, swallowing a disabled/blocked store. */
function readStored(key: string): string | undefined {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return typeof value === "string" && value !== "" ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Write one localStorage value, swallowing a disabled/blocked store. */
function writeStored(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Private mode / a sandboxed renderer: a reload then allocates a fresh shell
    // instead of adopting, which is a degradation, never an error.
  }
}

/** Drop one localStorage value. */
function removeStored(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // See writeStored.
  }
}

/**
 * The bridge's `webTerminals` face. One instance per client root context.
 */
export class BridgeTerminals implements WebTerminalsFace {
  /** Live occurrence models, keyed by `(session, occurrence key)`. */
  private readonly views = new Map<string, BridgeTerminalView>();

  /** Failed background closes; successful and in-progress ones show nothing. */
  readonly closeFailures: Store<readonly TerminalCloseFailure[]> = new Store([]);

  /**
   * The stable model for one sidebar occurrence (memoized by `key`).
   * @param sessionId - the owning session.
   * @param key - the occurrence key (the plugin's namespaced content identity).
   * @param contentId - the persistence key across a reload.
   * @param terminalId - an explicit host identity (a recovered listing).
   */
  view = (sessionId: string, key: string, contentId: string, terminalId?: WebTerminalId): TerminalViewContract => {
    const mapKey = occurrenceKey(sessionId, key);
    const existing = this.views.get(mapKey);
    if (existing !== undefined) return existing;
    const view = new BridgeTerminalView(sessionId, contentId, {
      save: (identity, id) => {
        writeStored(bindingKey(sessionId, identity), id);
      },
      forget: (identity) => {
        removeStored(bindingKey(sessionId, identity));
      },
    }, terminalId ?? readStored(bindingKey(sessionId, contentId)));
    this.views.set(mapKey, view);
    return view;
  };

  /**
   * Save the close intent, release the occurrence immediately and drop the
   * binding - the process cleanup outlives DOM unmount and a page reload.
   */
  close = (sessionId: string, key: string, contentId: string, terminalId?: WebTerminalId): void => {
    const mapKey = occurrenceKey(sessionId, key);
    removeStored(bindingKey(sessionId, contentId));
    const view = this.views.get(mapKey);
    if (view !== undefined) {
      this.views.delete(mapKey);
      void view.close();
      return;
    }
    // No live model (a restored tab that was never shown, or a close after a
    // reload): the explicit identity still has to die.
    if (terminalId === undefined) return;
    void closeTerminal(terminalId).catch((error: unknown) => {
      this.recordFailure(terminalId, error);
    });
  };

  /** Terminals available for opening as recovered tabs. */
  recover = async (sessionId: string): Promise<WebTerminalInfo[]> => {
    const result = await listTerminals(sessionId);
    // A terminal that already has a live view must not be offered a second tab -
    // the host's own rule: recover lists what has no view and no unfinished close.
    const held = new Set<WebTerminalId>();
    for (const view of this.views.values()) {
      const info = view.state.getSnapshot().info;
      if (info !== undefined) held.add(info.id);
    }
    return (result.terminals as WebTerminalInfo[]).filter((info) => !held.has(info.id));
  };

  /** Discover launch choices without allocating a PTY (the settings picker). */
  launchShells = async (): Promise<TerminalLaunchShells> => {
    const result = await discoverShellsForPicker();
    return { shells: result.shells, selectedShell: result.selected };
  };

  /**
   * Remember the shell choice for new terminals. The bridge persists it through
   * the host's own config channel, so the model tool and the UI agree on one
   * default instead of keeping two.
   */
  selectShell = (path: string): void => {
    writeStored("dsh-bash-terminal:chosen-shell", path);
  };

  /** Retry a saved close without reopening its tab. */
  retryClose = (id: WebTerminalId): void => {
    void closeTerminal(id).then(
      () => {
        this.clearFailure(id);
      },
      (error: unknown) => {
        this.recordFailure(id, error);
      },
    );
  };

  /** Inert: the bridge's holds are host timers, not per-window leases. */
  retainTabs = (_tabs: readonly { sessionId: string; tabId: string; contentId: string }[]): void => {};

  /** Stop all client work on unload WITHOUT closing the host processes. */
  disposeAll = async (): Promise<void> => {
    const views = Array.from(this.views.values());
    this.views.clear();
    for (const view of views) await view.dispose();
  };

  /** One entry in the retryable failure list (deduplicated by identity). */
  private recordFailure(id: WebTerminalId, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const current = this.closeFailures.getSnapshot();
    if (current.some((failure) => failure.id === id)) return;
    this.closeFailures.set([...current, { id, title: id.slice(0, 8), message }]);
  }

  /** Remove a failure once its retry succeeded. */
  private clearFailure(id: WebTerminalId): void {
    const current = this.closeFailures.getSnapshot();
    if (!current.some((failure) => failure.id === id)) return;
    this.closeFailures.set(current.filter((failure) => failure.id !== id));
  }
}
