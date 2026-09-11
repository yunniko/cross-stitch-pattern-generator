import { oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { cellRgb, type CellColorBuffer } from "./types";

// Matches contour-cleanup.ts's own `importanceProtectionThreshold` convention
// (its `DEFAULT_DIAGONAL_FIX_OPTIONS`/`DEFAULT_COMPONENT_RECOLOR_OPTIONS`,
// both 0.5) -- same judgment call, reused rather than re-invented: a cell the
// edge/contrast map already flags as real content is left untouched here too.
const IMPORTANCE_PROTECTION_THRESHOLD = 0.5;

// Ridge-detection noise floor (HANDOVER.md D51) -- calibrated directly
// against measured data, the same methodology as edge-map.ts's own
// NOISE_FLOOR: on regression.spec.ts's amplitude-50 noisy golden fixture,
// the worst-case (max, not just typical) ridge strength measured across a
// whole flat noisy region was 0.0225; on a close-color soft-gradient
// fixture (shape-regression.spec.ts's diagonal stroke) the worst case was
// 0.0007. A genuine 1-cell-wide line's own ridge strength measured ~0.40
// -- roughly 18x the noisy-region ceiling and ~600x the gradient ceiling,
// a wide, comfortable separation, not a knife-edge fit to either number.
const RIDGE_STRENGTH_FLOOR = 0.05;

/**
 * Denoises the box-downsampled cell grid for the quantizer's eyes only
 * (2026-09-11 review, HANDOVER.md D41/G-020 M4) -- a 3x3 vector-medoid
 * filter in OKLab space: for each below-threshold-importance cell, replace
 * it with whichever cell in its own 3x3 neighborhood (itself included) has
 * the smallest total squared-OKLab distance to every other cell in that
 * neighborhood, i.e. the neighborhood's single most "typical" member.
 *
 * **Why this is needed at all**, per this project's own domain reference
 * (`docs/domain-reference.md` §5): box-averaging (`downsampleToGrid`)
 * removes *source-pixel* noise within one cell, but not *residual*
 * cell-to-cell noise across neighboring cells -- each cell's average comes
 * from a different, non-overlapping sample of source pixels, so a
 * genuinely flat region (sky, skin, a wall) can still show small random
 * OKLab variation from one cell to its neighbor, especially at a high
 * stitch count where each cell only averages a few source pixels. That
 * residual variance is exactly what k-means has no way to distinguish from
 * real content: it either gets its own wasted cluster (competing with a
 * genuine rare color for palette budget -- the same class of problem
 * HANDOVER.md D18/D19/D20's reinvestment fix addresses, but earlier in the
 * pipeline) or inflates confetti for the ICM/contour-cleanup passes to
 * clean up after the fact. This is a *different* mechanism from "stitch-
 * level confetti" (a cell's average landing in a different cluster than
 * its neighbors purely from where cluster boundaries fall) -- domain-
 * reference.md is explicit that box-averaging alone doesn't fix that
 * *other* problem, and this function doesn't claim to either; that
 * remains the local optimizer's job, unchanged.
 *
 * **Why a medoid, not a mean/bilateral blend.** A blend (e.g. a bilateral
 * filter) would nudge *every* low-importance cell's color slightly, even
 * ones that already agree with their neighborhood, and can introduce a
 * brand-new color value nothing in the source data actually had. A medoid
 * only ever picks a real, already-present cell color, and provably does
 * nothing when a cell already agrees with its neighbors (see the tie-
 * break note below) -- it only intervenes on genuine local outliers, which
 * is exactly the noise case this targets, with no new tunable blend-radius
 * parameter to get wrong the way three earlier, rejected k-means-tuning
 * attempts did (HANDOVER.md D18). At a true step edge, the medoid resolves
 * to whichever side of the edge has more/tighter-clustered members in the
 * window -- it does not blend across the edge into an intermediate color.
 *
 * **Why importance-gated.** Without this, a single genuinely different
 * cell (a true 1-cell-wide detail: an eye, a highlight, a thin stroke)
 * surrounded by 8 background-colored neighbors would itself be the
 * "outlier" this filter would normally overwrite -- silently erasing the
 * exact kind of minority detail D18/D19/D20 fought to preserve, before
 * quantization ever sees it. `importance` (already computed unconditionally
 * before this point in `pattern.ts` as of M3) is the same signal the local
 * optimizer and contour cleanup already trust for this same judgment call;
 * a cell at or above `IMPORTANCE_PROTECTION_THRESHOLD` is left exactly as
 * it is, full stop -- no filtering, no exception.
 *
 * **Second, independent protection: ridge detection (HANDOVER.md D50/D51,
 * found investigating a real production gap).** `importance` alone turned
 * out not to be enough: a Sobel gradient (a first-derivative, step-edge
 * detector) responds to a *ridge* -- a genuinely 1-cell-wide line with
 * background on both sides -- with a measured, provably exact cancellation
 * (the gradient contribution from crossing into background on one side
 * exactly cancels the opposite-side crossing), so a straight 1-cell-wide
 * line's own importance can be *exactly* 0.0, receiving no protection at
 * all despite being genuine content.
 *
 * A below-threshold-importance cell about to be replaced by the majority
 * medoid is now given one more chance via `ridgeStrength`: a discrete
 * second-difference (the same well-established family as a Laplacian/
 * ridge detector, complementary to Sobel's first-derivative step-edge
 * response by design) computed along each of the 4 principal cell-grid
 * directions (horizontal, vertical, both diagonals) as the squared OKLab
 * distance from the cell's own color to the midpoint of its two opposite
 * neighbors along that direction, taking the max across directions. A
 * true ridge scores large (its opposite neighbors are both background,
 * far from the cell's own color); a cell lying on a smooth gradient
 * scores near zero (it sits close to the interpolated midpoint of its
 * neighbors, almost by definition of "smooth"); i.i.d. per-cell noise
 * scores small and boundedly (a fixed linear combination of independent
 * samples, not a search over many candidate pairs).
 *
 * A first attempted design searched for the closest same-colored neighbor
 * within the window directly (no ridge gate) and required two such
 * neighbors to agree -- rejected after broad testing (this project's own
 * D18 discipline: a change that looks correct on the motivating case
 * needs testing against the existing suites before being trusted)
 * revealed the real flaw: searching for the *minimum* pairwise distance
 * among several candidates is an extreme-value statistic, systematically
 * biased toward small values even under pure noise (measured directly:
 * realistic photo noise's own typical minimum pairwise distance in a 3x3
 * window, ~0.00004, was comparable to or smaller than a genuine line-
 * neighbor's true distance, ~0.00007 -- no threshold could cleanly
 * separate them across *every* below-threshold-importance cell). A single
 * fixed second-difference along specific directions doesn't have that
 * search-induced bias, and measured directly gives a wide, comfortable
 * margin instead: a true ridge's strength (~0.40) is ~18x the worst
 * noisy-region value measured (~0.0225) and ~600x the worst close-color-
 * gradient value measured (~0.0007) -- not a knife-edge fit to either
 * number.
 *
 * Ridge strength alone still can't distinguish a genuine 2+-cell-long thin
 * *feature* from a genuinely *isolated* single-cell outlier -- both are
 * "different from the local average" by construction, which is exactly
 * `denoiseForQuantization`'s original target case and must still be
 * caught. `hasMatchingAlly` closes that gap: only a ridge-flagged cell
 * that *also* has an actual same-colored neighbor (continuing the
 * feature) is protected; a true isolated outlier has no such neighbor and
 * still gets replaced as before. Reusing a tight absolute distance here
 * (rejected earlier when applied to *every* low-importance cell) is safe
 * now because it only runs on the rare, pre-filtered set of cells that
 * already passed the ridge gate -- the extreme-value/multiple-comparisons
 * problem needs a large candidate pool to bite, and ridge-flagged cells
 * in a real noisy region are a ~1-in-hundreds event per the calibration
 * above, not the general case. Verified: a one-cell-wide axial line's
 * survival through quantization went from 0% to effectively complete,
 * the original isolated-outlier test case still passes, and the full
 * existing regression/shape-regression suites pass unmodified.
 *
 * **Scope: quantizer input only.** The returned buffer is passed only to
 * `ColorQuantizer.quantize`; every other pipeline stage (the local
 * optimizer's per-cell color-error term, the final palette-color recompute
 * in `buildPattern`, all edge/importance computation) continues to use the
 * true, unfiltered `cells` -- so a cleaner signal informs *which cluster a
 * cell should belong to*, without ever changing what color is actually
 * reported for it.
 */
// A cell can score high on ridgeStrength for two very different reasons: a
// genuine 2+-cell-long thin FEATURE (has a same-colored neighbor continuing
// it), or a genuinely ISOLATED single-cell outlier (denoiseForQuantization's
// original, still-valid target case -- no matching neighbor at all, just
// different from everything around it). Ridge strength alone can't tell
// these apart; ALLY_MATCH_DISTANCE_SQUARED requires an actual same-color
// neighbor before treating a ridge-flagged cell as protected content.
// Reusing a tight absolute threshold is safe here specifically because it's
// only evaluated on the rare subset of cells that already pass the ridge
// gate (for pure per-cell noise, reaching that gate at all is already a
// ~1-in-hundreds event per the calibration above) -- the extreme-value/
// multiple-comparisons problem that broke an earlier, ungated version of
// this same idea (HANDOVER.md D51 A2) doesn't apply once the candidate
// pool is this small and already pre-selected for genuine local contrast.
const ALLY_MATCH_DISTANCE_SQUARED = 0.0005;

function hasMatchingAlly(oklabColors: readonly Oklab[], window: readonly number[], i: number): boolean {
  return window.some((w) => w !== i && oklabDistanceSquared(oklabColors[i], oklabColors[w]) <= ALLY_MATCH_DISTANCE_SQUARED);
}

const RIDGE_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** Max second-difference (squared OKLab distance from the cell's own color to the midpoint of its two opposite neighbors) over the 4 principal directions -- see `denoiseForQuantization`'s docstring for the full rationale. */
function ridgeStrength(oklabColors: readonly Oklab[], width: number, height: number, x: number, y: number): number {
  const i = y * width + x;
  let maxRidge = 0;
  for (const [dx, dy] of RIDGE_DIRECTIONS) {
    const nx1 = x - dx;
    const ny1 = y - dy;
    const nx2 = x + dx;
    const ny2 = y + dy;
    if (nx1 < 0 || nx1 >= width || ny1 < 0 || ny1 >= height || nx2 < 0 || nx2 >= width || ny2 < 0 || ny2 >= height) continue;
    const neg = oklabColors[ny1 * width + nx1];
    const pos = oklabColors[ny2 * width + nx2];
    const midpoint: Oklab = [(neg[0] + pos[0]) / 2, (neg[1] + pos[1]) / 2, (neg[2] + pos[2]) / 2];
    const ridge = oklabDistanceSquared(oklabColors[i], midpoint);
    if (ridge > maxRidge) maxRidge = ridge;
  }
  return maxRidge;
}

export function denoiseForQuantization(cells: CellColorBuffer, importance?: Float32Array): CellColorBuffer {
  const { width, height } = cells;
  const cellCount = width * height;
  const cellImportance = importance ?? new Float32Array(cellCount);

  const oklabColors = new Array<Oklab>(cellCount);
  for (let i = 0; i < cellCount; i++) oklabColors[i] = rgbToOklab(cellRgb(cells, i));

  const out = new Uint8ClampedArray(cells.data.length);
  out.set(cells.data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (cellImportance[i] > IMPORTANCE_PROTECTION_THRESHOLD) continue;

      // Self listed first so an exact tie (a cell that already agrees with
      // its neighborhood) resolves to "leave it alone" via the strict `<`
      // comparison below, rather than an arbitrary neighbor.
      const window: number[] = [i];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          window.push(ny * width + nx);
        }
      }

      // A genuine 2+-cell-long thin feature: strong local second-difference
      // structure (not noise/gradient) AND an actual same-colored neighbor
      // continuing it (not an isolated single-cell outlier -- see
      // `hasMatchingAlly`'s docstring above for why both checks are needed).
      if (ridgeStrength(oklabColors, width, height, x, y) > RIDGE_STRENGTH_FLOOR && hasMatchingAlly(oklabColors, window, i)) {
        continue;
      }

      let bestIndex = i;
      let bestSum = Infinity;
      for (const a of window) {
        let sum = 0;
        for (const b of window) sum += oklabDistanceSquared(oklabColors[a], oklabColors[b]);
        if (sum < bestSum) {
          bestSum = sum;
          bestIndex = a;
        }
      }

      if (bestIndex !== i) {
        const [r, g, b] = cellRgb(cells, bestIndex);
        out[i * 3] = r;
        out[i * 3 + 1] = g;
        out[i * 3 + 2] = b;
      }
    }
  }

  return { data: out, width, height };
}
