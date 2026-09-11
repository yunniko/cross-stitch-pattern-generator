import { computeCellImportance, computeEdgeMagnitude } from "./edge-map";
import { denoiseForQuantization } from "./denoise";
import { downsampleToGrid, gridDimensionsFor } from "./downsample";
import { luminance } from "./color";
import { nameColors } from "./color-names";
import { defaultComponentRecolorOptions, fixDiagonalConnections, recolorSmallComponents } from "./contour-cleanup";
import { runMultiScaleOptimizer, type MultiScaleWeights } from "./local-optimizer";
import { computePairEdgeEvidence } from "./pair-edge-evidence";
import { mergeSimilarColors } from "./palette-optimizer";
import { kMeansQuantizer, meanRgbOklab, type ColorQuantizer } from "./quantize";
import { symbolsFor } from "./symbols";
import { runContourRefinement, DEFAULT_CONTOUR_REFINEMENT_OPTIONS, type ContourRefinementOptions } from "./contour-refinement";
import type { PaletteColor, PixelBuffer, StitchPattern } from "./types";

export interface BuildPatternOptions {
  longerSideStitches: number;
  colorCount: number;
  quantizer?: ColorQuantizer;
  /** Set to skip the local optimizer/palette-merge passes — used by tests that want the raw quantizer output. */
  optimize?: boolean;
  multiScaleWeights?: MultiScaleWeights;
  /**
   * G-022 M5.5's contour-pacing refinement pass (HANDOVER.md D48/D54).
   * Deliberately opt-in, defaulting to off: M5.6's broad D45-style sweep
   * across the existing golden-fixture/shape-regression suites hasn't
   * happened yet, so this must not become default pipeline behavior
   * before that gate. No effect when `optimize` is false.
   */
  contourRefinement?: boolean;
  contourRefinementOptions?: ContourRefinementOptions;
  onProgress?: (fraction: number) => void;
}

