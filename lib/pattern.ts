import { downsampleToGrid, gridDimensionsFor } from "./downsample";
import { luminance } from "./color";
import { kMeansLabQuantizer, type ColorQuantizer } from "./quantize";
import { symbolsFor } from "./symbols";
import type { PaletteColor, PixelBuffer, StitchPattern } from "./types";

export interface BuildPatternOptions {
  longerSideStitches: number;
  colorCount: number;
  quantizer?: ColorQuantizer;
}

export function buildPattern(imageData: PixelBuffer, options: BuildPatternOptions): StitchPattern {
  const { width: gridWidth, height: gridHeight } = gridDimensionsFor(
    imageData.width,
    imageData.height,
    options.longerSideStitches
  );
  const cellColors = downsampleToGrid(imageData, gridWidth, gridHeight);

  const quantizer = options.quantizer ?? kMeansLabQuantizer;
  const { cellPaletteIndex, palette: rawPalette } = quantizer.quantize(cellColors, options.colorCount);

  const counts = new Array(rawPalette.length).fill(0);
  for (const index of cellPaletteIndex) counts[index]++;

  // Sort light-to-dark for a legend that reads top-to-bottom sensibly, then
  // assign symbols in that order and remap cell indices to match.
  const order = rawPalette
    .map((rgb, originalIndex) => ({ rgb, originalIndex, luminance: luminance(rgb) }))
    .sort((a, b) => a.luminance - b.luminance);

  const symbols = symbolsFor(rawPalette.length);
  const remap = new Uint8Array(rawPalette.length);
  const palette: PaletteColor[] = order.map((entry, newIndex) => {
    remap[entry.originalIndex] = newIndex;
    return {
      index: newIndex,
      rgb: entry.rgb,
      symbol: symbols[newIndex],
      count: counts[entry.originalIndex],
    };
  });

  const cellPalette = new Uint8Array(cellPaletteIndex.length);
  for (let i = 0; i < cellPaletteIndex.length; i++) {
    cellPalette[i] = remap[cellPaletteIndex[i]];
  }

  return {
    width: gridWidth,
    height: gridHeight,
    cellPalette,
    palette,
    isLandscape: imageData.width > imageData.height,
  };
}
