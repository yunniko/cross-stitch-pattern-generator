import { edgeBetweenCells } from "./edge-map";
import { oklabDistanceSquared, rgbToOklab } from "./color";
import { confettiRatio, labelRegions } from "./regions";
import { cellRgb, type CellColorBuffer, type StitchPattern } from "./types";

export interface PatternDiagnostics {
  colorCount: number;
  componentCount: number;
  singleCellComponentCount: number;
  twoCellComponentCount: number;
  averageComponentSize: number;
  medianComponentSize: number;
  /** Fraction of cells belonging to a component of size <= 2 (Owner's spec section 28). */
  confettiRatio: number;
  /** Total 4-adjacent cell-pairs with differing colors -- a proxy for how many thread changes stitching this pattern requires. */
  boundaryCellPairCount: number;
  /**
   * Average `perimeter^2 / area` across components with area > 2 (the
   * Owner's spec section 9's compactness formula). Substitutes for the
   * spec's separate jaggy run-length metric, which needs full contour
   * extraction -- not implemented (see HANDOVER.md D10). A ragged/
   * fractal boundary inflates perimeter relative to area the same way a
   * jaggy one does, so this is a real, if coarser, stand-in.
   */
  averageCompactness: number;
  /** Mean OKLab squared distance between each cell's true source color and its assigned palette color -- "how much accuracy did quantization/optimization cost." */
  averageReconstructionError: number;
  /**
   * (average edge-strength on pattern boundaries) - (average edge-strength
   * on non-boundaries). Positive means boundaries tend to sit where the
   * source actually has an edge (good); near zero or negative means
   * boundaries are appearing independent of real source structure.
   * `NaN` if no importance map was provided.
   */
  edgeAlignmentScore: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computePatternDiagnostics(
  pattern: StitchPattern,
  cells: CellColorBuffer,
  importance?: Float32Array
): PatternDiagnostics {
  const { width, height, cellPalette, palette } = pattern;
  const regions = labelRegions(cellPalette, width, height);
  const areas = regions.components.map((c) => c.area);

  let boundaryCellPairCount = 0;
  let boundaryImportanceSum = 0;
  let boundaryImportanceCount = 0;
  let nonBoundaryImportanceSum = 0;
  let nonBoundaryImportanceCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const right = x < width - 1 ? i + 1 : -1;
      const down = y < height - 1 ? i + width : -1;
      for (const n of [right, down]) {
        if (n === -1) continue;
        const isBoundary = cellPalette[i] !== cellPalette[n];
        if (isBoundary) boundaryCellPairCount++;
        if (importance) {
          const edge = edgeBetweenCells(importance, i, n);
          if (isBoundary) {
            boundaryImportanceSum += edge;
            boundaryImportanceCount++;
          } else {
            nonBoundaryImportanceSum += edge;
            nonBoundaryImportanceCount++;
          }
        }
      }
    }
  }

  const compactComponents = regions.components.filter((c) => c.area > 2);
  const averageCompactness =
    compactComponents.length === 0
      ? 0
      : compactComponents.reduce((sum, c) => sum + (c.perimeter * c.perimeter) / c.area, 0) / compactComponents.length;

  const paletteOklab = palette.map((c) => rgbToOklab(c.rgb));
  let reconstructionErrorSum = 0;
  for (let i = 0; i < cellPalette.length; i++) {
    reconstructionErrorSum += oklabDistanceSquared(rgbToOklab(cellRgb(cells, i)), paletteOklab[cellPalette[i]]);
  }

  return {
    colorCount: palette.length,
    componentCount: regions.components.length,
    singleCellComponentCount: areas.filter((a) => a === 1).length,
    twoCellComponentCount: areas.filter((a) => a === 2).length,
    averageComponentSize: areas.reduce((s, a) => s + a, 0) / (areas.length || 1),
    medianComponentSize: median(areas),
    confettiRatio: confettiRatio(regions),
    boundaryCellPairCount,
    averageCompactness,
    averageReconstructionError: reconstructionErrorSum / (cellPalette.length || 1),
    edgeAlignmentScore: importance
      ? boundaryImportanceSum / (boundaryImportanceCount || 1) - nonBoundaryImportanceSum / (nonBoundaryImportanceCount || 1)
      : NaN,
  };
}
