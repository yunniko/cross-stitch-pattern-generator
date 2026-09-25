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

/**
 * Whether a cell selection takes this line: both ends inside the rectangle (Owner, 2026-09-25).
 *
 * A line with one end outside stays on the chart. Half a line cannot travel with a piece — it has no partial
 * form — and leaving it where it is keeps the drawing it belongs to intact.
 *
 * `mask` narrows the rectangle to a shaped piece (G-072). A corner is not a cell, so a corner counts as inside
 * when any of the up-to-four cells meeting at it is one the mask keeps: a line drawn along the edge of a lasso
 * belongs to the shape the lasso drew.
 */
export function lineWithinRect(line: BackstitchLine, rect: CellRect, mask?: Uint8Array): boolean {
  return cornerWithin(line.x1, line.y1, rect, mask) && cornerWithin(line.x2, line.y2, rect, mask);
}

function cornerWithin(x: number, y: number, rect: CellRect, mask?: Uint8Array): boolean {
  if (x < rect.x || y < rect.y || x > rect.x + rect.width || y > rect.y + rect.height) return false;
  if (!mask) return true;
  for (const cx of [x - 1, x]) {
    for (const cy of [y - 1, y]) {
      const lx = cx - rect.x;
      const ly = cy - rect.y;
      if (lx < 0 || ly < 0 || lx >= rect.width || ly >= rect.height) continue;
      if (mask[ly * rect.width + lx]) return true;
    }
  }
  return false;
}

/**
 * Mirrors lines inside a `width` x `height` box of cells, in that box's own corner coordinates (G-073 M3).
 *
 * The cells of a floating piece are flipped by index and its lines by coordinate, so the two must agree: cell
 * `cx` becomes `width - 1 - cx`, and the corner `x` bounding it becomes `width - x`. The tests below pin that.
 */
export function flipLinesInBox(
  lines: readonly BackstitchLine[],
  width: number,
  height: number,
  axis: "horizontal" | "vertical"
): BackstitchLine[] {
  const fx = (x: number) => (axis === "horizontal" ? width - x : x);
  const fy = (y: number) => (axis === "vertical" ? height - y : y);
  return lines.map((l) => ({ ...l, x1: fx(l.x1), y1: fy(l.y1), x2: fx(l.x2), y2: fy(l.y2) }));
}

