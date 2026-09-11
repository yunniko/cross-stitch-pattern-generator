import { extractBoundaryEvidence, DEFAULT_BOUNDARY_EVIDENCE_OPTIONS, type BoundaryEvidence, type BoundaryEvidenceOptions } from "./crisp-edge-evidence";
import { buildAdmissibleLabelCosts, DEFAULT_CRISP_UNARY_COST_WEIGHTS, type AdmissibleLabelCost, type CrispUnaryCostWeights } from "./crisp-unary-cost";
import { oklabDistanceSquared, type Oklab } from "./color";
import { getPairEdgeEvidence } from "./pair-edge-evidence";
import { plainKMeansQuantizer, kMeansQuantizer, type ColorQuantizer } from "./quantize";
import { weightedQuantize, weightedKMeansQuantize, type WeightedColorSample, type WeightedQuantizeResult } from "./weighted-quantize";
import type { PixelBuffer } from "./types";

/**
 * G-024 M4.2 (HANDOVER.md D65): the per-image evidence layer and the
 * shared assignment/palette lifecycle contract. Not wired into
 * `buildPattern` yet -- that's M4.3 onward, once this and M4.1's fixed
 * detector exist to build on.
 *
 * **The frozen-decision contract.** `CrispEvidenceLayer.evidenceByCell` is
 * computed ONCE per image and is the SINGLE source of truth every
 * downstream stage (weighted training, ICM, contour cleanup, palette
 * merge, final recompute, DMC mapping) must consult for "is this cell
 * confidently a hard boundary" -- never re-deriving confidence
 * independently at each stage, which could disagree after storage
 * rounding or drift into per-call-site inconsistency (this project's own
 * D11 scar: three independently-drifted formulas for what should have
 * been one). A cell absent from this map uses the Standard single-color
 * cost everywhere, unconditionally.
 *
 * **Bounded by construction, not by a separate storage format.** This map
 * holds one entry per CONFIDENT cell (a small subset of the grid in
 * practice, not one per cell), each a plain `BoundaryEvidence` object (2
 * modes, 2 coverage values, etc.) -- already far short of "a closure and
 * `Map` retained per stitch" the critique warned against. What must NOT
 * be built on top of this: a precomputed `Map<cellIndex, UnaryCostEvaluator>`
 * (or similar per-cell closure) held for the whole image -- `crisp-unary-
 * cost.ts`'s `buildAdmissibleLabelCosts`/`buildUnaryCostEvaluator` must be
 * called ON DEMAND from this evidence plus the CURRENT palette (which
 * changes across stages -- merge, DMC snap), never memoized against a
 * palette that might go stale.
 */

export interface CrispEvidenceLayer {
  /** Row-major cell index -> its confident BoundaryEvidence. Cells not present here are NOT crisp -- use the Standard cost unconditionally. */
  evidenceByCell: Map<number, BoundaryEvidence>;
}

export interface CrispEvidenceLayerOptions {
  /** Minimum `BoundaryEvidence.confidence` to accept a cell as a genuine hard boundary. */
  confidenceThreshold: number;
  boundaryEvidenceOptions: BoundaryEvidenceOptions;
  /**
   * Require at least one 8-connected neighbor to ALSO independently clear
   * `confidenceThreshold` before accepting a cell (design report Section
   * 4: "check confidence and side-color agreement in a local
   * neighborhood... avoid independent, noisy per-cell classification").
   * A genuine hard boundary spans multiple cells along its own length, so
   * this costs real boundaries essentially nothing while filtering an
   * isolated one-off false positive that happened to clear the confidence
   * formula alone (verified directly in `crisp-evidence-layer.spec.ts`,
   * not assumed).
   */
  requireNeighborAgreement: boolean;
}

export const DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS: CrispEvidenceLayerOptions = {
  confidenceThreshold: 0.7,
  boundaryEvidenceOptions: DEFAULT_BOUNDARY_EVIDENCE_OPTIONS,
  requireNeighborAgreement: true,
};

const EIGHT_NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Every cell index in a `gridWidth` x `gridHeight` grid -- the "full reference" candidate set, used for calibration/recall-testing against the cheaper pre-filter below, not the real pipeline's own hot path. */
export function allCellIndices(gridWidth: number, gridHeight: number): number[] {
  const out = new Array<number>(gridWidth * gridHeight);
  for (let i = 0; i < out.length; i++) out[i] = i;
  return out;
}

