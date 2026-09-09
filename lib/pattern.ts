import { downsampleToGrid, gridDimensionsFor } from "./downsample";
import { luminance } from "./color";
import { runLocalOptimizer, type LocalOptimizerWeights } from "./local-optimizer";
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
  localOptimizerWeights?: LocalOptimizerWeights;
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
  const optimized = shouldOptimize
    ? runLocalOptimizer(cells, quantized, rawPalette, options.localOptimizerWeights)
    : quantized;
  options.onProgress?.(0.8);

  const merged = shouldOptimize ? mergeSimilarColors(optimized, rawPalette) : { cellPaletteIndex: optimized, palette: rawPalette };

  const counts = new Array(merged.palette.length).fill(0);
  for (const index of merged.cellPaletteIndex) counts[index]++;

  // Sort dark-to-light for a legend that reads top-to-bottom the way a
  // gradient progression naturally would, then assign symbols in that order
  // and remap cell indices to match.
  const order = merged.palette
    .map((rgb, originalIndex) => ({ rgb, originalIndex, luminance: luminance(rgb) }))
    .sort((a, b) => a.luminance - b.luminance);

  const symbols = symbolsFor(merged.palette.length);
  const remap = new Uint8Array(merged.palette.length);
  const palette: PaletteColor[] = order.map((entry, newIndex) => {
    remap[entry.originalIndex] = newIndex;
    return {
      index: newIndex,
      rgb: entry.rgb,
      symbol: symbols[newIndex],
      count: counts[entry.originalIndex],
    };
  });

  const cellPalette = new Uint8Array(merged.cellPaletteIndex.length);
  for (let i = 0; i < merged.cellPaletteIndex.length; i++) {
    cellPalette[i] = remap[merged.cellPaletteIndex[i]];
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