/** Turns lines a quarter turn inside a `width` x `height` box, whose own width and height swap. */
export function rotateLinesInBox(lines: readonly BackstitchLine[], width: number, height: number, clockwise: boolean): BackstitchLine[] {
  // Clockwise sends the point (x, y) to (height - y, x); anticlockwise sends it to (y, width - x).
  const at = (x: number, y: number) => (clockwise ? { x: height - y, y: x } : { x: y, y: width - x });
  return lines.map((l) => {
    const a = at(l.x1, l.y1);
    const b = at(l.x2, l.y2);
    return { ...l, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
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

/** How close to an end, in cells, counts as grabbing that end rather than the body (G-073 M3). */
export const END_ZONE_CELLS = 0.42;

/**
 * How close to an end counts as grabbing it, for a line of `length` cells (D229).
 *
 * Never more than a third of the line, so the body is always the middle third at worst. At the flat 0.42 a
 * one-cell line was 84% end zone and could not be moved at all.
 */
export function endZoneFor(length: number): number {
  return Math.min(END_ZONE_CELLS, length / 3);
}

/** How close to a line, in cells, counts as being on it. Generous enough to catch a fifth-of-a-cell stroke. */
export const LINE_HIT_CELLS = 0.3;

/** Which part of a line a point is on: one of its ends, its body, or nothing. */
export type LinePart = "start" | "end" | "body";

/** The distance from a point to a line segment, in cells. */
export function distanceToLine(line: BackstitchLine, x: number, y: number): number {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(x - line.x1, y - line.y1);
  const t = Math.max(0, Math.min(1, ((x - line.x1) * dx + (y - line.y1) * dy) / lengthSquared));
  return Math.hypot(x - (line.x1 + t * dx), y - (line.y1 + t * dy));
}

/**
 * The line under a point and which part of it, or null (G-073 M3).
 *
 * Ends win over bodies, and a later line wins over an earlier one, so the most recently drawn thing on top is
 * what a click takes — which is what it looks like it should do.
 *
 * `grabEnds` is false for the Move tool, where a press anywhere on a line takes the whole line (Owner,
 * 2026-09-25): that is the difference between the two tools, and it is why Move exists at all.
 */
/**
 * What a press at `(x, y)` takes hold of: one end of a line, a line's body, or nothing (D229).
 *
 * **An end grabs only on a line `inHand` already holds.** A press on a line nobody has picked up means "take
 * this line", wherever on it the press lands, so a line can always be moved in one gesture; once it is in
 * hand, its ends are live and it can be re-aimed. That is what lets one tool do both jobs.
 *
 * Ends win over bodies, and where two lines overlap the later one wins, as it is the one drawn on top.
 */
export function hitLine(
  lines: readonly BackstitchLine[],
  x: number,
  y: number,
  inHand: (line: BackstitchLine) => boolean = () => false
): { index: number; part: LinePart } | null {
  let body: { index: number; part: LinePart } | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (inHand(line)) {
      const zone = endZoneFor(lineLengthCells(line));
      if (Math.hypot(x - line.x1, y - line.y1) <= zone) return { index: i, part: "start" };
      if (Math.hypot(x - line.x2, y - line.y2) <= zone) return { index: i, part: "end" };
    }
    if (!body && distanceToLine(line, x, y) <= LINE_HIT_CELLS) body = { index: i, part: "body" };
  }
  return body;
}

/** One end of a line moved to a new corner. */
export function withEndAt(line: BackstitchLine, part: "start" | "end", x: number, y: number): BackstitchLine {
  return part === "start" ? { ...line, x1: x, y1: y } : { ...line, x2: x, y2: y };
}

/** The smallest box holding every line, in corner coordinates; null for an empty list. */
export function linesBounds(lines: readonly BackstitchLine[]): { x: number; y: number; width: number; height: number } | null {
  if (lines.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of lines) {
    minX = Math.min(minX, l.x1, l.x2);
    maxX = Math.max(maxX, l.x1, l.x2);
    minY = Math.min(minY, l.y1, l.y2);
    maxY = Math.max(maxY, l.y1, l.y2);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Mirrors lines within their own bounding box (G-073 M3).
 *
 * About the selection's own box, not the chart's centre, because that is what the floating-selection flips
 * already do: a mirrored piece stays where it was put.
 */
export function mirrorLines(lines: readonly BackstitchLine[], axis: "horizontal" | "vertical"): BackstitchLine[] {
  const bounds = linesBounds(lines);
  if (!bounds) return [];
  const flipX = (x: number) => (axis === "horizontal" ? 2 * bounds.x + bounds.width - x : x);
  const flipY = (y: number) => (axis === "vertical" ? 2 * bounds.y + bounds.height - y : y);
  return lines.map((l) => ({
    ...l,
    x1: flipX(l.x1),
    y1: flipY(l.y1),
    x2: flipX(l.x2),
    y2: flipY(l.y2),
  }));
}

/** Turns lines a quarter turn about their own bounding box, keeping its top-left corner. */
export function rotateLines(lines: readonly BackstitchLine[], clockwise: boolean): BackstitchLine[] {
  const bounds = linesBounds(lines);
  if (!bounds) return [];
  const at = (x: number, y: number) => {
    const lx = x - bounds.x;
    const ly = y - bounds.y;
    return clockwise ? { x: bounds.x + (bounds.height - ly), y: bounds.y + lx } : { x: bounds.x + ly, y: bounds.y + (bounds.width - lx) };
  };
  return lines.map((l) => {
    const a = at(l.x1, l.y1);
    const b = at(l.x2, l.y2);
    return { ...l, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
}

/** Every line given the colour in hand — the Recolour action. */
export function recolourLines(lines: readonly BackstitchLine[], paletteIndex: number): BackstitchLine[] {
  return lines.map((l) => ({ ...l, paletteIndex }));
}
