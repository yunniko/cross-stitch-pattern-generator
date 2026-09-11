import { describe, expect, it } from "vitest";
import { runLocalOptimizer, runMultiScaleOptimizer, DEFAULT_LOCAL_OPTIMIZER_WEIGHTS } from "@/lib/local-optimizer";
import { buildCrispEvidenceLayer, allCellIndices } from "@/lib/crisp-evidence-layer";
import { runCrispQuantizationStage } from "@/lib/crisp-quantization-stage";
import { selectWeightedQuantizer } from "@/lib/crisp-evidence-layer";
import { kMeansQuantizer } from "@/lib/quantize";
import { rgbToOklab, oklabDistanceSquared } from "@/lib/color";
import { downsampleToGrid } from "@/lib/downsample";
import { makeHardSplitWithGenuineGrayBuffer } from "./crisp-edges-fixtures";
import type { BoundaryEvidence } from "@/lib/crisp-edge-evidence";
import type { CrispEvidenceLayer } from "@/lib/crisp-evidence-layer";
import type { CellColorBuffer, RGB } from "@/lib/types";

/**
 * G-024 M4.4 (HANDOVER.md D67): ICM integration. Not wired into
 * `buildPattern` yet.
 */

function makeCells(width: number, height: number, colorAt: (x: number, y: number) => RGB): CellColorBuffer {
  const data = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * width + x) * 3;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return { data, width, height };
}

describe("Standard-compatibility: omitting crispEvidenceLayer reproduces today's exact behavior", () => {
  it("runLocalOptimizer is byte-identical with and without an (empty) crispEvidenceLayer", () => {
    const width = 6;
    const height = 6;
    const cells = makeCells(width, height, (x) => (x < 3 ? [0, 0, 0] : [255, 255, 255]));
    const palette: RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
    ];
    const initial = new Uint8Array(width * height).fill(0);
    const withoutLayer = runLocalOptimizer(cells, initial, palette);
    const withEmptyLayer = runLocalOptimizer(cells, initial, palette, undefined, DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, undefined, { evidenceByCell: new Map() });
    expect(Array.from(withEmptyLayer)).toEqual(Array.from(withoutLayer));
  });

  it("a cell absent from a non-empty crispEvidenceLayer is evaluated exactly like Standard", () => {
    const width = 6;
    const height = 6;
    const cells = makeCells(width, height, (x) => (x < 3 ? [0, 0, 0] : [255, 255, 255]));
    const palette: RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
      [128, 128, 128],
    ];
    const initial = new Uint8Array(width * height).fill(0);

    // A crispEvidenceLayer with an entry for a DIFFERENT, unrelated cell
    // (far from every cell actually tested below) must not change the
    // outcome for any cell not itself in the layer.
    const dummyEvidence: BoundaryEvidence = {
      modes: [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])],
      coverage: [0.5, 0.5],
      spread: [0, 0],
      spatialSeparation: 0.5,
      boundaryDirection: [1, 0],
      edgeSharpness: 1,
      confidence: 0.9,
    };
    const layer: CrispEvidenceLayer = { evidenceByCell: new Map([[35, dummyEvidence]]) }; // cell 35 = bottom-right corner

    const withoutLayer = runLocalOptimizer(cells, initial, palette);
    const withLayer = runLocalOptimizer(cells, initial, palette, undefined, DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, undefined, layer);
    // Every cell except 35 must match exactly.
    for (let i = 0; i < width * height; i++) {
      if (i === 35) continue;
      expect(withLayer[i]).toBe(withoutLayer[i]);
    }
  });
});

