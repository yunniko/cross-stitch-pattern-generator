import { oklabDistanceSquared, rgbToOklab } from "./color";
import { buildAdmissibleLabelCosts, pickBestAdmissibleLabel, DEFAULT_CRISP_UNARY_COST_WEIGHTS, type CrispUnaryCostWeights } from "./crisp-unary-cost";
import type { CrispEvidenceLayer, WeightedQuantizerFn } from "./crisp-evidence-layer";
import { cellRgb, type CellColorBuffer, type RGB } from "./types";
import type { WeightedColorSample } from "./weighted-quantize";

/**
 * G-024 M4.3 (HANDOVER.md D66): quantization + initialization -- builds
 * the weighted sample pool from a frozen `CrispEvidenceLayer` (M4.2), runs
 * the caller's chosen weighted quantizer (`selectWeightedQuantizer`,
 * M4.2, preserving Original/Latest), then initializes every cell's label:
 * a non-crisp cell gets its quantizer-assigned label directly; a crisp
 * cell is initialized to `argmin` of the actual mode-aware unary cost
 * (Codex critique, HANDOVER.md D63) -- NOT "larger coverage wins," which
 * can pick the more expensive candidate once palette-fit errors are
 * unequal (worked example: 60%-coverage side with fit error 0.04 costs
 * 0.10 at the default weights; a perfectly-fit 40%-coverage side costs
 * only 0.09 -- coverage-only initialization would wrongly pick the first).
 *
 * Admissibility is evaluated against the quantizer's RETURNED RGB palette
 * converted back to OKLab, not the internal float centroids used during
 * clustering (M3's own documented mapping-lifecycle contract) -- the
 * returned palette is gamut-clamped/rounded, and downstream stages (ICM,
 * merge, DMC) only ever see that fixed palette, never the training-time
 * centroids.
 *
 * Not wired into `buildPattern` yet -- that's M4.4 onward.
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
  unaryWeights: CrispUnaryCostWeights = DEFAULT_CRISP_UNARY_COST_WEIGHTS
): CrispQuantizationResult {
  const cellCount = cells.width * cells.height;
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
      samples.push({ oklab: rgbToOklab(cellRgb(cells, cellIndex)), weight: 1, cellIndex });
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
      const cellOklab = rgbToOklab(cellRgb(cells, cellIndex));
      let nearestDist = Infinity;
      for (let k = 0; k < paletteOklab.length; k++) {
        const d = oklabDistanceSquared(cellOklab, paletteOklab[k]);
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
