import type { CrispEvidenceLayer } from "./crisp-evidence-layer";
import { buildAdmissibleLabelCosts, DEFAULT_CRISP_UNARY_COST_WEIGHTS, type AdmissibleLabelCost } from "./crisp-unary-cost";
import { edgeBetweenCells } from "./edge-map";
import { boundaryPairEnergy, WEIGHTED_NEIGHBOR_OFFSETS, type PairEnergyWeights } from "./energy";
import { getPairEdgeEvidence } from "./pair-edge-evidence";
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
 *
 * `pairEvidence` (optional, from `lib/pair-edge-evidence.ts`'s
 * `computePairEdgeEvidence`; HANDOVER.md D44/G-022 M3), when provided,
 * replaces `edgeBetweenCells(importance, ...)` as the `edge` value fed to
 * `boundaryPairEnergy` -- a directional, per-pair color-structure-tensor
 * reading instead of a direction-blind per-cell scalar reused for every
 * side of a cell. `importance` itself is untouched and still passed
 * through unconditionally: this function doesn't use it for anything
 * else, but callers/tests that omit `pairEvidence` still get today's
 * exact `edgeBetweenCells`-based behavior, so no existing direct test of
 * this function needed to change.
 *
 * `crispEvidenceLayer` (optional, G-024 M4.4, HANDOVER.md D67): a frozen
 * `CrispEvidenceLayer` (`lib/crisp-evidence-layer.ts`, M4.2). A cell
 * present in it is restricted to searching only its ADMISSIBLE labels
 * (report Section 6/7: "labels with no supporting mode are inadmissible")
 * using the mode-aware unary cost instead of the flat single-color
 * distance -- every other cell keeps today's exact unweighted-distance
 * search, byte-identical when `crispEvidenceLayer` is omitted or a
 * particular cell has no entry in it. Admissible costs are precomputed
 * ONCE per call (the palette is fixed for every pass below), bounded to
 * confident cells only -- never a closure/Map retained per stitch beyond
 * this function's own lifetime (`crisp-evidence-layer.ts`'s own
 * documented bound). `alpha` is derived from THIS call's own
 * `weights.color`, never a separately-set constant applied on top of it
 * -- resolves a real weight-composition bug caught before it shipped
 * (HANDOVER.md D63): `buildUnaryCostEvaluator`/`buildAdmissibleLabelCosts`
 * already produce an alpha-WEIGHTED crisp cost, so multiplying by
 * `weights.color` a second time (as the Standard branch does to its own
 * raw, UNweighted `oklabDistanceSquared`) would double-scale it.
 *
 * Protected cells get their own, explicit tie-breaking convention: the
 * CURRENT label is evaluated first and wins any exact tie (only replaced
 * by a STRICTLY lower-energy alternative) -- Standard cells are
 * unaffected and keep today's exact behavior (`bestEnergy = Infinity`,
 * ascending label order, first candidate to reach the minimum wins).
 * Without this, ICM's existing tie rule would silently erase a
 * deliberate geometric initialization (M4.3) the moment two admissible
 * labels happened to cost the same.
 */
