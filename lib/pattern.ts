import { computeCellImportance, computeEdgeMagnitude } from "./edge-map";
import { downsampleToGrid, gridDimensionsFor } from "./downsample";
import { luminance } from "./color";
import { defaultComponentRecolorOptions, fixDiagonalConnections, recolorSmallComponents } from "./contour-cleanup";
import { runMultiScaleOptimizer, type MultiScaleWeights } from "./local-optimizer";
import { mergeSimilarColors } from "./palette-optimizer";
import { kMeansQuantizer, meanRgbLinear, type ColorQuantizer } from "./quantize";
import { symbolsFor } from "./symbols";
import type { PaletteColor, PixelBuffer, StitchPattern } from "./types";

export interface BuildPatternOptions {
  longerSideStitches: number;
  colorCount: number;
  quantizer?: ColorQuantizer;
  /** Set to skip the local optimizer/palette-merge passes — used by tests that want the raw quantizer output. */
  optimize?: boolean;
  multiScaleWeights?: MultiScaleWeights;
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

  const quantizer = options.quantizer ?? kMeansQuantizer;
  const { cellPaletteIndex: quantized, palette: rawPalette } = quantizer.quantize(cells, options.colorCount);
  options.onProgress?.(0.4);

  const shouldOptimize = options.optimize ?? true;
  let optimized = quantized;
  if (shouldOptimize) {
    const edgeMagnitude = computeEdgeMagnitude(imageData);
    const importance = computeCellImportance(imageData, edgeMagnitude, gridWidth, gridHeight);
    const componentRecolorOptions = defaultComponentRecolorOptions(cells.width * cells.height);
    optimized = runMultiScaleOptimizer(cells, quantized, rawPalette, importance, options.multiScaleWeights);
    // Contour cleanup (Phase C): fixes structural artifacts the per-cell
    // ICM pass above has no way to see -- a component-level move (recolor
    // a whole small blob at once) or a diagonal-only pinch (invisible to
    // 4-neighbor-only energy) that no single-cell change could resolve.
    optimized = recolorSmallComponents(cells, optimized, rawPalette, importance, componentRecolorOptions);
    optimized = fixDiagonalConnections(cells, optimized, rawPalette, importance);
    // Diagonal fixes can leave a pinch's other member as a fresh size-1
    // component with nothing after it to clean up -- a domain-expert review
    // found this could regress confetti as the pipeline's last structural
    // step (HANDOVER.md D11). One more component-recolor pass closes that gap.
    optimized = recolorSmallComponents(cells, optimized, rawPalette, importance, componentRecolorOptions);
  }
  options.onProgress?.(0.8);

  const merged = shouldOptimize ? mergeSimilarColors(optimized, rawPalette) : { cellPaletteIndex: optimized, palette: rawPalette };

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
  // chart is rendered. One more linear-light mean per color, using cells
  // this pattern actually settled on, and it's provably at least as
  // accurate (the definition of a Lloyd update).
  const cellsByFinalIndex: number[][] = usedIndices.map(() => []);
  for (let i = 0; i < compactCellPaletteIndex.length; i++) cellsByFinalIndex[compactCellPaletteIndex[i]].push(i);
  const compactPalette = usedIndices.map((originalIndex, newIndex) =>
    cellsByFinalIndex[newIndex].length > 0 ? meanRgbLinear(cells, cellsByFinalIndex[newIndex]) : merged.palette[originalIndex]
  );

  // Sort dark-to-light for a legend that reads top-to-bottom the way a
  // gradient progression naturally would, then assign symbols in that order
  // and remap cell indices to match.
  const order = compactPalette
    .map((rgb, originalIndex) => ({ rgb, originalIndex, luminance: luminance(rgb) }))
    .sort((a, b) => a.luminance - b.luminance);

  const symbols = symbolsFor(compactPalette.length);
  const remap = new Uint8Array(compactPalette.length);
  const palette: PaletteColor[] = order.map((entry, newIndex) => {
    remap[entry.originalIndex] = newIndex;
    return {
      index: newIndex,
      rgb: entry.rgb,
      symbol: symbols[newIndex],
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
