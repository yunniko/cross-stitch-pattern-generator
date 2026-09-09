import { computeCellImportance, computeEdgeMagnitude } from "./edge-map";
import { downsampleToGrid, gridDimensionsFor } from "./downsample";
import { luminance } from "./color";
import { fixDiagonalConnections, recolorSmallComponents } from "./contour-cleanup";
import { runMultiScaleOptimizer, type MultiScaleWeights } from "./local-optimizer";
import { mergeSimilarColors } from "./palette-optimizer";
import { kMeansQuantizer, type ColorQuantizer } from "./quantize";
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
    optimized = runMultiScaleOptimizer(cells, quantized, rawPalette, importance, options.multiScaleWeights);
    // Contour cleanup (Phase C): fixes structural artifacts the per-cell
    // ICM pass above has no way to see -- a component-level move (recolor
    // a whole small blob at once) or a diagonal-only pinch (invisible to
    // 4-neighbor-only energy) that no single-cell change could resolve.
    optimized = recolorSmallComponents(cells, optimized, rawPalette, importance);
    optimized = fixDiagonalConnections(cells, optimized, rawPalette);
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
  const compactPalette = usedIndices.map((i) => merged.palette[i]);
  const compactCellPaletteIndex = new Uint8Array(merged.cellPaletteIndex.length);
  for (let i = 0; i < merged.cellPaletteIndex.length; i++) {
    compactCellPaletteIndex[i] = compactRemap[merged.cellPaletteIndex[i]];
  }

  const counts = new Array(compactPalette.length).fill(0);
  for (const index of compactCellPaletteIndex) counts[index]++;

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
