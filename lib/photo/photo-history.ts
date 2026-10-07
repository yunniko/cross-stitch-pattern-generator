/**
 * The photo's own history (G-124, D350): every Delete and Apply is a step, Undo and Redo walk them, and the photo as it was
 * loaded is kept apart so it can always be restored. Kept apart from the chart's history (`useDocumentHistory`), because the
 * two change different things in different workspaces.
 *
 * Immutable: each function returns a new history. Steps are whole photos, so the history is bounded by bytes, not by count:
 * the oldest undo steps are dropped first, and the loaded photo is never dropped.
 */
export interface PhotoHistory<T> {
  /** The photo as it was loaded or opened. */
  readonly original: T;
  /** Older states, oldest first. */
  readonly past: readonly T[];
  readonly present: T;
  /** Undone states, the next Redo first. */
  readonly future: readonly T[];
}

/** How many bytes the steps other than the loaded photo may hold together. See D350 for the measurement. */
export const PHOTO_HISTORY_BUDGET = 256 * 1024 * 1024;

export function startPhotoHistory<T>(original: T): PhotoHistory<T> {
  return { original, past: [], present: original, future: [] };
}

/**
 * A new step on top of the present, which drops what had been undone. Older steps go, oldest first, until the steps fit
 * `budget` bytes; the present always stays, and a step that is the loaded photo itself costs nothing (it is kept anyway).
 */
export function pushPhotoStep<T>(
  history: PhotoHistory<T>,
  next: T,
  sizeOf: (state: T) => number,
  budget: number = PHOTO_HISTORY_BUDGET
): PhotoHistory<T> {
  const cost = (state: T) => (state === history.original ? 0 : sizeOf(state));
  const past = [...history.past, history.present];
  let total = cost(next) + past.reduce((sum, state) => sum + cost(state), 0);
  while (past.length > 0 && total > budget) total -= cost(past.shift()!);
  return { original: history.original, past, present: next, future: [] };
}

export function canUndoPhoto<T>(history: PhotoHistory<T>): boolean {
  return history.past.length > 0;
}

export function canRedoPhoto<T>(history: PhotoHistory<T>): boolean {
  return history.future.length > 0;
}

export function undoPhoto<T>(history: PhotoHistory<T>): PhotoHistory<T> {
  if (history.past.length === 0) return history;
  const past = history.past.slice(0, -1);
  return { original: history.original, past, present: history.past[history.past.length - 1], future: [history.present, ...history.future] };
}

export function redoPhoto<T>(history: PhotoHistory<T>): PhotoHistory<T> {
  if (history.future.length === 0) return history;
  const [present, ...future] = history.future;
  return { original: history.original, past: [...history.past, history.present], present, future };
}

/** Whether the photo is the one loaded: nothing to restore. */
export function photoIsOriginal<T>(history: PhotoHistory<T>): boolean {
  return history.present === history.original;
}

/** Back to the loaded photo, as a step of its own, so the restore can itself be undone. */
export function restoreOriginalPhoto<T>(history: PhotoHistory<T>, sizeOf: (state: T) => number, budget?: number): PhotoHistory<T> {
  if (photoIsOriginal(history)) return history;
  return pushPhotoStep(history, history.original, sizeOf, budget);
}
