/**
 * Step-pacing measurement harness for G-022 M5.1 (HANDOVER.md D48). Not a
 * `.spec.ts` file itself (same reasoning as `shape-fixtures.ts`: vitest's
 * `include` only picks up `**\/*.spec.ts`, and later M5 sub-steps import
 * this same harness rather than re-deriving it).
 *
 * Implements the critique's step-discrepancy metric: for a monotone
 * boundary staircase (an ordered sequence of unit "H"/"V" edges -- the
 * literal pixel-grid boundary polygon of a digitized region, not a
 * per-cell run classification), and a window of w consecutive edges,
 *
 *   D = (actual vertical steps in the window) - w * p*
 *
 * where p* is the *true* source curve's local vertical-advance proportion
 * over the x-span that window covers ("that arc's vertical advance divided
 * by total horizontal-plus-vertical advance", per the critique). This
 * measures whether vertical steps arrive too early/late relative to the
 * source's actual local direction -- distinguishing a well-paced diagonal
 * (HVHVHVHV) from a lopsided one (HHHHVVVV) despite identical endpoints
 * and step counts, which IoU/boundary-distance (`shape-fixtures.ts`)
 * cannot see at all.
 *
 * Deliberately standalone and directly tested -- no pipeline wiring here.
 * M5.1's job is building and calibrating this metric against known-correct
 * digitizations (a good staircase need not score exactly zero -- the
 * critique is explicit about this), not yet using it as an optimization
 * term (that's M5.5).
 */

export type StepChain = ReadonlyArray<{ type: "H" | "V"; column: number }>;

/**
 * Traces the monotone pixel-grid boundary staircase of a non-decreasing
 * integer height sequence: for each column i, any vertical rise from
 * heights[i-1] to heights[i] is emitted as that many "V" steps (handles a
 * jump >1 in one column generally, not just a slope<=1 octant), followed
 * by one "H" step for the column itself. `column` on a V step is the
 * column it is *entering* (the convention used when matching a window's
 * chain-step range back to an x-span on the source curve below).
 */
export function traceStaircase(heights: readonly number[]): StepChain {
  const chain: Array<{ type: "H" | "V"; column: number }> = [];
  let prevHeight = heights.length > 0 ? heights[0] : 0;
  for (let i = 0; i < heights.length; i++) {
    const rise = i === 0 ? 0 : heights[i] - prevHeight;
    for (let v = 0; v < rise; v++) chain.push({ type: "V", column: i });
    chain.push({ type: "H", column: i });
    prevHeight = heights[i];
  }
  return chain;
}

/** Digitizes a non-decreasing continuous curve `f` by rounding at each column's center -- the same cell-center-sampling convention used elsewhere in this project (e.g. `computeCellImportance`). */
export function digitizeHeights(f: (x: number) => number, columns: number): number[] {
  const heights = new Array<number>(columns);
  for (let i = 0; i < columns; i++) heights[i] = Math.round(f(i + 0.5));
  return heights;
}

/**
 * The Christoffel/mechanical-word construction for a digital straight
 * segment from (0,0) to (dx,dy), dx >= dy >= 0 -- the well-established
 * "balanced word" digital geometry cites (Monteil; the critique's own
 * reference) as the canonical correctly-paced digitization of a straight
 * line, independent of `digitizeHeights`' rounding-based approach. Used
 * as a cross-check: `digitizeHeights` of an exact line should reduce to
 * this same chain (verified in contour-pacing.spec.ts), and this
 * construction reproduces the critique's own worked example exactly
 * (dx=dy=4 -> "HVHVHVHV").
 */
export function christoffelChain(dx: number, dy: number): ("H" | "V")[] {
  const n = dx + dy;
  const chain: ("H" | "V")[] = [];
  let prevFloor = 0;
  for (let k = 1; k <= n; k++) {
    const curFloor = Math.floor((k * dy) / n);
    chain.push(curFloor > prevFloor ? "V" : "H");
    prevFloor = curFloor;
  }
  return chain;
}

/**
 * Computes D_{i,w} for every valid window start i, given the chain and the
 * *true* continuous source height function (used to compute p* over each
 * window's actual x-span -- never the digitized `heights`, which would
 * trivially always match itself).
 */
export function stepDiscrepancies(chain: StepChain, trueHeightAt: (x: number) => number, windowSize: number): number[] {
  const discrepancies: number[] = [];
  for (let i = 0; i + windowSize <= chain.length; i++) {
    let verticalSteps = 0;
    for (let k = i; k < i + windowSize; k++) if (chain[k].type === "V") verticalSteps++;

    const leftEdge = chain[i].column;
    const rightEdge = chain[i + windowSize - 1].column + 1;
    const horizontalAdvance = rightEdge - leftEdge;
    const verticalAdvance = trueHeightAt(rightEdge) - trueHeightAt(leftEdge);
    const total = horizontalAdvance + verticalAdvance;
    const pStar = total > 0 ? verticalAdvance / total : 0;

    discrepancies.push(verticalSteps - windowSize * pStar);
  }
  return discrepancies;
}

export interface DiscrepancySummary {
  windowSize: number;
  count: number;
  rms: number;
  p95: number;
  max: number;
}

/** RMS and a high percentile of |D|/w, per the critique's reporting recommendation -- not just a mean, since a metric meant to catch localized bad pacing shouldn't be washed out by averaging over a long, mostly-fine boundary. */
export function summarizeDiscrepancies(discrepancies: readonly number[], windowSize: number): DiscrepancySummary {
  if (discrepancies.length === 0) return { windowSize, count: 0, rms: 0, p95: 0, max: 0 };
  const normalized = discrepancies.map((d) => Math.abs(d) / windowSize);
  const rms = Math.sqrt(normalized.reduce((sum, v) => sum + v * v, 0) / normalized.length);
  const sorted = [...normalized].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const max = sorted[sorted.length - 1];
  return { windowSize, count: normalized.length, rms, p95, max };
}

/** A straight line's true height function at angle `angleDegrees` from horizontal (0 < angle < 90 -- degenerate 0/90 cases are pure-H/pure-V and excluded, not meaningfully "paced"). */
export function straightLineHeight(angleDegrees: number): (x: number) => number {
  const slope = Math.tan((angleDegrees * Math.PI) / 180);
  return (x: number) => slope * x;
}

/**
 * A circular arc's true height function, canonical first-octant
 * parametrization: a circle of radius R centered at (0,R), traced from
 * x=0 (tangent horizontal) to x=R/sqrt(2) (tangent at 45 degrees) -- the
 * octant where the curve is monotone with x as the dominant axis (slope
 * in [0,1]), matching this harness's H/V convention. Other octants are
 * reflections/rotations of this one and aren't independently tested here.
 */
export function circularArcHeight(radius: number): (x: number) => number {
  return (x: number) => radius - Math.sqrt(Math.max(0, radius * radius - x * x));
}

export function circularArcOctantWidth(radius: number): number {
  return radius / Math.SQRT2;
}
