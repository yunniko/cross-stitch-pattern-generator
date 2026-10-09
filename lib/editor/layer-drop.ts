/**
 * Where a layer dragged in the Layers tab lands (G-130 M2): onto another row's target rectangle, the two are merged; anywhere
 * else, the layer moves to the gap nearest the pointer. Pure, so the rule is tested without a browser; the tab measures its
 * rows and hands them here.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One row of the list as drawn, top first: the layer, its row and its merge target. */
export interface LayerRow {
  id: string;
  row: Box;
  target: Box;
}

export type LayerDrop =
  /** The dragged layer merged into `targetId`, which keeps its place, name and visibility. */
  | { type: "merge"; targetId: string }
  /** The dragged layer moved to `index` in the document's order, bottom first. */
  | { type: "move"; index: number };

const inside = (box: Box, x: number, y: number) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

/**
 * The drop for a pointer at (x, y) while `draggedId` is dragged over `rows` (the list as drawn, top layer first). Null when
 * the drop would change nothing: the layer put back where it was.
 */
export function layerDrop(rows: readonly LayerRow[], draggedId: string, x: number, y: number): LayerDrop | null {
  const from = rows.findIndex((row) => row.id === draggedId);
  if (from < 0) return null;
  for (const row of rows) if (row.id !== draggedId && inside(row.target, x, y)) return { type: "merge", targetId: row.id };
  // The gap among the other rows: how many of them lie above the pointer, by their middles.
  const others = rows.filter((row) => row.id !== draggedId);
  const gap = others.filter((row) => (row.row.top + row.row.bottom) / 2 < y).length;
  if (gap === from) return null;
  // Drawn top first, kept bottom first.
  return { type: "move", index: rows.length - 1 - gap };
}
