import { oklabDistanceSquared, rgbToOklab } from "../color/color";
import { buildAdmissibleLabelCosts, pickBestAdmissibleLabel, DEFAULT_CRISP_UNARY_COST_WEIGHTS, type CrispUnaryCostWeights } from "./crisp-unary-cost";
import type { CrispEvidenceLayer, WeightedQuantizerFn } from "./crisp-evidence-layer";
import { cellsToOklab, oklabAt } from "../pipeline/pipeline-context";
import { EMPTY_CELL, type CellColorBuffer, type RGB } from "../types";
import { emptySamplePool } from "./weighted-quantize";

/**
 * Crisp quantization + initialization (D66): builds the weighted sample
 * pool from the frozen `CrispEvidenceLayer` (a crisp cell contributes its
 * two mode colors at their coverages, any other cell one weight-1 sample),
 * runs the caller's weighted quantizer (Original/Latest preserved), then
 * initializes labels: a non-crisp cell takes its quantizer label; a crisp
 * cell takes the `argmin` of the mode-aware unary cost -- not "larger
 * coverage wins", which picks the costlier side once fit errors differ.
 * Admissibility is evaluated against the returned, gamut-clamped RGB
 * palette, the only palette downstream stages ever see.
 */

export interface CrispQuantizationResult {
  palette: RGB[];
  /** One palette index per grid cell (row-major) -- same shape as `ColorQuantizer.quantize`'s own `cellPaletteIndex`, unlike the weighted quantizer's own one-per-SAMPLE output. */
  cellPaletteIndex: Uint8Array;
}

export function runCrispQuantizationStage(
  cells: CellColorBuffer,
  colorCount: number,
  importance: Float32Array,
  evidenceLayer: CrispEvidenceLayer,
  quantizerFn: WeightedQuantizerFn,
  unaryWeights: CrispUnaryCostWeights = DEFAULT_CRISP_UNARY_COST_WEIGHTS,
  /** An already-computed OKLab conversion of `cells` (see `PipelineContext`); computed here when absent. */
  precomputedOklab?: Float64Array,
  /** 1 where the photo is too transparent to stitch (G-050): no sample, no label, the empty sentinel out. */
  emptyMask?: Uint8Array
): CrispQuantizationResult {
  const cellCount = cells.width * cells.height;
  const cellOklab = precomputedOklab ?? cellsToOklab(cells);
  // The sample pool as columns, written directly (G-047 M4, D176): a crisp cell's two modes, any other cell its own
  // colour at weight 1, in cell order. A non-crisp cell's one sample index is remembered, so its initial label is read
  // straight back from the quantizer's per-sample labels.
  let stitched = cellCount;
  if (emptyMask) {
    stitched = 0;
    for (let i = 0; i < cellCount; i++) if (!emptyMask[i]) stitched++;
  }
  const pool = emptySamplePool(stitched + evidenceLayer.evidenceByCell.size);
  const nonCrispSampleIndex = new Int32Array(cellCount).fill(-1);
  let n = 0;
  const put = (l: number, a: number, b: number, weight: number, cellIndex: number) => {
    pool.L[n] = l;
    pool.A[n] = a;
    pool.B[n] = b;
    pool.W[n] = weight;
    pool.cell[n] = cellIndex;
    n++;
  };
  for (let cellIndex = 0; cellIndex < cellCount; cellIndex++) {
    if (emptyMask?.[cellIndex]) continue;
    const evidence = evidenceLayer.evidenceByCell.get(cellIndex);
    if (evidence) {
      const [m0, m1] = evidence.modes;
      put(m0[0], m0[1], m0[2], evidence.coverage[0], cellIndex);
      put(m1[0], m1[1], m1[2], evidence.coverage[1], cellIndex);
    } else {
      nonCrispSampleIndex[cellIndex] = n;
      const o = cellIndex * 3;
      put(cellOklab[o], cellOklab[o + 1], cellOklab[o + 2], 1, cellIndex);
    }
  }
  if (n !== pool.n) throw new Error("runCrispQuantizationStage: a confident cell without two modes");

  const quantizeResult = quantizerFn(pool, colorCount, (cellIndex) => importance[cellIndex]);
  const paletteOklab = quantizeResult.palette.map(rgbToOklab);

  const cellPaletteIndex = new Uint8Array(cellCount);
  for (let cellIndex = 0; cellIndex < cellCount; cellIndex++) {
    if (emptyMask?.[cellIndex]) {
      cellPaletteIndex[cellIndex] = EMPTY_CELL;
      continue;
    }
    const evidence = evidenceLayer.evidenceByCell.get(cellIndex);
    if (!evidence) {
      cellPaletteIndex[cellIndex] = quantizeResult.sampleLabelIndex[nonCrispSampleIndex[cellIndex]];
      continue;
    }

    const admissible = buildAdmissibleLabelCosts(evidence, paletteOklab, unaryWeights);
    let bestLabel = pickBestAdmissibleLabel(admissible);

    if (bestLabel === -1) {
      // Defensive only -- coverage sums to ~1 across a confident cell's
      // modes, so at least one should always have positive coverage and
      // therefore a real admissible label. Never leave a cell unassigned
      // if this is somehow reached: fall back to nearest-color-to-the-
      // cell's-own-averaged-value, exactly like a non-crisp cell.
      const ownColor = oklabAt(cellOklab, cellIndex);
      let nearestDist = Infinity;
      for (let k = 0; k < paletteOklab.length; k++) {
        const d = oklabDistanceSquared(ownColor, paletteOklab[k]);
        if (d < nearestDist) {
          nearestDist = d;
          bestLabel = k;
        }
      }
    }

    cellPaletteIndex[cellIndex] = bestLabel;
  }

  return { palette: quantizeResult.palette, cellPaletteIndex };
}
