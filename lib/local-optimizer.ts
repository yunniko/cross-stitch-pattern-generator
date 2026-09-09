import { edgeBetweenCells } from "./edge-map";
import { oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { cellRgb, type CellColorBuffer, type RGB } from "./types";

export interface LocalOptimizerWeights {
  /** Weight on OKLab squared distance to the source cell color. */
  color: number;
  /** Weight per mismatched 4-neighbor, discounted by that boundary's edge strength — the spatial-regularization term. */
  smoothness: number;
  /** Weight for erasing a real source edge (choosing to *match* a neighbor across a strong edge). Zero reproduces Phase A (no edge awareness). */
  edgeLoss: number;
}

export const DEFAULT_LOCAL_OPTIMIZER_WEIGHTS: LocalOptimizerWeights = {
  color: 1,
  smoothness: 0.045,
  edgeLoss: 0,
};

const MAX_PASSES = 8;

/**
 * Single-cell hill-climbing with a neighbor-agreement smoothness term — this
 * is Iterated Conditional Modes (ICM) for MAP estimation of a Potts-model
 * Markov random field, a real, well-established technique for exactly this
 * problem (denoising a labeled grid while preserving genuine structure), not
 * a decorative heuristic. For each cell, try every palette color and keep
 * whichever minimizes the energy below; repeat until a full pass makes no
 * changes (or MAX_PASSES is hit).
 *
 * `importance` (0-1 per cell, from `lib/edge-map.ts`) does two things,
 * matching the Owner's spec sections 7/12/24 — Phase B, HANDOVER.md D8:
 * - Scales down the smoothness pressure on high-importance cells, so a
 *   genuinely important single-cell detail isn't smoothed away just because
 *   it disagrees with its neighbors (the exact failure Phase A had, with no
 *   importance signal to protect against it).
 * - Feeds `edgeBetweenCells` (an approximation: the stronger of the two
 *   cells' own importance) so a *mismatch* across a real edge costs less
 *   than the flat per-mismatch penalty (a real boundary is desirable, not
 *   noise), while *erasing* a real edge (matching across it) costs the new
 *   `edgeLoss` term instead.
 * Passing no `importance` (or all-zero) reproduces Phase A's plain
 * mismatch-counting exactly — this is a strict generalization, not a
 * separate code path (verified by the Phase A tests still passing
 * unmodified against this file).
 */
export function runLocalOptimizer(
  cells: CellColorBuffer,
  initialAssignment: Uint8Array,
  palette: RGB[],
  importance?: Float32Array,
  weights: LocalOptimizerWeights = DEFAULT_LOCAL_OPTIMIZER_WEIGHTS
): Uint8Array {
  const { width, height } = cells;
  const cellCount = width * height;
  const cellOklab = new Array<Oklab>(cellCount);
  for (let i = 0; i < cellCount; i++) cellOklab[i] = rgbToOklab(cellRgb(cells, i));
  const paletteOklab = palette.map(rgbToOklab);
  const cellImportance = importance ?? new Float32Array(cellCount);

  const assignment = initialAssignment.slice();

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const neighbors: number[] = [];
        if (x > 0) neighbors.push(i - 1);
        if (x < width - 1) neighbors.push(i + 1);
        if (y > 0) neighbors.push(i - width);
        if (y < height - 1) neighbors.push(i + width);

        const protection = 1 - cellImportance[i];

        let best = assignment[i];
        let bestEnergy = Infinity;
        for (let c = 0; c < paletteOklab.length; c++) {
          const colorTerm = oklabDistanceSquared(cellOklab[i], paletteOklab[c]);

          let boundaryEnergy = 0;
          for (const n of neighbors) {
            const edge = edgeBetweenCells(cellImportance, i, n);
            if (c !== assignment[n]) {
              // A boundary here is desirable where a real edge justifies it,
              // noise where it doesn't -- scale the flat penalty down by
              // how edge-justified this specific boundary is.
              boundaryEnergy += weights.smoothness * (1 - edge);
            } else {
              // Matching across a strong real edge erases it.
              boundaryEnergy += weights.edgeLoss * edge;
            }
          }

          const energy = weights.color * colorTerm + protection * boundaryEnergy;
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

export interface MultiScaleWeights {
  /** First pass: favors large coherent regions over edge fidelity, establishing overall shape/silhouette. */
  coarse: LocalOptimizerWeights;
  /** Second pass: full edge-awareness, refines detail against the structure the coarse pass settled on. */
  fine: LocalOptimizerWeights;
}

export const DEFAULT_MULTI_SCALE_WEIGHTS: MultiScaleWeights = {
  coarse: { color: 1, smoothness: 0.09, edgeLoss: 0.01 },
  fine: { color: 1, smoothness: 0.045, edgeLoss: 0.05 },
};

/**
 * Coarse-to-fine optimization (Owner's spec section 21): a first pass with
 * high smoothness/low edge-fidelity weight settles large-scale region
 * structure, then a second pass with the real edge-aware weights refines it.
 * Running the fine pass second means it refines the coarse pass's settled
 * structure rather than fighting noise from scratch.
 */
export function runMultiScaleOptimizer(
  cells: CellColorBuffer,
  initialAssignment: Uint8Array,
  palette: RGB[],
  importance?: Float32Array,
  weights: MultiScaleWeights = DEFAULT_MULTI_SCALE_WEIGHTS
): Uint8Array {
  const coarse = runLocalOptimizer(cells, initialAssignment, palette, importance, weights.coarse);
  return runLocalOptimizer(cells, coarse, palette, importance, weights.fine);
}
