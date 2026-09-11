import { oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { cellRgb, type CellColorBuffer } from "./types";

// Matches contour-cleanup.ts's own `importanceProtectionThreshold` convention
// (its `DEFAULT_DIAGONAL_FIX_OPTIONS`/`DEFAULT_COMPONENT_RECOLOR_OPTIONS`,
// both 0.5) -- same judgment call, reused rather than re-invented: a cell the
// edge/contrast map already flags as real content is left untouched here too.
const IMPORTANCE_PROTECTION_THRESHOLD = 0.5;

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
 * **Scope: quantizer input only.** The returned buffer is passed only to
 * `ColorQuantizer.quantize`; every other pipeline stage (the local
 * optimizer's per-cell color-error term, the final palette-color recompute
 * in `buildPattern`, all edge/importance computation) continues to use the
 * true, unfiltered `cells` -- so a cleaner signal informs *which cluster a
 * cell should belong to*, without ever changing what color is actually
 * reported for it.
 */
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
