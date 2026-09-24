// Verbatim copy of lib/pipeline/local-optimizer.ts before G-035 M5 (commit 3085e6c), kept only as the reference for the M5 equivalence tests.
// Only import paths were changed to absolute aliases. Never edit it.
import { buildCrispAdmissibleCostMap } from "@/lib/crisp/crisp-evidence-layer";
import { DEFAULT_CRISP_UNARY_COST_WEIGHTS } from "@/lib/crisp/crisp-unary-cost";
import { edgeBetweenCells } from "@/lib/pipeline/edge-map";
import { boundaryPairEnergy, WEIGHTED_NEIGHBOR_OFFSETS, type PairEnergyWeights } from "@/lib/pipeline/energy";
import { getPairEdgeEvidence } from "@/lib/pipeline/pair-edge-evidence";
import { rgbToOklab } from "@/lib/color/color";
import type { PipelineContext } from "@/lib/pipeline/pipeline-context";
import type { RGB } from "@/lib/types";

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
 * Iterated Conditional Modes over a Potts-model energy: for each cell, try
 * every palette label and keep the one minimizing `color * ||cell - label||²
 * + Σ_neighbors weight · boundaryPairEnergy(edge, mismatch)`; repeat until
 * a pass changes nothing (or MAX_PASSES). The pairwise term is the single
 * shared `boundaryPairEnergy` over the rotation-neutral 8-neighbor stencil
 * (`WEIGHTED_NEIGHBOR_OFFSETS`), with `edge` from `ctx.pairEvidence` when
 * present, else `edgeBetweenCells(ctx.importance)`. See D11, D43, D44.
 *
 * Per cell and pass the eight directed pair costs are computed once and
 * summed in stencil order (`total`); a label that appears among the
 * neighbors gets its boundary term re-summed in the same order skipping
 * matching pairs, every other label gets `total`. Both are the exact
 * floating-point sums the per-label loop used to compute, so results are
 * bit-identical at O(8 + k) per cell instead of O(8k) (review E1, D107).
 *
 * Crisp cells (present in `ctx.evidenceLayer`) search only their
 * admissible labels with the mode-aware unary cost (`alpha` = this call's
 * `weights.color`, never applied twice), and the CURRENT label is evaluated
 * first so it wins an exact tie -- a deliberate geometric initialization
 * must not be erased by ascending-label order. Standard cells keep
 * `bestEnergy = Infinity` with first-to-reach-minimum-wins. See D63, D67.
 */
export function runLocalOptimizer(
  ctx: PipelineContext,
  initialAssignment: Uint8Array,
  palette: RGB[],
  weights: LocalOptimizerWeights = DEFAULT_LOCAL_OPTIMIZER_WEIGHTS
): Uint8Array {
  const { width, height, cellOklab, importance, pairEvidence, evidenceLayer } = ctx;
  const paletteOklab = palette.map(rgbToOklab);
  const k = paletteOklab.length;
  const pal = new Float64Array(k * 3);
  for (let c = 0; c < k; c++) {
    pal[c * 3] = paletteOklab[c][0];
    pal[c * 3 + 1] = paletteOklab[c][1];
    pal[c * 3 + 2] = paletteOklab[c][2];
  }

  const crispAdmissibleCosts = evidenceLayer
    ? buildCrispAdmissibleCostMap(evidenceLayer, paletteOklab, { alpha: weights.color, beta: DEFAULT_CRISP_UNARY_COST_WEIGHTS.beta })
    : undefined;

  const assignment = initialAssignment.slice();
  const pairCost = new Float64Array(8);
  const neighborLabel = new Int32Array(8);
  // Boundary sums for the labels found among a cell's neighbors; `stamp`
  // marks which entries belong to the current cell so nothing is cleared.
  const exactBoundary = new Float64Array(k);
  const stamp = new Int32Array(k).fill(-1);
  let visit = 0;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        visit++;

        let count = 0;
        let total = 0;
        for (let o = 0; o < WEIGHTED_NEIGHBOR_OFFSETS.length; o++) {
          const offset = WEIGHTED_NEIGHBOR_OFFSETS[o];
          const nx = x + offset.dx;
          const ny = y + offset.dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const n = ny * width + nx;
          const edge = pairEvidence
            ? getPairEdgeEvidence(pairEvidence, i, offset.dx, offset.dy, width)
            : edgeBetweenCells(importance, i, n);
          const cost = offset.weight * boundaryPairEnergy(weights, edge, true);
          pairCost[count] = cost;
          neighborLabel[count] = assignment[n];
          total += cost;
          count++;
        }
        for (let j = 0; j < count; j++) {
          const c = neighborLabel[j];
          if (stamp[c] === visit) continue;
          stamp[c] = visit;
          let sum = 0;
          for (let m = 0; m < count; m++) {
            if (neighborLabel[m] !== c) sum += pairCost[m];
          }
          exactBoundary[c] = sum;
        }

        const admissible = crispAdmissibleCosts?.get(i);
        let best = assignment[i];
        let bestEnergy = Infinity;

        if (admissible) {
          const orderedCandidates: number[] = [best];
          for (const c of admissible.keys()) {
            if (c !== best) orderedCandidates.push(c);
          }
          for (const c of orderedCandidates) {
            const entry = admissible.get(c);
            if (!entry) continue; // current label happened not to be admissible -- defensive only, see crisp-quantization-stage.ts
            const energy = entry.cost + (stamp[c] === visit ? exactBoundary[c] : total);
            if (energy < bestEnergy) {
              bestEnergy = energy;
              best = c;
            }
          }
        } else {
          const ci = i * 3;
          const cl = cellOklab[ci];
          const ca = cellOklab[ci + 1];
          const cb = cellOklab[ci + 2];
          for (let c = 0; c < k; c++) {
            const pi = c * 3;
            const dl = cl - pal[pi];
            const da = ca - pal[pi + 1];
            const db = cb - pal[pi + 2];
            const colorTerm = dl * dl + da * da + db * db;
            const energy = weights.color * colorTerm + (stamp[c] === visit ? exactBoundary[c] : total);
            if (energy < bestEnergy) {
              bestEnergy = energy;
              best = c;
            }
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

/** `coarse.edgeLoss` 0.015 was calibrated by a broad sweep across the golden and shape suites (G-022 M4, D45). */
export const DEFAULT_MULTI_SCALE_WEIGHTS: MultiScaleWeights = {
  coarse: { color: 1, smoothness: 0.09, edgeLoss: 0.015 },
  fine: { color: 1, smoothness: 0.045, edgeLoss: 0.05 },
};

/**
 * Two ICM passes on the same grid with different weight schedules (not
 * multiple scales, despite the name kept for its call sites): a coarse
 * pass settles large-scale region structure, then the fine pass refines
 * it with the real edge-aware weights.
 */
export function runMultiScaleOptimizer(
  ctx: PipelineContext,
  initialAssignment: Uint8Array,
  palette: RGB[],
  weights: MultiScaleWeights = DEFAULT_MULTI_SCALE_WEIGHTS
): Uint8Array {
  const coarse = runLocalOptimizer(ctx, initialAssignment, palette, weights.coarse);
  return runLocalOptimizer(ctx, coarse, palette, weights.fine);
}
