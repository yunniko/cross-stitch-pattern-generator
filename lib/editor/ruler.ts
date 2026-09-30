/**
 * The marks of a ruler along one edge of the viewer (G-078): a stitch line every `cellSize` pixels from `origin`, of
 * which every 10th is numbered, as the exports number theirs (10, 20, 30 ... counted from the chart's own edge).
 *
 * `origin` is where stitch line 0 lies along the ruler, `count` how many stitches the chart has along that axis, and
 * `length` how long the ruler is; only the marks that fall on it are returned. Pure, so the geometry is tested without a
 * page, and the drawing (`app/components/rulers.tsx`) only turns marks into pixels.
 */
export type MarkSize = "edge" | "label" | "ten" | "five" | "unit";

export interface RulerMark {
  /** The stitch line: 0 is the chart's own edge, `count` its far edge. */
  index: number;
  /** Where the line lies along the ruler, in pixels. */
  position: number;
  size: MarkSize;
  /** The number printed at a `label` mark, or at an edge that is a multiple of 10. */
  label?: string;
}

/** A label is about this wide, so numbered marks stay at least this far apart. */
export const MIN_LABEL_SPACING_PX = 34;
/** Unnumbered marks at every 10th stitch are drawn only while they stay this far apart. */
export const MIN_TEN_SPACING_PX = 6;
/** Fives and single stitches are drawn only when a cell is at least this wide. */
export const MIN_FIVE_CELL_PX = 4;
export const MIN_UNIT_CELL_PX = 8;

const LABEL_STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

/** The step between numbered marks: 10 while there is room, then wider so the numbers never touch. */
export function labelStep(cellSize: number): number {
  return LABEL_STEPS.find((step) => step * cellSize >= MIN_LABEL_SPACING_PX) ?? LABEL_STEPS[LABEL_STEPS.length - 1];
}

export function rulerMarks(origin: number, cellSize: number, count: number, length: number): RulerMark[] {
  if (!(cellSize > 0) || count <= 0 || length <= 0) return [];
  const step = labelStep(cellSize);
  const tens = 10 * cellSize >= MIN_TEN_SPACING_PX;
  const fives = cellSize >= MIN_FIVE_CELL_PX;
  const units = cellSize >= MIN_UNIT_CELL_PX;
  const first = Math.max(0, Math.floor(-origin / cellSize) - 1);
  const last = Math.min(count, Math.ceil((length - origin) / cellSize) + 1);
  const marks: RulerMark[] = [];
  for (let index = first; index <= last; index++) {
    const position = origin + index * cellSize;
    if (position < -1 || position > length + 1) continue;
    if (index === 0 || index === count) {
      marks.push({ index, position, size: "edge", ...(index > 0 && index % 10 === 0 ? { label: String(index) } : {}) });
    } else if (index % step === 0) {
      marks.push({ index, position, size: "label", label: String(index) });
    } else if (index % 10 === 0) {
      if (tens) marks.push({ index, position, size: "ten" });
    } else if (index % 5 === 0) {
      if (fives) marks.push({ index, position, size: "five" });
    } else if (units) {
      marks.push({ index, position, size: "unit" });
    }
  }
  return marks;
}

/**
 * Where the pointer is along a ruler, as the stitch it is over: `index` is the 0-based stitch (null outside the chart),
 * and `start`/`end` are that stitch's edges in ruler pixels. `position` is the pointer's own place, in ruler pixels.
 */
export interface RulerPointer {
  position: number;
  index: number | null;
  start: number | null;
  end: number | null;
}

export function rulerPointer(origin: number, cellSize: number, count: number, position: number): RulerPointer {
  if (!(cellSize > 0) || count <= 0) return { position, index: null, start: null, end: null };
  const index = Math.floor((position - origin) / cellSize);
  if (index < 0 || index >= count) return { position, index: null, start: null, end: null };
  return { position, index, start: origin + index * cellSize, end: origin + (index + 1) * cellSize };
}