export function buildPattern(imageData: PixelBuffer, options: BuildPatternOptions): StitchPattern {
  const { width: gridWidth, height: gridHeight } = gridDimensionsFor(
    imageData.width,
    imageData.height,
    options.longerSideStitches
  );
  options.onProgress?.(0.1);
  const cells = downsampleToGrid(imageData, gridWidth, gridHeight);

  // Computed unconditionally (not just under `shouldOptimize`) and passed
  // into the quantizer itself, not just the optimizer passes below: a
  // 2026-09-11 review (HANDOVER.md D39/G-020 M3) found the quantizer's own
  // worst-fit reinvestment (`kMeansQuantizer`) had no way to prefer a
  // genuinely important rare detail over a rare artifact, since importance
  // wasn't computed yet at quantization time. Both `computeEdgeMagnitude`
  // and `computeCellImportance` depend only on the original image and grid
  // dimensions, never on the quantizer's own output, so moving this earlier
  // changes nothing about the values themselves.
  const edgeMagnitude = computeEdgeMagnitude(imageData);
  const importance = computeCellImportance(imageData, edgeMagnitude, gridWidth, gridHeight);

  // Denoised copy for the quantizer's eyes only (HANDOVER.md D41/G-020 M4)
  // -- every other stage below (ICM, contour cleanup, the final palette-
  // color recompute) keeps using the true, unfiltered `cells`, so a
  // cleaner signal informs *which cluster a cell belongs to* without ever
  // changing what color is actually reported for it.
  const quantizationCells = denoiseForQuantization(cells, importance);

  const quantizer = options.quantizer ?? kMeansQuantizer;
  const { cellPaletteIndex: quantized, palette: rawPalette } = quantizer.quantize(
    quantizationCells,
    options.colorCount,
    importance
  );
  options.onProgress?.(0.4);

  const shouldOptimize = options.optimize ?? true;
  let optimized = quantized;
  let pairEvidence: Float32Array | undefined;
  if (shouldOptimize) {
    // Directional, per-pair color-structure-tensor edge evidence
    // (HANDOVER.md D44/G-022 M3) -- computed once here (only needed by the
    // optimizer/cleanup passes below, unlike `importance`, which the
    // quantizer also needs), then threaded through as an additive,
    // optional signal alongside `importance` itself. `importance` keeps
    // gating every protection threshold below (contour-cleanup's two,
    // already applied above for the quantizer); this new evidence only
    // replaces `edgeBetweenCells` for the smoothing-energy `edge` term.
    pairEvidence = computePairEdgeEvidence(imageData, gridWidth, gridHeight);
    const componentRecolorOptions = defaultComponentRecolorOptions(cells.width * cells.height);
    optimized = runMultiScaleOptimizer(cells, quantized, rawPalette, importance, options.multiScaleWeights, pairEvidence);
    // Contour cleanup (Phase C): fixes structural artifacts the per-cell
    // ICM pass above has no way to see -- a component-level move (recolor
    // a whole small blob at once) or a diagonal-only pinch (invisible to
    // 4-neighbor-only energy) that no single-cell change could resolve.
    optimized = recolorSmallComponents(cells, optimized, rawPalette, importance, componentRecolorOptions, pairEvidence);
    optimized = fixDiagonalConnections(cells, optimized, rawPalette, importance);
    // Diagonal fixes can leave a pinch's other member as a fresh size-1
    // component with nothing after it to clean up -- a domain-expert review
    // found this could regress confetti as the pipeline's last structural
    // step (HANDOVER.md D11). One more component-recolor pass closes that gap.
    optimized = recolorSmallComponents(cells, optimized, rawPalette, importance, componentRecolorOptions, pairEvidence);
  }
  options.onProgress?.(0.8);

  const merged = shouldOptimize ? mergeSimilarColors(optimized, rawPalette) : { cellPaletteIndex: optimized, palette: rawPalette };

  // G-022 M5.5 contour-pacing refinement (HANDOVER.md D48/D54) -- placed
  // after structural cleanup and palette merging, before the final
  // palette-color recompute below, per the critique's own explicit
  // "passes fighting" warning: no unchanged cleanup pass runs after this
  // one, so it doesn't get silently undone. Opt-in only (see
  // `BuildPatternOptions.contourRefinement`'s own doc comment).
  if (shouldOptimize && options.contourRefinement) {
    merged.cellPaletteIndex = runContourRefinement(
      cells,
      merged.cellPaletteIndex,
      merged.palette,
      importance,
      options.multiScaleWeights?.fine ?? { color: 1, smoothness: 0.045, edgeLoss: 0.05 },
      1,
      options.contourRefinementOptions ?? DEFAULT_CONTOUR_REFINEMENT_OPTIONS,
      pairEvidence
    );
  }

  // Drop any palette entry no cell actually uses -- reachable whenever the
  // contour-cleanup passes above (recolorSmallComponents especially) end up
  // recoloring away every last cell of some color without the palette-merge
  // step's own distance threshold happening to catch it. A legend row for a
  // color nothing is stitched in is a real bug, not a cosmetic one.
  const rawCounts = new Array(merged.palette.length).fill(0);
  for (const index of merged.cellPaletteIndex) rawCounts[index]++;
  const usedIndices = merged.palette.map((_, i) => i).filter((i) => rawCounts[i] > 0);
  const compactRemap = new Int16Array(merged.palette.length).fill(-1);
  usedIndices.forEach((oldIndex, newIndex) => {
    compactRemap[oldIndex] = newIndex;
  });
  const compactCellPaletteIndex = new Uint8Array(merged.cellPaletteIndex.length);
  for (let i = 0; i < merged.cellPaletteIndex.length; i++) {
    compactCellPaletteIndex[i] = compactRemap[merged.cellPaletteIndex[i]];
  }

  const counts = new Array(usedIndices.length).fill(0);
  for (const index of compactCellPaletteIndex) counts[index]++;

  // Recompute each palette color from its *final* member cells rather than
  // reusing the pre-optimization k-means centroid. A domain-expert review
  // (HANDOVER.md D11) found this was never done: ICM, component recoloring,
  // and diagonal fixes all reassign cells between colors, so the k-means
  // mean no longer reflects who's actually assigned to it by the time the
  // chart is rendered. Averaged in OKLab space (not a linear-RGB mean) --
  // assignment throughout this pipeline (k-means, ICM, contour cleanup) is
  // all driven by squared OKLab distance, and a mean only minimizes squared
  // error in the coordinate system it's computed in; a linear-RGB mean of
  // the same membership is a genuinely different, less accurate color by
  // that metric, not just a stylistic difference (code-review 2026-09-09,
  // finding 3 -- the previous version of this comment claimed the linear-RGB
  // recompute was "provably at least as accurate," which wasn't true).
  const cellsByFinalIndex: number[][] = usedIndices.map(() => []);
  for (let i = 0; i < compactCellPaletteIndex.length; i++) cellsByFinalIndex[compactCellPaletteIndex[i]].push(i);
  const compactPalette = usedIndices.map((originalIndex, newIndex) =>
    cellsByFinalIndex[newIndex].length > 0 ? meanRgbOklab(cells, cellsByFinalIndex[newIndex]) : merged.palette[originalIndex]
  );

  // Sort dark-to-light for a legend that reads top-to-bottom the way a
  // gradient progression naturally would, then assign symbols in that order
  // and remap cell indices to match.
  const order = compactPalette
    .map((rgb, originalIndex) => ({ rgb, originalIndex, luminance: luminance(rgb) }))
    .sort((a, b) => a.luminance - b.luminance);

  const symbols = symbolsFor(compactPalette.length);
  const names = nameColors(order.map((entry) => entry.rgb));
  const remap = new Uint8Array(compactPalette.length);
  const palette: PaletteColor[] = order.map((entry, newIndex) => {
    remap[entry.originalIndex] = newIndex;
    return {
      index: newIndex,
      rgb: entry.rgb,
      symbol: symbols[newIndex],
      name: names[newIndex],
      count: counts[entry.originalIndex],
    };
  });

  const cellPalette = new Uint8Array(compactCellPaletteIndex.length);
  for (let i = 0; i < compactCellPaletteIndex.length; i++) {
    cellPalette[i] = remap[compactCellPaletteIndex[i]];
  }
  options.onProgress?.(1);

  return {
    width: gridWidth,
    height: gridHeight,
    cellPalette,
    palette,
    isLandscape: imageData.width > imageData.height,
  };
}