/**
 * Evaluates `extractBoundaryEvidence` for every cell in `candidateCells`
 * (a pre-filtered subset from `candidateCellsFromPairEvidence`, or
 * `allCellIndices` for a full/reference evaluation), keeps only cells
 * clearing `confidenceThreshold`, then applies neighbor-agreement
 * filtering unless disabled.
 */
export function buildCrispEvidenceLayer(
  source: PixelBuffer,
  gridWidth: number,
  gridHeight: number,
  candidateCells: Iterable<number>,
  options: CrispEvidenceLayerOptions = DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS
): CrispEvidenceLayer {
  const raw = new Map<number, BoundaryEvidence>();
  for (const cellIndex of candidateCells) {
    const cx = cellIndex % gridWidth;
    const cy = (cellIndex - cx) / gridWidth;
    const evidence = extractBoundaryEvidence(source, gridWidth, gridHeight, cx, cy, options.boundaryEvidenceOptions);
    if (evidence.confidence >= options.confidenceThreshold) raw.set(cellIndex, evidence);
  }

  if (!options.requireNeighborAgreement) return { evidenceByCell: raw };

  const agreed = new Map<number, BoundaryEvidence>();
  for (const [cellIndex, evidence] of raw) {
    const cx = cellIndex % gridWidth;
    const cy = (cellIndex - cx) / gridWidth;
    let hasAgreeingNeighbor = false;
    for (const [dx, dy] of EIGHT_NEIGHBOR_OFFSETS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
      if (raw.has(ny * gridWidth + nx)) {
        hasAgreeingNeighbor = true;
        break;
      }
    }
    if (hasAgreeingNeighbor) agreed.set(cellIndex, evidence);
  }
  return { evidenceByCell: agreed };
}

/**
 * Cheap candidate pre-filter using `pair-edge-evidence.ts`'s ALREADY
 * COMPUTED tensor (needed unconditionally once Crisp mode is requested --
 * see the caller-side note below about `optimize: false` and ordering).
 * Deliberately permissive (a low `threshold`): correctness comes entirely
 * from `extractBoundaryEvidence`'s own confidence scoring afterward, never
 * from this filter -- its only job is avoiding a full 2-means fit on
 * every cell in a large grid. This filter's own RECALL against a full
 * per-cell reference evaluation is validated directly in
 * `crisp-evidence-layer.spec.ts`, not assumed safe because the underlying
 * tensor is "obviously" related.
 *
 * **Ordering note for M4.3+**: `pattern.ts` currently computes
 * `pairEvidence` AFTER quantization and only when `optimize` is true.
 * Using it as a Crisp pre-filter requires computing it BEFORE
 * quantization whenever `edgeMode === "crisp"`, and for `optimize: false`
 * runs too (Crisp detection is orthogonal to whether ICM runs afterward)
 * -- `computePairEdgeEvidence` depends only on the original image and
 * grid dimensions, so moving/duplicating that call earlier changes
 * nothing about the values themselves (same reasoning already applied to
 * `importance` in `pattern.ts`'s own D39 history).
 */
export function candidateCellsFromPairEvidence(pairEvidence: Float32Array, gridWidth: number, gridHeight: number, threshold: number): number[] {
  const candidates: number[] = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const i = y * gridWidth + x;
      let maxEvidence = 0;
      for (const [dx, dy] of EIGHT_NEIGHBOR_OFFSETS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
        const e = getPairEdgeEvidence(pairEvidence, i, dx, dy, gridWidth);
        if (e > maxEvidence) maxEvidence = e;
      }
      if (maxEvidence >= threshold) candidates.push(i);
    }
  }
  return candidates;
}

// Calibrated in crisp-evidence-layer.spec.ts's recall test: low enough
// that every cell the full per-cell reference marks confident also
// appears here, on real fixtures -- not tuned for precision (a generous
// false-positive rate from this filter costs only a wasted
// extractBoundaryEvidence call, which then correctly rejects it; a
// false NEGATIVE here would silently disable Crisp mode for a real
// boundary, which is the failure this threshold must avoid).
export const DEFAULT_PAIR_EVIDENCE_PREFILTER_THRESHOLD = 0.05;

