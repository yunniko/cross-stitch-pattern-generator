import { useCallback, useState } from "react";

interface HistoryState<T> {
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
  /** Replaces the entire history (e.g. loading a different pattern) -- the old history isn't kept. */
  reset: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoHistory<T>(initial: T): UndoHistory<T> {
  const [{ entries, index }, setHistory] = useState<HistoryState<T>>({ entries: [initial], index: 0 });

  const set = useCallback((next: T) => {
    setHistory((prev) => {
      const truncated = prev.entries.slice(0, prev.index + 1);
      let nextEntries = [...truncated, next];
      let nextIndex = prev.index + 1;
      if (nextEntries.length > MAX_HISTORY) {
        const overflow = nextEntries.length - MAX_HISTORY;
        nextEntries = nextEntries.slice(overflow);
        nextIndex -= overflow;
      }
      return { entries: nextEntries, index: nextIndex };
    });
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
    reset,
    undo,
    redo,
    canUndo: index > 0,
    canRedo: index < entries.length - 1,
  };
}
