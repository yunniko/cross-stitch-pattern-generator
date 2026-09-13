import { oklabToRgb, rgbToOklab, type Oklab } from "../color/color";
import { buildCrispAdmissibleCostMap, repairCrispAssignments, type CrispEvidenceLayer } from "./crisp-evidence-layer";
import { DEFAULT_CRISP_UNARY_COST_WEIGHTS, type AdmissibleLabelCost, type CrispUnaryCostWeights } from "./crisp-unary-cost";
import type { RGB } from "../types";

/**
 * The final palette-color recompute, made mode-aware (D70): a crisp cell
 * contributes its selected supporting mode's color instead of its raw
 * averaged color, which would re-contaminate a correctly-selected black
 * or white label with the manufactured gray.
 */

export interface CrispPaletteFinalizationResult {
  palette: RGB[];
  cellPaletteIndex: Uint8Array;
}

// Bounded (report Section 7's "bounded consistency check"): recomputing
// colors can shift a mode's nearest label, repairing changes membership,
// which changes the colors again. A small fixed bound beats an unbounded
// fixed-point search.
export const MAX_FINALIZATION_ITERATIONS = 3;

/**
 * Recomputes each palette color from its member cells (a crisp cell at
 * unit weight from its supporting mode, per `crisp-unary-cost.ts`'s
 * contract -- never `coverage` again), re-validates every crisp cell
 * against the recomputed palette and repairs it (`repairCrispAssignments`,
 * D69), up to `MAX_FINALIZATION_ITERATIONS` rounds, stopping as soon as a
 * round needs no repair. `cellOklab` is the true cells' OKLab
 * (`PipelineContext.cellOklab`).
 */
export function finalizeCrispPalette(
  cellOklab: Float64Array,
  cellPaletteIndex: Uint8Array,
  initialPalette: RGB[],
  evidenceLayer: CrispEvidenceLayer,
  weights: CrispUnaryCostWeights = DEFAULT_CRISP_UNARY_COST_WEIGHTS
): CrispPaletteFinalizationResult {
  let assignment = cellPaletteIndex;
  let palette = initialPalette;

  for (let iter = 0; iter < MAX_FINALIZATION_ITERATIONS; iter++) {
    const paletteOklab = palette.map(rgbToOklab);
    const crispCosts = buildCrispAdmissibleCostMap(evidenceLayer, paletteOklab, weights);

    const repaired = repairCrispAssignments(assignment, evidenceLayer, paletteOklab, weights);
    let repairedAny = false;
    for (let i = 0; i < repaired.length; i++) {
      if (repaired[i] !== assignment[i]) {
        repairedAny = true;
        break;
      }
    }
    assignment = repaired;
    palette = recomputePaletteColors(cellOklab, assignment, palette, evidenceLayer, crispCosts);

    if (!repairedAny) break;
  }

  return { palette, cellPaletteIndex: assignment };
}

function recomputePaletteColors(
  cellOklab: Float64Array,
  assignment: Uint8Array,
  previousPalette: RGB[],
  evidenceLayer: CrispEvidenceLayer,
  crispCosts: Map<number, Map<number, AdmissibleLabelCost>>
): RGB[] {
  const sums: Array<[number, number, number]> = previousPalette.map(() => [0, 0, 0]);
  const counts = new Array(previousPalette.length).fill(0);

  for (let i = 0; i < assignment.length; i++) {
    const label = assignment[i];
    const evidence = evidenceLayer.evidenceByCell.get(i);
    const supportingMode = evidence ? crispCosts.get(i)?.get(label)?.supportingMode : undefined;
    const o = i * 3;
    const oklab: Oklab = evidence && supportingMode !== undefined ? evidence.modes[supportingMode] : [cellOklab[o], cellOklab[o + 1], cellOklab[o + 2]];
    sums[label][0] += oklab[0];
    sums[label][1] += oklab[1];
    sums[label][2] += oklab[2];
    counts[label]++;
  }

  return sums.map((sum, label) =>
    counts[label] > 0 ? oklabToRgb([sum[0] / counts[label], sum[1] / counts[label], sum[2] / counts[label]]) : previousPalette[label]
  );
}
