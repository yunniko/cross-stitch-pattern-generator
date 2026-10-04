import { useCallback, useState } from "react";
import { documentOf, flatten } from "@/lib/document/convert";
import {
  canRedo,
  canUndo,
  commitDocument,
  redoHistory,
  replaceSince as replaceSinceInHistory,
  startHistory,
  undoHistory,
  type DocumentHistory,
} from "@/lib/document/history";
import type { StitchPattern } from "@/lib/types";

/**
 * The editor's history (G-094, D289). What is kept is the document and the recorded changes around it
 * (`lib/document/history.ts`); what the editor reads and hands back is the flat chart, which is the view of the one layer a
 * document has today. A chart committed here is the very object `state` then returns, so the tools' comparisons by
 * identity (the brush's double-press, a colour editor's draft) hold as they did with the history of full copies.
 */
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

type Chart = StitchPattern | null;
const toDocument = (chart: Chart) => (chart ? documentOf(chart) : null);

export function useDocumentHistory(): UndoHistory<Chart> {
  const [history, setHistory] = useState<DocumentHistory>(() => startHistory(null));

  // The document is made outside the updater: an updater may run twice, and must give the same history both times.
  const set = useCallback((next: Chart) => {
    const document = toDocument(next);
    setHistory((prev) => commitDocument(prev, document));
  }, []);

  const replaceSince = useCallback((anchor: Chart, since: readonly Chart[], next: Chart) => {
    const [anchorDocument, sinceDocuments, document] = [toDocument(anchor), since.map(toDocument), toDocument(next)];
    setHistory((prev) => replaceSinceInHistory(prev, anchorDocument, sinceDocuments, document));
  }, []);

  const reset = useCallback((next: Chart) => {
    setHistory(startHistory(toDocument(next)));
  }, []);

  const undo = useCallback(() => setHistory(undoHistory), []);
  const redo = useCallback(() => setHistory(redoHistory), []);

  return {
    state: history.present ? flatten(history.present) : null,
    set,
    replaceSince,
    reset,
    undo,
    redo,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  };
}
