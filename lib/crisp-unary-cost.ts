import { oklabDistanceSquared, type Oklab } from "./color";
import type { BoundaryEvidence } from "./crisp-edge-evidence";

/**
 * G-024 M3 (HANDOVER.md D60): the mode-aware unary cost + admissible-label-
 * set construction, implementing the design report's Section 6 ("Change the
 * color objective as well as the stored data"). The report proves
 * algebraically that scoring a candidate palette color against a weighted
 * average of two modes -- or the sum of both squared distances -- still
 * ends up minimized by a blend; a confident boundary cell must instead pick
 * a real side. This module is the SHARED interface every consumer (ICM,
 * simulated annealing, contour-cleanup) is meant to call once M4 wires
 * Crisp mode in (report Section 7: "Centralize the unary-cost/candidate
 * logic behind a small shared interface. Do not implement independent
 * formulas in each cleanup function" -- this project already has a scar
 * from not doing that once for the pairwise energy term, HANDOVER.md D11).
 *
 * **Not wired into `local-optimizer.ts`/`contour-cleanup.ts` yet** -- that's
 * M4's job. This module is built and unit-tested standalone, per M3's own
 * scope (weighted training + the mode-aware cost primitive, not full
 * pipeline integration).
 *
 * **Weight composition (settled now per the Codex critique, G-024 M3
 * planning, so M4's consumers don't each reinvent this and drift, D11-
 * style):** `alpha` plays the exact role `local-optimizer.ts`'s
 * `weights.color` plays for the standard single-color cost -- M4 must NOT
 * ALSO multiply a crisp cell's unary by `weights.color` on top of `alpha`.
 * `DEFAULT_CRISP_UNARY_COST_WEIGHTS.alpha` is 1 to match
 * `DEFAULT_LOCAL_OPTIMIZER_WEIGHTS.color`'s own default.
 *
 * **Palette finalization (a constraint for M4, noted here since this module
 * is where the cost formula lives):** once a label is selected, the report's
 * Section 7 final-palette-color step must use weight `alpha` (i.e. full/unit
 * weight) for the selected mode's contribution -- NOT `coverage` again.
 * `beta*(1-coverage)` is an assignment-time PREFERENCE term (favor the side
 * occupying more of the cell, all else equal); re-applying coverage at
 * finalization would double-weight it.
 */

export interface CrispUnaryCostWeights {
  /** Weight on OKLab squared distance between the candidate palette color and the supporting mode's color -- plays the same role `local-optimizer.ts`'s `weights.color` plays for the standard cost. See module doc for why M4 must not apply both. */
  alpha: number;
  /** Weight on `(1 - coverage)` -- prefers the side occupying more of the cell's own footprint, all else equal. Provisional pending M4's own real-pass calibration (see HANDOVER.md D60's side-switch experiment). */
  beta: number;
}

/**
 * Provisional defaults (HANDOVER.md D60's small-patch side-switch
 * experiment) -- NOT a final calibration. The Codex critique was explicit
 * that a perfect-palette-fit synthetic patch can only calibrate `beta`
 * relative to the pairwise geometric energy, not `alpha` (which needs a
 * real, imperfect palette to matter at all) -- M4's actual passes and
 * finalization are needed before these are locked in for production.
 */
export const DEFAULT_CRISP_UNARY_COST_WEIGHTS: CrispUnaryCostWeights = {
  alpha: 1,
  beta: 0.15,
};

export interface AdmissibleLabelCost {
  cost: number;
  /** Index into `evidence.modes` -- which source-side mode this label's minimum cost came from. Needed because two modes can map to the SAME label (report: "two modes mapping to one label produce one admissible label with the minimum matching-mode cost, not an invented combined coverage bonus") -- a label alone doesn't say which real color supported it, which Section 7's final-palette-color step needs to know. */
  supportingMode: number;
}

/**
 * Maps each of a cell's evidence modes to its nearest palette label by
 * OKLab distance. Zero-coverage modes are excluded entirely -- a mode with
 * no real support inside the cell's own footprint must never make a label
 * admissible (critique's explicit rule). Meant to be called once per
 * (evidence, FIXED palette) pair -- e.g. once per optimization pass, not
 * freshly inside an inner candidate-label loop -- and re-derived whenever
 * the palette itself changes (compaction, merging, DMC conversion): per the
 * critique, "training assignments can initialize these mappings, but should
 * not silently remain authoritative after the palette changes."
 *
 * Nearest-OKLab mapping is a reasonable baseline (identical mode colors
 * always get identical labels, so it's already globally consistent as a
 * pure function) but has a known, documented failure mode: two different
 * cells' independently-estimated "black-side" modes can straddle the
 * Voronoi boundary between two distinct near-black palette entries,
 * fragmenting what should be one coherent region across two inadmissible-
 * to-each-other labels. Per the critique, the fix is NOT an unconditional
 * global regrouping of all "black-like" modes (risks collapsing genuine
 * shading, the kind of broad intervention D18 repeatedly found harmful) --
 * start simple, and only add a targeted local-agreement rule once a real
 * fixture demonstrates the fragmentation (M4/M6's job, not M3's).
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

/**
 * The report's Section 6 illustrative formula for one (candidate label,
 * supporting mode) pair: `alpha*||palette[k]-modeColor||^2 + beta*(1-coverage)`.
 */
export function crispUnaryCost(paletteColor: Oklab, modeColor: Oklab, coverage: number, weights: CrispUnaryCostWeights = DEFAULT_CRISP_UNARY_COST_WEIGHTS): number {
  return weights.alpha * oklabDistanceSquared(paletteColor, modeColor) + weights.beta * (1 - coverage);
}

/**
 * Builds the full admissible-label cost map for one confident boundary
 * cell: for every palette label some mode maps to, the MINIMUM cost over
 * all modes supporting that label (report: "min over modes m mapped to
 * label k"), plus which mode achieved it. A label with no supporting mode
 * simply has no entry -- callers must treat a missing entry as inadmissible
 * (cost effectively infinite), never fall back to an arbitrary global
 * palette color (report's explicit restriction: "do not admit arbitrary
 * global palette colors at a confident boundary").
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
 * The single shared entry point M4's consumers (ICM, simulated annealing,
 * contour-cleanup) call: for a cell with no evidence, or evidence below
 * `confidenceThreshold`, returns today's EXACT existing single-color
 * squared-distance cost for every label (unconditionally admissible,
 * byte-identical fallback behavior). For a confident cell, returns the
 * mode-aware admissible-label cost, `Infinity` for any label with no
 * supporting mode.
 *
 * Deliberately does not itself guard against every candidate label being
 * inadmissible for a confident cell (a cell whose two modes both map to
 * palette labels neither of which happens to be under evaluation, e.g.
 * during a specific candidate sweep) -- per the report's Section 7, M4's
 * INITIAL ASSIGNMENT step is responsible for placing every confident cell
 * on an admissible label to begin with ("Initialize every confident
 * boundary cell to a supported palette label. Do not start from stale
 * averaged-cell labels."), so an already-admissible current assignment
 * always exists as a fallback candidate during search.
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

/**
 * `argmin` over an admissible-label-cost map -- returns -1 for an empty
 * map (shouldn't happen given coverage sums to ~1 across a confident
 * cell's modes, but never silently picks an arbitrary label if it does).
 * The shared selection rule for "which admissible label should this cell
 * use," reused by both M4.3's initial assignment and M4.6's post-merge/
 * post-DMC-snap repair (HANDOVER.md D66/D69) -- one rule, not
 * reimplemented at each call site.
 */
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
