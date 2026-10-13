// A minimal observable snapshot store with the `SnapshotStore` face the terminal
// view reads through `useSyncExternalStore`.
//
// The two rules that matter, both violated more often than not:
// - `getSnapshot()` returns the SAME object until something actually changed
//   (React re-renders forever otherwise);
// - a patch always builds a NEW object, never mutates the published one.

import type { SnapshotStore } from "./face";

export class Store<T> implements SnapshotStore<T> {
  private value: T;
  private readonly listeners = new Set<() => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  getSnapshot = (): T => this.value;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Publish a new value and notify. A patch always allocates, so identity is the change signal. */
  set(next: T): void {
    this.value = next;
    for (const listener of Array.from(this.listeners)) {
      try {
        listener();
      } catch {
        // One broken subscriber must not stop the others (the view re-reads on the
        // next frame anyway) and must not escape into the socket pump.
      }
    }
  }
}
