import { oklabDistanceSquared, rgbToOklab } from "../color/color";
import { buildAdmissibleLabelCosts, pickBestAdmissibleLabel, DEFAULT_CRISP_UNARY_COST_WEIGHTS, type CrispUnaryCostWeights } from "./crisp-unary-cost";
import type { CrispEvidenceLayer, WeightedQuantizerFn } from "./crisp-evidence-layer";
import { cellsToOklab, oklabAt } from "../pipeline/pipeline-context";
import type { CellColorBuffer, RGB } from "../types";
import type { WeightedColorSample } from "./weighted-quantize";

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
  precomputedOklab?: Float64Array
): CrispQuantizationResult {
  const cellCount = cells.width * cells.height;
  const cellOklab = precomputedOklab ?? cellsToOklab(cells);
  const samples: WeightedColorSample[] = [];
  // Non-crisp cells contribute exactly one sample -- remember which array
  // index it lands at so the initial per-cell assignment can read the
  // quantizer's own label back out directly, without re-deriving anything.
  const nonCrispSampleIndex = new Map<number, number>();

  for (let cellIndex = 0; cellIndex < cellCount; cellIndex++) {
    const evidence = evidenceLayer.evidenceByCell.get(cellIndex);
    if (evidence) {
      samples.push({ oklab: evidence.modes[0], weight: evidence.coverage[0], cellIndex });
      samples.push({ oklab: evidence.modes[1], weight: evidence.coverage[1], cellIndex });
    } else {
      nonCrispSampleIndex.set(cellIndex, samples.length);
      samples.push({ oklab: oklabAt(cellOklab, cellIndex), weight: 1, cellIndex });
    }
  }

  const quantizeResult = quantizerFn(samples, colorCount, (cellIndex) => importance[cellIndex]);
  const paletteOklab = quantizeResult.palette.map(rgbToOklab);

  const cellPaletteIndex = new Uint8Array(cellCount);
  for (let cellIndex = 0; cellIndex < cellCount; cellIndex++) {
    const evidence = evidenceLayer.evidenceByCell.get(cellIndex);
    if (!evidence) {
      cellPaletteIndex[cellIndex] = quantizeResult.sampleLabelIndex[nonCrispSampleIndex.get(cellIndex)!];
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
