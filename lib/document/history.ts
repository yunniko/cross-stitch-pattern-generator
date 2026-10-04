import { applyChange, recordChange, type Change } from "./change";
import type { ChartDocument } from "./types";

/**
 * The undo history of a document (G-094, D289): the document as it is now, and the recorded changes that lead back from it
 * and forward again. It replaces the history of full copies (`lib/editor/undo-history.ts`), with the same meaning for every
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

/**
 * Replaces the steps `since` that directly follow `anchor` with `next`, as one step: a gesture that committed intermediate
 * states (a brush double-press's two presses) lands as a single edit. When the history no longer has exactly that shape
 * (the anchor was trimmed away, another edit came between, the gesture was undone past) `next` is committed like any other
 * step, so nothing is lost (D138).
 */
export function replaceSince(
  history: DocumentHistory,
  anchor: ChartDocument | null,
  since: readonly (ChartDocument | null)[],
  next: ChartDocument | null
): DocumentHistory {
  const revision = (document: ChartDocument | null) => document?.revision ?? 0;
  const first = history.past.length - since.length;
  const matches =
    since.length > 0 &&
    first >= 0 &&
    history.past[first].revisions[0] === revision(anchor) &&
    since.every((document, offset) => history.past[first + offset].revisions[1] === revision(document)) &&
    revision(history.present) === revision(since[since.length - 1]);
  if (!matches) return commitDocument(history, next);
  return { present: next, past: [...history.past.slice(0, first), recordChange(anchor, next)], future: [] };
}

export const canUndo = (history: DocumentHistory) => history.past.length > 0;
export const canRedo = (history: DocumentHistory) => history.future.length > 0;
