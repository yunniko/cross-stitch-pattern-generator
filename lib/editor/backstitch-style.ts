import type { BackstitchLine } from "../types";
import { lineLengthCells } from "./backstitch";

/**
 * How a backstitch thread is told apart from another one on a printed chart (G-073 M5).
 *
 * At the A4 cell of 2.75 mm a line is 0.55 mm wide, which is too thin to carry a glyph — a symbol inside the
 * stroke lands under 1 pt, against a `LEGIBILITY_FLOOR_PX` of 6 (D7). A **dash pattern** costs nothing at that
 * width, because a dash is the presence or absence of ink rather than a shape, and it survives wherever the line
 * itself does. See `docs/reviews/2026-09-25-backstitch-research.md`.
 *
 * **This file is mirrored in `rust/cs-export/src/backstitch.rs`**, because the screen draws in TypeScript and
 * every export draws in Rust. `scripts/rust-backstitch-style.ts` compares the two, so a change to either alone
 * fails rather than quietly printing a different chart from the one on screen.
 */

/**
 * On/off lengths in cells, longest-lived first. Empty means solid.
 *
 * Five patterns rather than more: past this the shapes stop being distinguishable at 0.55 mm, and colour is
 * doing most of the work anyway. A sixth thread reuses the first pattern and is told apart by its colour and,
 * where it needs it, its bead.
 */
export const DASH_PATTERNS: readonly (readonly number[])[] = [
  [], // solid
  [0.6, 0.3], // dashed
  [0.15, 0.25], // dotted
  [0.6, 0.25, 0.15, 0.25], // dash-dot
  [1.2, 0.4], // long dash
];

/**
 * Which threads carry backstitch, by palette index, in ascending order.
 *
 * The dash a thread gets is its **place in this list**, not its palette index: with five patterns and an index
 * taken modulo five, two backstitch threads five apart would share a pattern while three went unused, which is
 * the one thing this feature exists to prevent. The cost is that adding backstitch to a lower-numbered thread
 * shifts the patterns of the ones above it — visible only between exports, and never within one chart.
 */
export function backstitchThreads(lines: readonly BackstitchLine[]): number[] {
  return [...new Set(lines.map((l) => l.paletteIndex))].sort((a, b) => a - b);
}

/** The dash pattern for a palette index, given the threads that carry backstitch. Solid when it carries none. */
export function dashPatternFor(paletteIndex: number, threads: readonly number[]): readonly number[] {
  const rank = threads.indexOf(paletteIndex);
  return rank < 0 ? DASH_PATTERNS[0] : DASH_PATTERNS[rank % DASH_PATTERNS.length];
}

/** One drawn piece of a dashed line, in chart corner coordinates. */
export interface DashSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * A line cut into the pieces its dash pattern draws, in cells.
 *
 * Done here rather than by asking the canvas for a dash, because the same segments have to come out of the
 * raster backend and the PDF adapter, which dash by different mechanisms and would not agree on where a dash
 * falls. A short line keeps at least one piece: a one-cell line of a dotted thread must still be visible.
 */
export function dashSegments(line: BackstitchLine, pattern: readonly number[]): DashSegment[] {
  const length = lineLengthCells(line);
  if (pattern.length === 0 || length <= 0) return [{ x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 }];
  const ux = (line.x2 - line.x1) / length;
  const uy = (line.y2 - line.y1) / length;
  const at = (d: number) => ({ x: line.x1 + ux * d, y: line.y1 + uy * d });

  const out: DashSegment[] = [];
  let travelled = 0;
  let step = 0;
  while (travelled < length) {
    const run = pattern[step % pattern.length];
    const end = Math.min(travelled + run, length);
    // Even steps are ink, odd steps are gaps.
    if (step % 2 === 0 && end > travelled) {
      const a = at(travelled);
      const b = at(end);
      out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    travelled = end;
    step += 1;
  }
  // A line shorter than its first gap would vanish entirely; it keeps a stub instead.
  if (out.length === 0) {
    const b = at(Math.min(pattern[0], length));
    out.push({ x1: line.x1, y1: line.y1, x2: b.x, y2: b.y });
  }
  return out;
}

/**
 * Where a thread's beads sit on a line, in cells from its start (G-073 M5).
 *
 * A bead is the line swelling to a lozenge carrying the thread's symbol, for where dashes alone are not enough:
 * many backstitch threads, or a long unbroken run. It is spaced so a short line gets none — a bead on a
 * two-cell line would be most of the line — and a long one gets them regularly.
 */
export const BEAD_SPACING_CELLS = 8;
/** A line shorter than this carries no bead at all; its colour and dash have to do the work. */
export const BEAD_MIN_LINE_CELLS = 5;

export function beadPositions(line: BackstitchLine): number[] {
  const length = lineLengthCells(line);
  if (length < BEAD_MIN_LINE_CELLS) return [];
  const count = Math.max(1, Math.floor(length / BEAD_SPACING_CELLS));
  // Evenly spaced inside the line, never on an end, where two lines of a run would collide.
  return Array.from({ length: count }, (_, i) => (length * (i + 1)) / (count + 1));
}