describe("admissibility is enforced: a confident cell never gets assigned an unsupported label", () => {
  it("a confident black/white cell never gets recolored to an unrelated gray label, even under strong pairwise pull", () => {
    // A confident cell surrounded entirely by gray neighbors would, under
    // Standard's own unconstrained search, likely get pulled toward gray
    // (matching its neighbors) if gray's color-fit were close enough.
    // Under Crisp admissibility, gray must NEVER be selected regardless of
    // how strong the pairwise pull is, since it isn't a supported mode.
    const width = 3;
    const height = 3;
    const cells = makeCells(width, height, () => [128, 128, 128]); // all gray except center, set below
    const centerIndex = 4; // (1,1)
    const palette: RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
      [128, 128, 128],
    ];
    const initial = new Uint8Array(width * height).fill(2); // everyone starts on gray

    const evidence: BoundaryEvidence = {
      modes: [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])],
      coverage: [0.5, 0.5],
      spread: [0, 0],
      spatialSeparation: 0.5,
      boundaryDirection: [1, 0],
      edgeSharpness: 1,
      confidence: 0.9,
    };
    const layer: CrispEvidenceLayer = { evidenceByCell: new Map([[centerIndex, evidence]]) };
    initial[centerIndex] = 0; // start it on black (an admissible label)

    const result = runLocalOptimizer(cells, initial, palette, undefined, DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, undefined, layer);
    expect(result[centerIndex]).not.toBe(2); // never gray
    expect([0, 1]).toContain(result[centerIndex]); // must be black or white
  });
});

describe("tie-breaking: a protected cell keeps its current admissible label on an exact energy tie", () => {
  it("does not flip to the other admissible label when both cost exactly the same", () => {
    const width = 3;
    const height = 1;
    const cells = makeCells(width, height, () => [128, 128, 128]);
    const palette: RGB[] = [
      [0, 0, 0], // label 0
      [255, 255, 255], // label 1
    ];
    // Symmetric evidence: equal coverage, both modes equidistant from
    // whatever palette entries map to them -- and no neighbors at all (a
    // 1-row, isolated-in-y grid with only 2 horizontal neighbors that
    // themselves are NOT confident, contributing a symmetric, non-tie-
    // breaking pairwise term is hard to guarantee generally, so this test
    // isolates the tie by using a single CENTER cell with importance 0 and
    // pairEvidence omitted, and neighbors sharing the exact same distance
    // to both palette labels -- constructed so the unary term alone ties).
    const evidence: BoundaryEvidence = {
      modes: [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])],
      coverage: [0.5, 0.5], // exactly equal coverage -> exactly equal unary cost for both labels
      spread: [0, 0],
      spatialSeparation: 0.5,
      boundaryDirection: [1, 0],
      edgeSharpness: 1,
      confidence: 0.9,
    };
    const layer: CrispEvidenceLayer = { evidenceByCell: new Map([[1, evidence]]) }; // center cell
    const initial = new Uint8Array([0, 1, 0]); // center starts on label 1 (white)

    const result = runLocalOptimizer(cells, initial, palette, undefined, DEFAULT_LOCAL_OPTIMIZER_WEIGHTS, undefined, layer);
    // With genuinely tied unary cost and symmetric neighbors, the center
    // cell must KEEP its current label (1), not fall back to label 0
    // (which a naive "first candidate in iteration order" rule would pick
    // instead, since 0 < 1).
    expect(result[1]).toBe(1);
  });
});

describe("M4.4 composition: crisp-aware coarse+fine ICM on M1's genuine-gray-elsewhere fixture", () => {
  it("keeps confident black/white cells admissible through both optimization passes", () => {
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    const gridSize = 16;
    const cells = downsampleToGrid(buffer, gridSize, gridSize);
    const importance = new Float32Array(gridSize * gridSize);

    const evidenceLayer = buildCrispEvidenceLayer(buffer, gridSize, gridSize, allCellIndices(gridSize, gridSize));
    const quantizerFn = selectWeightedQuantizer(kMeansQuantizer);
    const quantized = runCrispQuantizationStage(cells, 4, importance, evidenceLayer, quantizerFn);

    const optimized = runMultiScaleOptimizer(cells, quantized.cellPaletteIndex, quantized.palette, importance, undefined, undefined, evidenceLayer);

    const paletteOklab = quantized.palette.map(rgbToOklab);
    const genuineGrayOklab = rgbToOklab([128, 128, 128]);
    const grayLabel = paletteOklab.findIndex((c) => oklabDistanceSquared(c, genuineGrayOklab) < 0.01);

    for (const [cellIndex] of evidenceLayer.evidenceByCell) {
      const cx = cellIndex % gridSize;
      if (cx < 5 || cx > 10) continue; // only the black/white split's own cells
      expect(optimized[cellIndex]).not.toBe(grayLabel);
    }
  });
});
