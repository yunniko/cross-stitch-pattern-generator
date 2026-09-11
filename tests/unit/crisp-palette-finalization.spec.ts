import { describe, expect, it } from "vitest";
import { finalizeCrispPalette } from "@/lib/crisp-palette-finalization";
import { meanRgbOklab } from "@/lib/quantize";
import { buildCrispEvidenceLayer, allCellIndices, selectWeightedQuantizer } from "@/lib/crisp-evidence-layer";
import { runCrispQuantizationStage } from "@/lib/crisp-quantization-stage";
import { runMultiScaleOptimizer } from "@/lib/local-optimizer";
import { kMeansQuantizer } from "@/lib/quantize";
import { rgbToOklab, oklabDistanceSquared } from "@/lib/color";
import { downsampleToGrid } from "@/lib/downsample";
import { makeHardSplitWithGenuineGrayBuffer } from "./crisp-edges-fixtures";
import type { BoundaryEvidence } from "@/lib/crisp-edge-evidence";
import type { CrispEvidenceLayer } from "@/lib/crisp-evidence-layer";
import type { CellColorBuffer, RGB } from "@/lib/types";

/**
 * G-024 M4.7 (HANDOVER.md D70): the final palette color recompute, made
 * mode-aware. Not wired into `buildPattern` yet.
 */

function makeCells(colors: RGB[]): CellColorBuffer {
  const data = new Uint8ClampedArray(colors.length * 3);
  colors.forEach(([r, g, b], i) => {
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  });
  return { data, width: colors.length, height: 1 };
}

describe("Standard-compatibility: an empty evidence layer reproduces meanRgbOklab exactly", () => {
  it("matches meanRgbOklab per label", () => {
    const colors: RGB[] = [
      [10, 10, 10],
      [12, 14, 11],
      [200, 60, 60],
      [190, 70, 65],
    ];
    const cells = makeCells(colors);
    const cellPaletteIndex = new Uint8Array([0, 0, 1, 1]);
    const palette: RGB[] = [
      [11, 12, 10],
      [195, 65, 62],
    ];
    const emptyLayer: CrispEvidenceLayer = { evidenceByCell: new Map() };

    const result = finalizeCrispPalette(cells, cellPaletteIndex, palette, emptyLayer);

    const expectedLabel0 = meanRgbOklab(cells, [0, 1]);
    const expectedLabel1 = meanRgbOklab(cells, [2, 3]);
    expect(result.palette[0]).toEqual(expectedLabel0);
    expect(result.palette[1]).toEqual(expectedLabel1);
    expect(Array.from(result.cellPaletteIndex)).toEqual([0, 0, 1, 1]); // no repairs -- nothing to repair
  });
});

describe("a crisp cell's contaminated raw average never leaks into the final palette color", () => {
  it("black stays true black even though a confident cell's own raw color is a manufactured gray", () => {
    // Cell 0's real evidence says it's a confident black/white boundary
    // cell, assigned to the black label -- but its own RAW averaged
    // source color (what a manufactured hard-boundary cell would show)
    // is a contaminating gray. The final black palette color must reflect
    // the SELECTED MODE (true black), not that raw gray.
    const contaminatingGray: RGB = [140, 140, 140];
    const trueBlack: RGB = [5, 5, 5]; // another, ordinary black-assigned cell with a real near-black color
    const colors: RGB[] = [contaminatingGray, trueBlack];
    const cells = makeCells(colors);
    const cellPaletteIndex = new Uint8Array([0, 0]); // both assigned to label 0 (black)
    const palette: RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
    ];

    const evidence: BoundaryEvidence = {
      modes: [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])],
      coverage: [0.5, 0.5],
      spread: [0, 0],
      spatialSeparation: 0.5,
      boundaryDirection: [1, 0],
      edgeSharpness: 1,
      confidence: 0.9,
    };
    const layer: CrispEvidenceLayer = { evidenceByCell: new Map([[0, evidence]]) };

    const result = finalizeCrispPalette(cells, cellPaletteIndex, palette, layer);

    // Without the fix, cell 0 would contribute contaminatingGray (140s)
    // into the mean with trueBlack (5s), pulling the average toward ~72 --
    // a visibly lightened "black." With the fix, cell 0 contributes its
    // TRUE MODE (pure black [0,0,0]) instead, so the mean stays near
    // trueBlack's own value.
    const finalBlackOklab = rgbToOklab(result.palette[0]);
    const distToTrueBlack = oklabDistanceSquared(finalBlackOklab, rgbToOklab([2.5, 2.5, 2.5])); // ~midpoint of two true-black-ish contributions
    const distToContaminated = oklabDistanceSquared(finalBlackOklab, rgbToOklab(contaminatingGray));
    expect(distToTrueBlack).toBeLessThan(distToContaminated);
    expect(result.palette[0][0]).toBeLessThan(50); // stays dark, nowhere near the 140-ish contaminated value
  });
});

describe("M4.7 composition: full pipeline through finalization on M1's genuine-gray-elsewhere fixture", () => {
  it("the final palette's black/white entries stay near-pure, and the genuine gray entry is unaffected", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    const gridSize = 16;
    const cells = downsampleToGrid(buffer, gridSize, gridSize);
    const importance = new Float32Array(gridSize * gridSize);

    const evidenceLayer = buildCrispEvidenceLayer(buffer, gridSize, gridSize, allCellIndices(gridSize, gridSize));
    const quantizerFn = selectWeightedQuantizer(kMeansQuantizer);
    const quantized = runCrispQuantizationStage(cells, 4, importance, evidenceLayer, quantizerFn);
    const optimized = runMultiScaleOptimizer(cells, quantized.cellPaletteIndex, quantized.palette, importance, undefined, undefined, evidenceLayer);

    const finalized = finalizeCrispPalette(cells, optimized, quantized.palette, evidenceLayer);

    const blackOklab = rgbToOklab([0, 0, 0]);
    const whiteOklab = rgbToOklab([255, 255, 255]);
    const genuineGrayOklab = rgbToOklab([128, 128, 128]);
    const paletteOklab = finalized.palette.map(rgbToOklab);
    const nearestDist = (target: typeof blackOklab) => Math.min(...paletteOklab.map((c) => oklabDistanceSquared(c, target)));

    expect(nearestDist(blackOklab)).toBeLessThan(0.01);
    expect(nearestDist(whiteOklab)).toBeLessThan(0.01);
    expect(nearestDist(genuineGrayOklab)).toBeLessThan(0.01);
  });
});
