import { oklabToRgb, rgbToOklab, type Oklab } from "./color";
import { buildCrispAdmissibleCostMap, repairCrispAssignments, type CrispEvidenceLayer } from "./crisp-evidence-layer";
import { DEFAULT_CRISP_UNARY_COST_WEIGHTS, type AdmissibleLabelCost, type CrispUnaryCostWeights } from "./crisp-unary-cost";
import { cellRgb, type CellColorBuffer, type RGB } from "./types";

/**
 * G-024 M4.7 (HANDOVER.md D70): the final palette color recompute, made
 * mode-aware. `pattern.ts`'s existing step (`meanRgbOklab` over each
 * label's final member cells) uses every member's raw `cells[i]` color --
 * for a crisp cell, that's still its ORIGINAL manufactured average (e.g.
 * a gray), and using it here would re-contaminate a correctly-selected
 * black/white label exactly as the design report's Section 7 warns:
 * "Recomputing black from cells that contain gray averages can lighten
 * the whole black palette entry even after its boundary labels are
 * correct."
 *
 * Not wired into `buildPattern` yet.
 */

export interface CrispPaletteFinalizationResult {
  palette: RGB[];
  cellPaletteIndex: Uint8Array;
}

// Bounded, not assumed to converge on its own (report's explicit "bounded
// consistency check" requirement, Section 7) -- recomputing colors can
// shift a mode's nearest label again, which repairing can then change the
// membership for, which changes the recomputed color again. A fixed small
// bound, accepting whatever valid state exists when it's reached, is the
// deliberate choice over an unbounded fixed-point search.
export const MAX_FINALIZATION_ITERATIONS = 3;

/**
 * Recomputes each final palette color from its actual member cells: a
 * crisp cell contributes its SELECTED SUPPORTING MODE's color (unit
 * weight, i.e. `alpha` -- the same per-cell weight any ordinary cell
 * gets, not `coverage` again, per `crisp-unary-cost.ts`'s own documented
 * contract) instead of its raw averaged `cells[i]` color. The supporting
 * mode is looked up from `AdmissibleLabelCost.supportingMode` for the
 * cell's CURRENT label -- the same bookkeeping M3's `buildAdmissibleLabelCosts`
 * already tracks, not new state.
 *
 * After recomputing, every protected cell's assignment is re-validated
 * against the NEWLY recomputed palette (colors can shift slightly) and
 * repaired if it's no longer admissible (`repairCrispAssignments`,
 * M4.6) -- repeated up to `MAX_FINALIZATION_ITERATIONS` rounds, stopping
 * early as soon as a round needs no repairs (at that point, recomputing
 * again from an unchanged assignment would reproduce the same colors,
 * so continuing would be pure waste, not additional correctness).
 */
export function finalizeCrispPalette(
  cells: CellColorBuffer,
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
    palette = recomputePaletteColors(cells, assignment, palette, evidenceLayer, crispCosts);

    if (!repairedAny) break;
  }

  return { palette, cellPaletteIndex: assignment };
}

function recomputePaletteColors(
  cells: CellColorBuffer,
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
    let oklab: Oklab;
    if (evidence) {
      const supportingMode = crispCosts.get(i)?.get(label)?.supportingMode;
      oklab = supportingMode !== undefined ? evidence.modes[supportingMode] : rgbToOklab(cellRgb(cells, i));
    } else {
      oklab = rgbToOklab(cellRgb(cells, i));
    }
    sums[label][0] += oklab[0];
    sums[label][1] += oklab[1];
    sums[label][2] += oklab[2];
    counts[label]++;
  }

  return sums.map((sum, label) =>
    counts[label] > 0 ? oklabToRgb([sum[0] / counts[label], sum[1] / counts[label], sum[2] / counts[label]]) : previousPalette[label]
  );
}
