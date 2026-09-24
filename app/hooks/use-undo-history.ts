import { useCallback, useState } from "react";
import { pushHistory, replaceSinceHistory, type HistoryState, type UndoHistory } from "@/lib/editor/undo-history";

/** The React wrapper around the machine in `lib/editor/undo-history.ts` (G-067 M6). */
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

export type { HistoryState, UndoHistory };
