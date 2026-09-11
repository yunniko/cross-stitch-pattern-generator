import { edgeBetweenCells } from "./edge-map";
import { boundaryPairEnergy, WEIGHTED_NEIGHBOR_OFFSETS, type PairEnergyWeights } from "./energy";
import { oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { cellRgb, type CellColorBuffer, type RGB } from "./types";

export interface LocalOptimizerWeights extends PairEnergyWeights {
  /** Weight on OKLab squared distance to the source cell color. */
  color: number;
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
 * `importance` (0-1 per cell, from `lib/edge-map.ts`) feeds `edgeBetweenCells`
 * (the stronger of the two cells' own importance) so a mismatch across a
 * real edge costs less than the flat per-mismatch penalty — a real boundary
 * is desirable, not noise (spec sections 7/12/24, Phase B, HANDOVER.md D8).
 * There is deliberately no separate per-cell "protection" multiplier beyond
 * that: an earlier version multiplied the whole boundary term by
 * `1 - importance[i]`, which is asymmetric between a pair's two cells and
 * broke ICM's single-global-energy requirement (Besag 1986) — removed per
 * a 2026-09-09 domain-expert review, HANDOVER.md D11. `edge = max(imp_i,
 * imp_n)` already carries a high-importance cell's own importance into
 * every one of its boundary terms, so nothing is lost by relying on it
 * alone (confirmed: the eye-highlight detail-preservation test still
 * passes). Passing no `importance` (or all-zero) reproduces plain
 * mismatch-counting with no edge discount at all.
 *
 * Sums over `WEIGHTED_NEIGHBOR_OFFSETS`' full 8-connected neighborhood, not
 * just the 4 orthogonal ones (2026-09-11 cluster-boundary review, Finding 1;
 * HANDOVER.md D43/G-022 M2) -- each pair's raw `boundaryPairEnergy` result is
 * multiplied by that offset's own geometric weight (already including the
 * shared normalization constant), never by scaling just one term inside the
 * energy formula, which a codex-cli critique confirmed would reproduce
 * D11's old double-discount bug under a different name (moving the zero-
 * cost crossover point and over-protecting diagonal boundaries). This keeps
 * ICM's single-global-energy property intact: the weight is a fixed,
 * symmetric per-pair constant, unrelated to importance or evaluation order,
 * so every cell's local energy still equals the corresponding change in one
 * consistent global sum.
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
        const neighbors: Array<{ n: number; weight: number }> = [];
        for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
          const nx = x + offset.dx;
          const ny = y + offset.dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          neighbors.push({ n: ny * width + nx, weight: offset.weight });
        }

        let best = assignment[i];
        let bestEnergy = Infinity;
        for (let c = 0; c < paletteOklab.length; c++) {
          const colorTerm = oklabDistanceSquared(cellOklab[i], paletteOklab[c]);

          let boundaryEnergy = 0;
          for (const { n, weight } of neighbors) {
            const edge = edgeBetweenCells(cellImportance, i, n);
            boundaryEnergy += weight * boundaryPairEnergy(weights, edge, c !== assignment[n]);
          }

          const energy = weights.color * colorTerm + boundaryEnergy;
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
