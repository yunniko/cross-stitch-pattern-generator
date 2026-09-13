import { oklabDistanceSquared, type Oklab } from "../color/color";
import type { BoundaryEvidence } from "./crisp-edge-evidence";

/**
 * The mode-aware unary cost for confident boundary cells (G-024, D60) and the admissible-label construction every
 * consumer shares. Scoring a palette color against a blend of the two modes, or against the sum of both distances,
 * still favors the blend; a confident cell must pick a real side instead. `alpha` plays the role of the standard
 * cost's `weights.color`, so callers never apply both, and palette finalization gives the selected mode unit weight,
 * never `coverage` again.
 */

export interface CrispUnaryCostWeights {
  /** Weight on the OKLab squared distance between the candidate color and the supporting mode. */
  alpha: number;
  /** Weight on `1 - coverage`: prefers the side covering more of the cell. */
  beta: number;
}

/** Provisional defaults from the D60 side-switch experiment; `alpha` matches `DEFAULT_LOCAL_OPTIMIZER_WEIGHTS.color`. */
export const DEFAULT_CRISP_UNARY_COST_WEIGHTS: CrispUnaryCostWeights = {
  alpha: 1,
  beta: 0.15,
};

export interface AdmissibleLabelCost {
  cost: number;
  /** Index into `evidence.modes` of the mode giving this label its minimum cost; two modes can map to one label, and finalization needs the real color. */
  supportingMode: number;
}

/**
 * Maps each mode with positive coverage to its nearest palette label. Call it per fixed palette and again whenever the
 * palette changes (merge, brand snap). Known limitation: near-identical modes of two cells can straddle the boundary
 * between two similar palette entries; fix that locally only once a real fixture shows it (D60).
 */
export function mapModesToLabels(evidence: BoundaryEvidence, paletteOklab: Oklab[]): Array<{ modeIndex: number; label: number }> {
  const mappings: Array<{ modeIndex: number; label: number }> = [];
  for (let m = 0; m < evidence.modes.length; m++) {
    if (evidence.coverage[m] <= 0) continue;
    let best = 0;
    let bestDist = Infinity;
    for (let k = 0; k < paletteOklab.length; k++) {
      const d = oklabDistanceSquared(evidence.modes[m], paletteOklab[k]);
      if (d < bestDist) {
        bestDist = d;
        best = k;
      }
    }
    mappings.push({ modeIndex: m, label: best });
  }
  return mappings;
}

/** `alpha·‖palette − mode‖² + beta·(1 − coverage)` for one (label, supporting mode) pair. */
export function crispUnaryCost(paletteColor: Oklab, modeColor: Oklab, coverage: number, weights: CrispUnaryCostWeights = DEFAULT_CRISP_UNARY_COST_WEIGHTS): number {
  return weights.alpha * oklabDistanceSquared(paletteColor, modeColor) + weights.beta * (1 - coverage);
}

/**
 * Admissible labels for one confident cell: each label some mode maps to, at its minimum cost over those modes. A label
 * with no entry is inadmissible; never fall back to an arbitrary palette color at a confident boundary.
 */
export function buildAdmissibleLabelCosts(
  evidence: BoundaryEvidence,
  paletteOklab: Oklab[],
  weights: CrispUnaryCostWeights = DEFAULT_CRISP_UNARY_COST_WEIGHTS
): Map<number, AdmissibleLabelCost> {
  const mappings = mapModesToLabels(evidence, paletteOklab);
  const result = new Map<number, AdmissibleLabelCost>();
  for (const { modeIndex, label } of mappings) {
    const cost = crispUnaryCost(paletteOklab[label], evidence.modes[modeIndex], evidence.coverage[modeIndex], weights);
    const existing = result.get(label);
    if (!existing || cost < existing.cost) {
      result.set(label, { cost, supportingMode: modeIndex });
    }
  }
  return result;
}

export type UnaryCostEvaluator = (label: number) => number;

/**
 * Per-label cost for one cell: the standard squared distance with no evidence or evidence below `confidenceThreshold`,
 * else the admissible cost with `Infinity` for unsupported labels. Initial assignment is responsible for starting every
 * confident cell on an admissible label.
 */
export function buildUnaryCostEvaluator(
  cellOklab: Oklab,
  paletteOklab: Oklab[],
  evidence: BoundaryEvidence | undefined,
  confidenceThreshold: number,
  weights: CrispUnaryCostWeights = DEFAULT_CRISP_UNARY_COST_WEIGHTS
): UnaryCostEvaluator {
  if (!evidence || evidence.confidence < confidenceThreshold) {
    return (label: number) => oklabDistanceSquared(cellOklab, paletteOklab[label]);
  }
  const admissible = buildAdmissibleLabelCosts(evidence, paletteOklab, weights);
  return (label: number) => admissible.get(label)?.cost ?? Infinity;
}

/** The lowest-cost admissible label, or -1 for an empty map (never an arbitrary label). Shared by initial assignment and repair (D66, D69). */
export function pickBestAdmissibleLabel(admissible: Map<number, AdmissibleLabelCost>): number {
  let bestLabel = -1;
  let bestCost = Infinity;
  for (const [label, entry] of admissible) {
    if (entry.cost < bestCost) {
      bestCost = entry.cost;
      bestLabel = label;
    }
  }
  return bestLabel;
}
