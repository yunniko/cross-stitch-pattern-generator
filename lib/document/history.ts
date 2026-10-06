import { applyChange, recordChange, type Change } from "./change";
import type { ChartDocument } from "./types";

/**
 * The undo history of a document (G-094, D289): the document as it is now, and the recorded changes that lead back from it
 * and forward again. It replaced the history of full copies the editor had until G-094, with the same meaning for every
 * operation and the same cap; what it keeps for each step is what the step changed.
 *
 * No framework in it. `app/hooks/use-document-history.ts` is the React wrapper.
 */

/** The steps kept, counting the present one: a very long session cannot grow without bound. Unchanged from the history of copies. */
export const MAX_HISTORY = 50;

export interface DocumentHistory {
  present: ChartDocument | null;
  /** The changes that led here, oldest first. */
  past: readonly Change[];
  /** The changes undone, the next one to redo last. */
  future: readonly Change[];
}

export function startHistory(document: ChartDocument | null): DocumentHistory {
  return { present: document, past: [], future: [] };
}

/** `next` as the step after the present one: what was undone is dropped, and the oldest step goes past the cap. */
export function commitDocument(history: DocumentHistory, next: ChartDocument | null): DocumentHistory {
  const past = [...history.past, recordChange(history.present, next)];
  return { present: next, past: past.length > MAX_HISTORY - 1 ? past.slice(past.length - (MAX_HISTORY - 1)) : past, future: [] };
}

export function undoHistory(history: DocumentHistory): DocumentHistory {
  const change = history.past[history.past.length - 1];
  if (!change) return history;
  return { present: applyChange(history.present, change, "undo"), past: history.past.slice(0, -1), future: [...history.future, change] };
}

export function redoHistory(history: DocumentHistory): DocumentHistory {
  const change = history.future[history.future.length - 1];
  if (!change) return history;
  return { present: applyChange(history.present, change, "redo"), past: [...history.past, change], future: history.future.slice(0, -1) };
}

export const canUndo = (history: DocumentHistory) => history.past.length > 0;
export const canRedo = (history: DocumentHistory) => history.future.length > 0;
