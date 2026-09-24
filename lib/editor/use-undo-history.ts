import { useCallback, useState } from "react";

export interface HistoryState<T> {
  entries: T[];
  index: number;
}

// Snapshot-based undo/redo (push full state after every discrete edit, undo/
// redo just move a pointer) rather than diffing: a pattern's full state is
// small enough (at most ~1MB for the largest supported grid) that this is
// simpler and more robust than tracking per-edit deltas, at an acceptable
// memory cost. Capped so a very long editing session can't grow unbounded.
const MAX_HISTORY = 50;

export interface UndoHistory<T> {
  state: T;
  /** Applies a new state as the next undoable step. */
  set: (next: T) => void;
  /**
   * Replaces the steps `since` that directly follow `anchor` with `next`, as one step: a gesture that committed
   * intermediate states (a brush double-click's two clicks) lands as a single edit. When the history no longer has
   * exactly that shape, `next` is added like `set`, so nothing is lost (D138).
   */
  replaceSince: (anchor: T, since: readonly T[], next: T) => void;
  /** Replaces the entire history (e.g. loading a different pattern) -- the old history isn't kept. */
  reset: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** `next` as the step after the current one: later (redo) entries are dropped and the oldest trimmed past the cap. */
export function pushHistory<T>(prev: HistoryState<T>, next: T): HistoryState<T> {
  const truncated = prev.entries.slice(0, prev.index + 1);
  let entries = [...truncated, next];
  let index = prev.index + 1;
  if (entries.length > MAX_HISTORY) {
    const overflow = entries.length - MAX_HISTORY;
    entries = entries.slice(overflow);
    index -= overflow;
  }
  return { entries, index };
}

/**
 * Rewinds to `anchor` and pushes `next` when the entries after `anchor`, up to the current one, are exactly `since`
 * (compared by identity) and `anchor` is at or before the current position. Otherwise pushes `next` like
 * `pushHistory`: the anchor was trimmed away, an unrelated edit came in between, or the user undid past the gesture.
 */
export function replaceSinceHistory<T>(prev: HistoryState<T>, anchor: T, since: readonly T[], next: T): HistoryState<T> {
  const anchorIndex = prev.index - since.length;
  const matches =
    anchorIndex >= 0 &&
    prev.entries[anchorIndex] === anchor &&
    since.every((entry, offset) => prev.entries[anchorIndex + 1 + offset] === entry);
  if (!matches) return pushHistory(prev, next);
  return { entries: [...prev.entries.slice(0, anchorIndex + 1), next], index: anchorIndex + 1 };
}

export function useUndoHistory<T>(initial: T): UndoHistory<T> {
  const [{ entries, index }, setHistory] = useState<HistoryState<T>>({ entries: [initial], index: 0 });

  const set = useCallback((next: T) => {
    setHistory((prev) => pushHistory(prev, next));
  }, []);

  const replaceSince = useCallback((anchor: T, since: readonly T[], next: T) => {
    setHistory((prev) => replaceSinceHistory(prev, anchor, since, next));
  }, []);

  const reset = useCallback((next: T) => {
    setHistory({ entries: [next], index: 0 });
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => ({ ...prev, index: Math.max(0, prev.index - 1) }));
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => ({ ...prev, index: Math.min(prev.entries.length - 1, prev.index + 1) }));
  }, []);

  return {
    state: entries[index],
    set,
    replaceSince,
    reset,
    undo,
    redo,
    canUndo: index > 0,
    canRedo: index < entries.length - 1,
  };
}