export type WeightedQuantizerFn = (
  samples: WeightedColorSample[],
  colorCount: number,
  importance: (cellIndex: number) => number
) => WeightedQuantizeResult;

/**
 * Maps a Standard-mode `ColorQuantizer` selection to its weighted
 * counterpart, so Crisp mode preserves the Original/Latest choice instead
 * of silently always using one (a Codex-critique-flagged risk during M4
 * planning, HANDOVER.md D63: calling `weightedKMeansQuantize`
 * unconditionally would turn "Original + Crisp" into "Latest + Crisp").
 * Throws for any OTHER (custom) `ColorQuantizer` -- an explicit, loud
 * failure rather than silently ignoring the customization or guessing how
 * to "weight" an arbitrary implementation this module knows nothing about.
 */
/**
 * Builds the per-cell admissible-label-cost map for every confident cell in
 * a `CrispEvidenceLayer`, once, against a FIXED palette -- the single
 * shared helper every consumer (`local-optimizer.ts`'s M4.4 integration,
 * `contour-cleanup.ts`'s M4.5 integration, and any future one) uses
 * instead of independently rebuilding this same map inline (the D11
 * lesson, applied proactively: three call sites drifting into three
 * slightly different versions of "build the crisp cost map" is exactly
 * the kind of duplication that formula previously drifted apart from
 * itself). Bounded to confident cells only, discarded when the caller's
 * own function returns -- never retained as part of the frozen evidence
 * layer itself, since costs depend on a palette that changes across
 * stages (merge, DMC snap) while the evidence layer does not.
 */
export function buildCrispAdmissibleCostMap(
  evidenceLayer: CrispEvidenceLayer,
  paletteOklab: Oklab[],
  weights: CrispUnaryCostWeights = DEFAULT_CRISP_UNARY_COST_WEIGHTS
): Map<number, Map<number, AdmissibleLabelCost>> {
  const result = new Map<number, Map<number, AdmissibleLabelCost>>();
  for (const [cellIndex, evidence] of evidenceLayer.evidenceByCell) {
    result.set(cellIndex, buildAdmissibleLabelCosts(evidence, paletteOklab, weights));
  }
  return result;
}

/**
 * Looks up a single (cell, candidate label) cost from a precomputed
 * admissible-cost map (`buildCrispAdmissibleCostMap`), falling back to
 * the plain `oklabDistanceSquared` for a cell with no entry (not crisp).
 * The shared per-candidate cost lookup for consumers that evaluate one
 * specific candidate at a time (`contour-cleanup.ts`'s M4.5 integration)
 * -- a plain top-level function, not a closure allocated inside a hot
 * loop (this project's own D44 scar: a closure inside ICM's innermost
 * per-candidate loop once cost a measured 3x slowdown before being
 * fixed). `local-optimizer.ts`'s own M4.4 integration has a different
 * shape (enumerating only a cell's few admissible labels, rather than
 * costing one candidate at a time) and doesn't use this helper.
 */
export function crispAwareCost(
  crispCosts: Map<number, Map<number, AdmissibleLabelCost>> | undefined,
  cellOklab: Oklab[],
  paletteOklab: Oklab[],
  cellIndex: number,
  label: number
): number {
  const admissible = crispCosts?.get(cellIndex);
  if (admissible) return admissible.get(label)?.cost ?? Infinity;
  return oklabDistanceSquared(cellOklab[cellIndex], paletteOklab[label]);
}

export function selectWeightedQuantizer(quantizer: ColorQuantizer): WeightedQuantizerFn {
  if (quantizer === plainKMeansQuantizer) {
    return (samples, colorCount) => weightedQuantize(samples, colorCount);
  }
  if (quantizer === kMeansQuantizer) {
    return (samples, colorCount, importance) => weightedKMeansQuantize(samples, colorCount, importance);
  }
  throw new Error(
    "Crisp edge mode does not support a custom ColorQuantizer: only the built-in plainKMeansQuantizer (\"Original\") and kMeansQuantizer (\"Latest\") have a weighted counterpart. Omit `quantizer` (or pick one of the two built-ins), or use edgeMode: \"standard\" with your custom quantizer instead."
  );
}
