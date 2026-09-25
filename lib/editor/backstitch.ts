import type { BackstitchLine, CellRect } from "../types";
import { effectiveSymmetryAxes, symmetryGroup, type SymmetryAxes } from "./symmetry-axes";

/**
 * Backstitch lines: straight, corner to corner, drawn over the crosses (G-073).
 *
 * Coordinates are **grid corners**, not cells: a chart `width` stitches across has corners `0..width` inclusive, so
 * a line along the top of the first cell runs from `(0, 0)` to `(1, 0)`. That is also how OXS stores them, which is
 * why export is exact rather than an approximation.
 *
 * A line has no width here and no curve at all (Owner, 2026-09-25): the fifth-of-a-cell stroke is a drawing
 * decision, and every line is the straight segment between its two ends.
 */

/** Whichever way round a line was drawn, it is the same stitch; this is the order two of them can be compared in. */
export function normalizeLine(line: BackstitchLine): BackstitchLine {
  const swap = line.x2 < line.x1 || (line.x2 === line.x1 && line.y2 < line.y1);
  if (!swap) return line;
  return { ...line, x1: line.x2, y1: line.y2, x2: line.x1, y2: line.y1 };
}

/** The same two ends and the same thread, drawn in either direction. */
export function sameLine(a: BackstitchLine, b: BackstitchLine): boolean {
  const p = normalizeLine(a);
  const q = normalizeLine(b);
  return p.x1 === q.x1 && p.y1 === q.y1 && p.x2 === q.x2 && p.y2 === q.y2 && p.paletteIndex === q.paletteIndex;
}

/** A line's length in cells — the diagonal of a cell is √2, not 1, which is what makes the legend's metres honest. */
export function lineLengthCells(line: BackstitchLine): number {
  return Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
}

/** Total length per palette entry, in cells. Index positions match `palette`; a thread with no lines gets 0. */
export function lengthByColor(lines: readonly BackstitchLine[], paletteLength: number): number[] {
  const totals = new Array<number>(paletteLength).fill(0);
  for (const line of lines) {
    if (line.paletteIndex >= 0 && line.paletteIndex < paletteLength) totals[line.paletteIndex] += lineLengthCells(line);
  }
  return totals;
}

/** Moves every line by whole cells, for a canvas resize or a Move-tool shift. */
export function shiftLines(lines: readonly BackstitchLine[], dx: number, dy: number): BackstitchLine[] {
  if (dx === 0 && dy === 0) return [...lines];
  return lines.map((l) => ({ ...l, x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy }));
}

/**
 * Drops any line with an end outside a chart of this size.
 *
 * A backstitch runs corner to corner and has no partial form, so a line the canvas no longer contains goes entirely
 * rather than being cut short — the same choice the grid makes for the stitches a resize crops away.
 */
export function clipLines(lines: readonly BackstitchLine[], width: number, height: number): BackstitchLine[] {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x <= width && y <= height;
  return lines.filter((l) => inside(l.x1, l.y1) && inside(l.x2, l.y2));
}

/** Whether both ends sit inside a cell rectangle — the rule for whether a cell selection takes a line (G-073). */
export function lineWithinRect(line: BackstitchLine, rect: CellRect): boolean {
  const inside = (x: number, y: number) => x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;
  return inside(line.x1, line.y1) && inside(line.x2, line.y2);
}

/**
 * Renumbers lines after a palette entry is removed, the way `withColorRemoved` does for the drawing colours.
 *
 * `into` is where the removed thread's lines go: another index merges them, `null` deletes them — which is what
 * merging a backstitch colour into the empty thread has to mean, since a line cannot be "no colour".
 */
export function withColorRemovedFromLines(lines: readonly BackstitchLine[], removed: number, into: number | null): BackstitchLine[] {
  const settle = (index: number) => (index > removed ? index - 1 : index);
  const out: BackstitchLine[] = [];
  for (const line of lines) {
    if (line.paletteIndex === removed) {
      if (into === null) continue;
      out.push({ ...line, paletteIndex: settle(into) });
      continue;
    }
    out.push({ ...line, paletteIndex: settle(line.paletteIndex) });
  }
  return out;
}

/** Drops duplicates, so drawing over a line twice does not stack two identical stitches. */
export function dedupeLines(lines: readonly BackstitchLine[]): BackstitchLine[] {
  const seen = new Set<string>();
  const out: BackstitchLine[] = [];
  for (const line of lines) {
    const n = normalizeLine(line);
    const key = `${n.x1},${n.y1},${n.x2},${n.y2},${n.paletteIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

/** A line with both ends on the same corner is not a stitch. */
export function isDegenerate(line: BackstitchLine): boolean {
  return line.x1 === line.x2 && line.y1 === line.y2;
}

/**
 * A line and every mirror of it the active axes ask for (G-073).
 *
 * Corners use a different centred coordinate from cells: a cell's centre sits at `2x - (width - 1)`, but a
 * corner runs `0..width`, so its reflection is `2x - width`. Getting that wrong shifts every mirrored line
 * half a cell, which is the kind of error that looks almost right.
 */
export function symmetryLineOrbit(line: BackstitchLine, width: number, height: number, axes: SymmetryAxes): BackstitchLine[] {
  const out: BackstitchLine[] = [];
  for (const [a, b, c, d] of symmetryGroup(effectiveSymmetryAxes(axes, width, height))) {
    const at = (x: number, y: number) => {
      const u = 2 * x - width;
      const v = 2 * y - height;
      return { x: (a * u + b * v + width) / 2, y: (c * u + d * v + height) / 2 };
    };
    const from = at(line.x1, line.y1);
    const to = at(line.x2, line.y2);
    const mirrored = { ...line, x1: from.x, y1: from.y, x2: to.x, y2: to.y };
    if (isDegenerate(mirrored)) continue;
    if (!out.some((existing) => sameLine(existing, mirrored))) out.push(mirrored);
  }
  return out;
}
