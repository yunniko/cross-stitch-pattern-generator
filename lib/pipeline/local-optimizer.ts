import { buildCrispAdmissibleCostMap } from "../crisp/crisp-evidence-layer";
import { DEFAULT_CRISP_UNARY_COST_WEIGHTS } from "../crisp/crisp-unary-cost";
import { edgeBetweenCells } from "./edge-map";
import { boundaryPairEnergy, WEIGHTED_NEIGHBOR_OFFSETS, type PairEnergyWeights } from "./energy";
import { CANONICAL_SLOT_COUNT, getPairEdgeEvidence } from "./pair-edge-evidence";
import { rgbToOklab } from "../color/color";
import type { PipelineContext } from "./pipeline-context";
import type { RGB } from "../types";

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
 * G-035 M5: each undirected pair's cost is computed once per call into a four-slot cache (opposite directions share
 * one evidence slot and one stencil weight, so the doubles are identical), and a cell is re-evaluated only when a
 * neighbor's label changed since its last evaluation. Its result depends only on its neighbors' labels and its own,
 * and re-evaluating it right after its own change picks the same label under both tie rules, so skipping it cannot
 * change the outcome. The row-major, in-place, at-most-8-pass schedule and the no-change stop are unchanged
 * (tests/unit/m5-equivalence.spec.ts).
 *
 * Crisp cells (present in `ctx.evidenceLayer`) search only their
 * admissible labels with the mode-aware unary cost (`alpha` = this call's
 * `weights.color`, never applied twice), and the CURRENT label is evaluated
 * first so it wins an exact tie -- a deliberate geometric initialization
 * must not be erased by ascending-label order. Standard cells keep
 * `bestEnergy = Infinity` with first-to-reach-minimum-wins. See D63, D67.
 *
 * G-046 M3: a Standard cell evaluates its neighbours' labels first. Every other label costs at least `total` (its
 * colour term is never negative), so when a neighbour label scores strictly below `total` it is the full scan's
 * winner and the palette is not scanned; otherwise it is, unchanged (D170).
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
  const cellCount = width * height;

  // Cost of each undirected pair, stored at the canonical cell's slot: E, S, SE, SW (see pair-edge-evidence.ts).
  // `pairCostOf` reproduces `offset.weight * boundaryPairEnergy(weights, edge, true)` exactly for either direction.
  const slotCost = new Float64Array(cellCount * CANONICAL_SLOT_COUNT);
  const CANONICAL: ReadonlyArray<readonly [number, number, number]> = [
    [1, 0, 0],
    [0, 1, 1],
    [1, 1, 2],
    [-1, 1, 3],
  ];
  const canonicalWeight = [0, 0, 0, 0];
  for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
    for (const [dx, dy, slot] of CANONICAL) if (offset.dx === dx && offset.dy === dy) canonicalWeight[slot] = offset.weight;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      for (const [dx, dy, slot] of CANONICAL) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        const edge = pairEvidence ? getPairEdgeEvidence(pairEvidence, i, dx, dy, width) : edgeBetweenCells(importance, i, n);
        slotCost[i * CANONICAL_SLOT_COUNT + slot] = canonicalWeight[slot] * boundaryPairEnergy(weights, edge, true);
      }
    }
  }
  // For each stencil offset: which canonical slot it uses, and whether the cost lives on this cell or the neighbor.
  const offsetSlot = new Int8Array(WEIGHTED_NEIGHBOR_OFFSETS.length);
  const offsetOnNeighbor = new Uint8Array(WEIGHTED_NEIGHBOR_OFFSETS.length);
  WEIGHTED_NEIGHBOR_OFFSETS.forEach((offset, o) => {
    for (const [dx, dy, slot] of CANONICAL) {
      if (offset.dx === dx && offset.dy === dy) offsetSlot[o] = slot;
      else if (offset.dx === -dx && offset.dy === -dy) {
        offsetSlot[o] = slot;
        offsetOnNeighbor[o] = 1;
      }
    }
    if (offset.weight !== canonicalWeight[offsetSlot[o]]) throw new Error("runLocalOptimizer: opposite stencil offsets must share a weight");
  });

  // 1 = a neighbor's label changed since this cell was last evaluated (every cell starts dirty).
  const dirty = new Uint8Array(cellCount).fill(1);
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
        if (dirty[i] === 0) continue;
        dirty[i] = 0;
        visit++;

        let count = 0;
        let total = 0;
        for (let o = 0; o < WEIGHTED_NEIGHBOR_OFFSETS.length; o++) {
          const offset = WEIGHTED_NEIGHBOR_OFFSETS[o];
          const nx = x + offset.dx;
          const ny = y + offset.dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const n = ny * width + nx;
          const cost = slotCost[(offsetOnNeighbor[o] ? n : i) * CANONICAL_SLOT_COUNT + offsetSlot[o]];
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
          // Neighbour labels first; a label not among them costs at least `total`, so a neighbour label strictly below
          // it cannot be beaten or tied by any other, and the full scan would pick the same label (D170).
          let neighborBest = -1;
          let neighborBestEnergy = Infinity;
          if (weights.color >= 0) {
            for (let j = 0; j < count; j++) {
              const c = neighborLabel[j];
              const pi = c * 3;
              const dl = cl - pal[pi];
              const da = ca - pal[pi + 1];
              const db = cb - pal[pi + 2];
              const energy = weights.color * (dl * dl + da * da + db * db) + exactBoundary[c];
              if (energy < neighborBestEnergy || (energy === neighborBestEnergy && c < neighborBest)) {
                neighborBestEnergy = energy;
                neighborBest = c;
              }
            }
          }
          if (neighborBestEnergy < total) {
            best = neighborBest;
          } else {
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
        }

        if (best !== assignment[i]) {
          assignment[i] = best;
          changed = true;
          for (let o = 0; o < WEIGHTED_NEIGHBOR_OFFSETS.length; o++) {
            const nx = x + WEIGHTED_NEIGHBOR_OFFSETS[o].dx;
            const ny = y + WEIGHTED_NEIGHBOR_OFFSETS[o].dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) dirty[ny * width + nx] = 1;
          }
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
