import { oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { cellRgb, type CellColorBuffer, type RGB } from "./types";

export interface LocalOptimizerWeights {
  /** Weight on OKLab squared distance to the source cell color. */
  color: number;
  /** Weight per mismatched 4-neighbor — the spatial-regularization term. */
  smoothness: number;
}

export const DEFAULT_LOCAL_OPTIMIZER_WEIGHTS: LocalOptimizerWeights = {
  color: 1,
  smoothness: 0.045,
};

const MAX_PASSES = 8;

/**
 * Single-cell hill-climbing with a neighbor-agreement smoothness term — this
 * is Iterated Conditional Modes (ICM) for MAP estimation of a Potts-model
 * Markov random field, a real, well-established technique for exactly this
 * problem (denoising a labeled grid while preserving genuine structure), not
 * a decorative heuristic. For each cell, try every palette color and keep
 * whichever minimizes `color * distance + smoothness * mismatchedNeighbors`;
 * repeat until a full pass makes no changes (or MAX_PASSES is hit).
 *
 * Deliberately has no importance/edge protection yet (see HANDOVER.md D6
 * Phase A/B split) — a genuinely important single-cell detail (an eye
 * highlight) and a single-cell noise speck look identical to this pass.
 * That's why Phase B's importance map exists; don't treat this as "done."
 *
 * Evaluates the full palette per cell rather than restricting candidates to
 * neighbor colors — at up to 64 palette entries this is cheap (~64M
 * evaluations per pass at the largest 1000x1000 grid) and guarantees each
 * step finds the true per-cell optimum, not an approximation of it.
 */
export function runLocalOptimizer(
  cells: CellColorBuffer,
  initialAssignment: Uint8Array,
  palette: RGB[],
  weights: LocalOptimizerWeights = DEFAULT_LOCAL_OPTIMIZER_WEIGHTS
): Uint8Array {
  const { width, height } = cells;
  const cellCount = width * height;
  const cellOklab = new Array<Oklab>(cellCount);
  for (let i = 0; i < cellCount; i++) cellOklab[i] = rgbToOklab(cellRgb(cells, i));
  const paletteOklab = palette.map(rgbToOklab);

  const assignment = initialAssignment.slice();

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const neighborColors: number[] = [];
        if (x > 0) neighborColors.push(assignment[i - 1]);
        if (x < width - 1) neighborColors.push(assignment[i + 1]);
        if (y > 0) neighborColors.push(assignment[i - width]);
        if (y < height - 1) neighborColors.push(assignment[i + width]);

        let best = assignment[i];
        let bestEnergy = Infinity;
        for (let c = 0; c < paletteOklab.length; c++) {
          const colorTerm = oklabDistanceSquared(cellOklab[i], paletteOklab[c]);
          let mismatches = 0;
          for (const n of neighborColors) if (n !== c) mismatches++;
          const energy = weights.color * colorTerm + weights.smoothness * mismatches;
          if (energy < bestEnergy) {
            bestEnergy = energy;
            best = c;
          }
        }

        if (best !== assignment[i]) {
          assignment[i] = best;
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  return assignment;
}