export function runLocalOptimizer(
  cells: CellColorBuffer,
  initialAssignment: Uint8Array,
  palette: RGB[],
  importance?: Float32Array,
  weights: LocalOptimizerWeights = DEFAULT_LOCAL_OPTIMIZER_WEIGHTS,
  pairEvidence?: Float32Array,
  crispEvidenceLayer?: CrispEvidenceLayer
): Uint8Array {
  const { width, height } = cells;
  const cellCount = width * height;
  const cellOklab = new Array<Oklab>(cellCount);
  for (let i = 0; i < cellCount; i++) cellOklab[i] = rgbToOklab(cellRgb(cells, i));
  const paletteOklab = palette.map(rgbToOklab);
  const cellImportance = importance ?? new Float32Array(cellCount);

  const crispAdmissibleCosts = crispEvidenceLayer
    ? new Map<number, Map<number, AdmissibleLabelCost>>(
        Array.from(crispEvidenceLayer.evidenceByCell, ([cellIndex, evidence]) => [
          cellIndex,
          buildAdmissibleLabelCosts(evidence, paletteOklab, { alpha: weights.color, beta: DEFAULT_CRISP_UNARY_COST_WEIGHTS.beta }),
        ])
      )
    : undefined;

  const assignment = initialAssignment.slice();

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const neighbors: Array<{ n: number; weight: number; dx: number; dy: number }> = [];
        for (const offset of WEIGHTED_NEIGHBOR_OFFSETS) {
          const nx = x + offset.dx;
          const ny = y + offset.dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          neighbors.push({ n: ny * width + nx, weight: offset.weight, dx: offset.dx, dy: offset.dy });
        }

        const admissible = crispAdmissibleCosts?.get(i);
        let best = assignment[i];
        let bestEnergy = Infinity;

        if (admissible) {
          // Current label first, so it wins any exact tie (see doc comment above).
          const orderedCandidates: number[] = [best];
          for (const c of admissible.keys()) {
            if (c !== best) orderedCandidates.push(c);
          }
          for (const c of orderedCandidates) {
            const entry = admissible.get(c);
            if (!entry) continue; // current label happened not to be admissible -- defensive only, see crisp-quantization-stage.ts
            let boundaryEnergy = 0;
            for (const { n, weight, dx, dy } of neighbors) {
              const edge = pairEvidence ? getPairEdgeEvidence(pairEvidence, i, dx, dy, width) : edgeBetweenCells(cellImportance, i, n);
              boundaryEnergy += weight * boundaryPairEnergy(weights, edge, c !== assignment[n]);
            }
            const energy = entry.cost + boundaryEnergy;
            if (energy < bestEnergy) {
              bestEnergy = energy;
              best = c;
            }
          }
        } else {
          for (let c = 0; c < paletteOklab.length; c++) {
            const colorTerm = oklabDistanceSquared(cellOklab[i], paletteOklab[c]);

            let boundaryEnergy = 0;
            for (const { n, weight, dx, dy } of neighbors) {
              const edge = pairEvidence ? getPairEdgeEvidence(pairEvidence, i, dx, dy, width) : edgeBetweenCells(cellImportance, i, n);
              boundaryEnergy += weight * boundaryPairEnergy(weights, edge, c !== assignment[n]);
            }

            const energy = weights.color * colorTerm + boundaryEnergy;
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

/**
 * `coarse.edgeLoss` was raised from 0.01 to 0.015 per G-022 M4 (HANDOVER.md
 * D45): a broad empirical sweep (golden-fixture suite, shape-regression
 * suite, and the D18 gray-cat-eyes fixture, across colorCount 4-16) found
 * this is a consistent, non-fluke improvement -- lower or equal confetti
 * ratio at every colorCount tested on the noisy-two-region fixture, zero
 * change to 3 of 4 golden fixtures and to the D18 fixture's own detail-
 * survival result, at the cost of a negligible (0.4%) dip in one synthetic
 * shape-fidelity metric. Other candidates tried (lower coarse smoothness,
 * higher fine edgeLoss, combinations) either matched or underperformed
 * these already-tuned constants -- see the M4 progress log for the full
 * sweep results.
 */
export const DEFAULT_MULTI_SCALE_WEIGHTS: MultiScaleWeights = {
  coarse: { color: 1, smoothness: 0.09, edgeLoss: 0.015 },
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
  weights: MultiScaleWeights = DEFAULT_MULTI_SCALE_WEIGHTS,
  pairEvidence?: Float32Array,
  crispEvidenceLayer?: CrispEvidenceLayer
): Uint8Array {
  const coarse = runLocalOptimizer(cells, initialAssignment, palette, importance, weights.coarse, pairEvidence, crispEvidenceLayer);
  return runLocalOptimizer(cells, coarse, palette, importance, weights.fine, pairEvidence, crispEvidenceLayer);
}
