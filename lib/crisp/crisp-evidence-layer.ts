import { extractBoundaryEvidence, DEFAULT_BOUNDARY_EVIDENCE_OPTIONS, SourceOklabRows, type BoundaryEvidence, type BoundaryEvidenceOptions } from "./crisp-edge-evidence";
import {
  buildAdmissibleLabelCosts,
  pickBestAdmissibleLabel,
  DEFAULT_CRISP_UNARY_COST_WEIGHTS,
  type AdmissibleLabelCost,
  type CrispUnaryCostWeights,
} from "./crisp-unary-cost";
import type { Oklab } from "../color/color";
import { plainKMeansQuantizer, kMeansQuantizer, type ColorQuantizer } from "../pipeline/quantize";
import { weightedQuantize, weightedKMeansQuantize, type WeightedColorSample, type WeightedQuantizeResult } from "./weighted-quantize";
import type { PixelBuffer } from "../types";

/**
 * Crisp mode's per-image evidence layer (D65). `evidenceByCell` is computed once per image and is the single source of
 * truth for "is this cell a confident hard boundary" in every later stage (training, ICM, cleanup, merge, finalization,
 * brand matching), so the stages can never disagree (D11). It holds one entry per confident cell only. Costs derived
 * from it depend on the current palette, which changes between stages, so they are rebuilt on demand and never cached
 * on the layer.
 */

export interface CrispEvidenceLayer {
  /** Row-major cell index -> its confident BoundaryEvidence. Cells not present here are NOT crisp -- use the Standard cost unconditionally. */
  evidenceByCell: Map<number, BoundaryEvidence>;
}

export interface CrispEvidenceLayerOptions {
  /** Minimum `BoundaryEvidence.confidence` to accept a cell as a genuine hard boundary. */
  confidenceThreshold: number;
  boundaryEvidenceOptions: BoundaryEvidenceOptions;
  /** Require an 8-connected neighbor that also clears the threshold: a real boundary spans several cells, an isolated false positive doesn't (design report Section 4). */
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

/** Every cell index: the candidate set the pipeline evaluates, since no cheap pre-filter is lossless on real photos (D132). */
export function allCellIndices(gridWidth: number, gridHeight: number): number[] {
  const out = new Array<number>(gridWidth * gridHeight);
  for (let i = 0; i < out.length; i++) out[i] = i;
  return out;
}

/** Evaluates boundary evidence for each candidate cell, keeps those clearing `confidenceThreshold`, then applies neighbor agreement unless disabled. */
export function buildCrispEvidenceLayer(
  source: PixelBuffer,
  gridWidth: number,
  gridHeight: number,
  candidateCells: Iterable<number>,
  options: CrispEvidenceLayerOptions = DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS
): CrispEvidenceLayer {
  const raw = new Map<number, BoundaryEvidence>();
  const rows = new SourceOklabRows(source); // each source row converted to OKLab once for all overlapping cells (G-035 M4)
  for (const cellIndex of candidateCells) {
    const cx = cellIndex % gridWidth;
    const cy = (cellIndex - cx) / gridWidth;
    const evidence = extractBoundaryEvidence(source, gridWidth, gridHeight, cx, cy, options.boundaryEvidenceOptions, rows);
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

export type WeightedQuantizerFn = (
  samples: WeightedColorSample[],
  colorCount: number,
  importance: (cellIndex: number) => number
) => WeightedQuantizeResult;

/** Admissible-label costs for every confident cell against one fixed palette -- the single shared builder, discarded when the caller returns (D11). */
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
 * Re-validates every confident cell against a changed palette (after a merge or a brand snap) and moves any cell whose
 * label is no longer admissible to its best admissible one (D69). Needed because a mechanical merge remap can leave a
 * valid index that is no longer any of the cell's modes' nearest color.
 */
export function repairCrispAssignments(
  cellPaletteIndex: Uint8Array,
  evidenceLayer: CrispEvidenceLayer,
  paletteOklab: Oklab[],
  weights: CrispUnaryCostWeights = DEFAULT_CRISP_UNARY_COST_WEIGHTS
): Uint8Array {
  const result = cellPaletteIndex.slice();
  for (const [cellIndex, evidence] of evidenceLayer.evidenceByCell) {
    const admissible = buildAdmissibleLabelCosts(evidence, paletteOklab, weights);
    if (admissible.has(result[cellIndex])) continue; // still admissible under the new palette -- nothing to repair
    const bestLabel = pickBestAdmissibleLabel(admissible);
    if (bestLabel !== -1) result[cellIndex] = bestLabel;
    // An empty admissible set is defensive only: leave the label rather than assign something arbitrary.
  }
  return result;
}

/** One (cell, label) cost: the admissible cost (or `Infinity`) for a confident cell, else the plain squared OKLab distance. */
export function crispAwareCost(
  crispCosts: Map<number, Map<number, AdmissibleLabelCost>> | undefined,
  cellOklab: Float64Array,
  paletteOklab: Oklab[],
  cellIndex: number,
  label: number
): number {
  const admissible = crispCosts?.get(cellIndex);
  if (admissible) return admissible.get(label)?.cost ?? Infinity;
  const o = cellIndex * 3;
  const p = paletteOklab[label];
  const dl = cellOklab[o] - p[0];
  const da = cellOklab[o + 1] - p[1];
  const db = cellOklab[o + 2] - p[2];
  return dl * dl + da * da + db * db;
}

/** The weighted counterpart of a built-in quantizer, so Crisp mode keeps the Original/Latest choice (D63). A custom quantizer has none and throws. */
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
