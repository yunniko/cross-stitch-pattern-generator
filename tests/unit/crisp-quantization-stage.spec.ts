import { describe, expect, it } from "vitest";
import { runCrispQuantizationStage } from "@/lib/crisp-quantization-stage";
import { buildCrispEvidenceLayer, allCellIndices, selectWeightedQuantizer } from "@/lib/crisp-evidence-layer";
import { plainKMeansQuantizer, kMeansQuantizer } from "@/lib/quantize";
import { rgbToOklab, oklabDistanceSquared } from "@/lib/color";
import type { BoundaryEvidence } from "@/lib/crisp-edge-evidence";
import type { CrispEvidenceLayer } from "@/lib/crisp-evidence-layer";
import { downsampleToGrid } from "@/lib/downsample";
import { makeHardSplitWithGenuineGrayBuffer } from "./crisp-edges-fixtures";
import type { CellColorBuffer, RGB } from "@/lib/types";

/**
 * G-024 M4.3 (HANDOVER.md D66): quantization + initialization. Not wired
 * into `buildPattern` yet.
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

describe("Standard-compatibility: no confident cells reproduces the underlying quantizer exactly", () => {
  it("matches plainKMeansQuantizer when the evidence layer is empty", () => {
    const colors: RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
      [220, 30, 30],
      [128, 128, 128],
    ];
    const cells = makeCells(colors);
    const importance = new Float32Array(colors.length);
    const emptyLayer: CrispEvidenceLayer = { evidenceByCell: new Map() };
    const quantizerFn = selectWeightedQuantizer(plainKMeansQuantizer);

    const crispResult = runCrispQuantizationStage(cells, 4, importance, emptyLayer, quantizerFn);
    const standard = plainKMeansQuantizer.quantize(cells, 4);

    expect(crispResult.palette).toEqual(standard.palette);
    expect(Array.from(crispResult.cellPaletteIndex)).toEqual(Array.from(standard.cellPaletteIndex));
  });

  it("matches kMeansQuantizer when the evidence layer is empty", () => {
    const colors: RGB[] = [
      [10, 10, 10],
      [12, 11, 10],
      [200, 200, 200],
      [198, 199, 201],
      [220, 30, 30],
      [30, 220, 30],
      [30, 30, 220],
      [128, 64, 200],
    ];
    const cells = makeCells(colors);
    const importance = new Float32Array(colors.length);
    const emptyLayer: CrispEvidenceLayer = { evidenceByCell: new Map() };
    const quantizerFn = selectWeightedQuantizer(kMeansQuantizer);

    const crispResult = runCrispQuantizationStage(cells, 5, importance, emptyLayer, quantizerFn);
    const standard = kMeansQuantizer.quantize(cells, 5, importance);

    expect(crispResult.palette).toEqual(standard.palette);
    expect(Array.from(crispResult.cellPaletteIndex)).toEqual(Array.from(standard.cellPaletteIndex));
  });
});

describe("crisp initialization uses argmin unary cost, not larger-coverage-wins", () => {
  it("a smaller-coverage side with a perfect palette fit wins over a larger-coverage side with real fit error", () => {
    // Critique's own worked example (HANDOVER.md D63): at alpha=1,
    // beta=0.15, a 60%-coverage side with squared fit error 0.04 costs
    // 0.10; a perfectly-fit 40%-coverage side costs only 0.09 -- coverage-
    // only initialization would wrongly pick the 60% side. A stub
    // quantizer function returns a FIXED palette directly (bypassing real
    // weighted k-means training, which would otherwise naturally fit an
    // exact cluster around EACH mode individually and defeat the "one
    // side has a real fit error" premise this test needs) so the
    // palette's fit quality for each mode is controlled precisely.
    const modeA = rgbToOklab([100, 100, 100]); // 60% coverage
    const modeB = rgbToOklab([200, 50, 50]); // 40% coverage, exact palette match

    const evidence: BoundaryEvidence = {
      modes: [modeA, modeB],
      coverage: [0.6, 0.4],
      spread: [0, 0],
      spatialSeparation: 0.5,
      boundaryDirection: [1, 0],
      edgeSharpness: 1,
      confidence: 0.9,
    };

    // A fixed palette: index 0 is CLOSE to modeA but not exact (real fit
    // error), index 1 is an EXACT match for modeB.
    const fixedPaletteRgb: RGB[] = [
      [180, 180, 180], // NOT close to modeA=[100,100,100] -- a real, substantial fit error
      [200, 50, 50], // exact match for modeB
    ];
    const approxModeAError = oklabDistanceSquared(rgbToOklab(fixedPaletteRgb[0]), modeA);
    // At alpha=1, beta=0.15: label0's cost = approxModeAError + 0.15*(1-0.6);
    // label1's cost = 0 + 0.15*(1-0.4) = 0.09. label0 loses exactly when
    // approxModeAError > 0.03 -- confirm this fixture's fit error clears
    // that bar with real margin, not by luck.
    expect(approxModeAError).toBeGreaterThan(0.03);

    const colors: RGB[] = [[0, 0, 0]]; // cell 0 is the only cell, and it's the confident one
    const cells = makeCells(colors);
    const importance = new Float32Array(colors.length);
    const layer: CrispEvidenceLayer = { evidenceByCell: new Map([[0, evidence]]) };

    const stubQuantizerFn = () => ({ palette: fixedPaletteRgb, sampleLabelIndex: new Uint8Array([0, 1]) });

    const result = runCrispQuantizationStage(cells, 2, importance, layer, stubQuantizerFn);

    // Cell 0 must initialize to label 1 (modeB, smaller coverage but a
    // far better fit) -- NOT label 0 (modeA, larger coverage but real
    // fit error), which a coverage-only rule would have wrongly picked.
    expect(result.cellPaletteIndex[0]).toBe(1);
  });
});

describe("M4.3 composition: full quantization stage on M1's genuine-gray-elsewhere fixture", () => {
  it("recovers real black/white/gray and initializes the split correctly", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    const gridSize = 16;
    const cells = downsampleToGrid(buffer, gridSize, gridSize);
    const importance = new Float32Array(gridSize * gridSize);

    const evidenceLayer = buildCrispEvidenceLayer(buffer, gridSize, gridSize, allCellIndices(gridSize, gridSize));
    expect(evidenceLayer.evidenceByCell.size).toBeGreaterThan(0);

    const quantizerFn = selectWeightedQuantizer(kMeansQuantizer);
    const result = runCrispQuantizationStage(cells, 4, importance, evidenceLayer, quantizerFn);

    const blackOklab = rgbToOklab([0, 0, 0]);
    const whiteOklab = rgbToOklab([255, 255, 255]);
    const genuineGrayOklab = rgbToOklab([128, 128, 128]);
    const paletteOklab = result.palette.map(rgbToOklab);
    const nearestDist = (target: typeof blackOklab) => Math.min(...paletteOklab.map((c) => oklabDistanceSquared(c, target)));
    expect(nearestDist(blackOklab)).toBeLessThan(0.01);
    expect(nearestDist(whiteOklab)).toBeLessThan(0.01);
    expect(nearestDist(genuineGrayOklab)).toBeLessThan(0.01);

    const grayLabel = paletteOklab.findIndex((c) => oklabDistanceSquared(c, genuineGrayOklab) < 0.01);
    // Every confident cell at the black/white split (columns 5-10, away
    // from the gray region) must initialize to black or white, never the
    // unrelated gray label.
    for (const [cellIndex] of evidenceLayer.evidenceByCell) {
      const cx = cellIndex % gridSize;
      if (cx < 5 || cx > 10) continue;
      expect(result.cellPaletteIndex[cellIndex]).not.toBe(grayLabel);
    }
  });
});
