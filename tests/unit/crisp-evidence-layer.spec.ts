import { describe, expect, it } from "vitest";
import {
  buildCrispEvidenceLayer,
  allCellIndices,
  candidateCellsFromPairEvidence,
  selectWeightedQuantizer,
  DEFAULT_PAIR_EVIDENCE_PREFILTER_THRESHOLD,
} from "@/lib/crisp-evidence-layer";
import { computePairEdgeEvidence } from "@/lib/pair-edge-evidence";
import { plainKMeansQuantizer, kMeansQuantizer } from "@/lib/quantize";
import { rgbToOklab } from "@/lib/color";
import { makeHardSplitBuffer, makeHardSplitWithGenuineGrayBuffer } from "./crisp-edges-fixtures";
import type { WeightedColorSample } from "@/lib/weighted-quantize";
import type { PixelBuffer, RGB } from "@/lib/types";

/**
 * G-024 M4.2 (HANDOVER.md D65): the per-image evidence layer, its pair-
 * edge-evidence pre-filter, neighbor-agreement filtering, and the
 * Standard-quantizer-choice-preserving contract. Not wired into
 * `buildPattern` yet.
 */

function makeBuffer(width: number, height: number, colorAt: (x: number, y: number) => RGB): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

describe("buildCrispEvidenceLayer", () => {
  it("finds confident cells at a real black/white split, evaluating all cells", () => {
    const buffer = makeHardSplitBuffer(64, 64, 30);
    const layer = buildCrispEvidenceLayer(buffer, 16, 16, allCellIndices(16, 16));
    expect(layer.evidenceByCell.size).toBeGreaterThan(0);
    for (const evidence of layer.evidenceByCell.values()) {
      expect(evidence.confidence).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("finds no confident cells in a uniform flat image", () => {
    const buffer = makeBuffer(64, 64, () => [128, 128, 128]);
    const layer = buildCrispEvidenceLayer(buffer, 16, 16, allCellIndices(16, 16));
    expect(layer.evidenceByCell.size).toBe(0);
  });
});

describe("neighbor-agreement filtering", () => {
  it("keeps a real multi-cell boundary (every confident cell has an agreeing neighbor)", () => {
    const buffer = makeHardSplitBuffer(64, 64, 30);
    const withAgreement = buildCrispEvidenceLayer(buffer, 16, 16, allCellIndices(16, 16), {
      confidenceThreshold: 0.7,
      boundaryEvidenceOptions: { neighborhoodMargin: 0.75, minModeSeparation: 0.02, maxLloydIterations: 6 },
      requireNeighborAgreement: true,
    });
    const withoutAgreement = buildCrispEvidenceLayer(buffer, 16, 16, allCellIndices(16, 16), {
      confidenceThreshold: 0.7,
      boundaryEvidenceOptions: { neighborhoodMargin: 0.75, minModeSeparation: 0.02, maxLloydIterations: 6 },
      requireNeighborAgreement: false,
    });
    // A real vertical boundary spans the full 16-cell height -- neighbor
    // agreement should cost it essentially nothing.
    expect(withAgreement.evidenceByCell.size).toBe(withoutAgreement.evidenceByCell.size);
  });

  it("filters out an isolated single confident cell with no confident neighbor", () => {
    // Construct a small grid where exactly ONE cell is a real, isolated
    // hard-edge column surrounded on all sides by flat, non-confident
    // cells -- a synthetic "isolated false positive" stand-in, verifying
    // the mechanism itself works, not claiming this exact geometry occurs
    // naturally. A SMALL neighborhoodMargin is deliberately used here (not
    // the production default of 0.75): with the default margin, this same
    // hand-crafted split's own influence legitimately bleeds into
    // NEIGHBORING cells' own expanded evaluation windows too (a real,
    // correct consequence of how the detector's neighborhood expansion
    // works, not a test bug) -- confirmed directly, this fixture is NOT
    // actually isolated at margin=0.75 (found while writing this test: the
    // "isolated" cell's neighbors also came back confident). A tight
    // margin keeps each cell's evaluation local to its own footprint, so
    // this test can cleanly isolate the neighbor-AGREEMENT mechanism
    // itself from the detector's own (deliberate, separate) neighborhood-
    // expansion behavior.
    const gridWidth = 5;
    const gridHeight = 5;
    const cellPx = 8;
    const width = gridWidth * cellPx;
    const height = gridHeight * cellPx;
    const isolatedCol = 2;
    const buffer = makeBuffer(width, height, (x, y) => {
      const cx = Math.floor(x / cellPx);
      const cy = Math.floor(y / cellPx);
      if (cy === 2 && cx === isolatedCol) {
        // This one cell alone contains a hard black/white split.
        return x % cellPx < cellPx / 2 ? [0, 0, 0] : [255, 255, 255];
      }
      return [128, 128, 128]; // flat gray everywhere else
    });

    // margin: 0 exactly (not merely small) -- collectWeightedSamples'
    // floor/ceil pixel-grid rounding means ANY nonzero margin still pulls
    // in at least one extra whole pixel beyond the cell's exact fractional
    // boundary (found while writing this test: margin=0.05 still leaked
    // one boundary pixel into each immediate neighbor's own window,
    // making 9 cells confident instead of the intended 1) -- since every
    // cell boundary here is already pixel-aligned (cellPx=8 evenly divides
    // the grid), margin=0 gives each cell's evaluation exactly its own
    // footprint, no rounding-driven bleed at all.
    const tightMarginOptions = { neighborhoodMargin: 0, minModeSeparation: 0.02, maxLloydIterations: 6 };
    const withAgreement = buildCrispEvidenceLayer(buffer, gridWidth, gridHeight, allCellIndices(gridWidth, gridHeight), {
      confidenceThreshold: 0.5,
      boundaryEvidenceOptions: tightMarginOptions,
      requireNeighborAgreement: true,
    });
    const withoutAgreement = buildCrispEvidenceLayer(buffer, gridWidth, gridHeight, allCellIndices(gridWidth, gridHeight), {
      confidenceThreshold: 0.5,
      boundaryEvidenceOptions: tightMarginOptions,
      requireNeighborAgreement: false,
    });

    expect(withoutAgreement.evidenceByCell.size).toBe(1); // sanity: exactly the isolated cell is confident on its own, nothing else
    expect(withAgreement.evidenceByCell.size).toBe(0); // filtered out -- no agreeing neighbor
  });
});

describe("candidateCellsFromPairEvidence pre-filter recall (must never miss a genuinely confident cell)", () => {
  it("every cell the full per-cell reference marks confident also appears in the pre-filtered candidate set", () => {
    // A real, non-trivial fixture: the M1 genuine-gray-elsewhere buffer,
    // which has TWO distinct real boundaries (black/white and white/gray).
    const buffer = makeHardSplitWithGenuineGrayBuffer();
    const gridWidth = 16;
    const gridHeight = 16;

    const fullReference = buildCrispEvidenceLayer(buffer, gridWidth, gridHeight, allCellIndices(gridWidth, gridHeight), {
      confidenceThreshold: 0.7,
      boundaryEvidenceOptions: { neighborhoodMargin: 0.75, minModeSeparation: 0.02, maxLloydIterations: 6 },
      requireNeighborAgreement: false, // isolate the PRE-FILTER's own recall, not neighbor-agreement's separate effect
    });
    expect(fullReference.evidenceByCell.size).toBeGreaterThan(0); // sanity

    const pairEvidence = computePairEdgeEvidence(buffer, gridWidth, gridHeight);
    const candidates = new Set(candidateCellsFromPairEvidence(pairEvidence, gridWidth, gridHeight, DEFAULT_PAIR_EVIDENCE_PREFILTER_THRESHOLD));

    for (const cellIndex of fullReference.evidenceByCell.keys()) {
      expect(candidates.has(cellIndex)).toBe(true);
    }
  });

  it("is permissive, not restrictive -- catches real edges without requiring an exact match to the detector's own confidence", () => {
    const buffer = makeHardSplitBuffer(64, 64, 30);
    const gridWidth = 16;
    const gridHeight = 16;
    const pairEvidence = computePairEdgeEvidence(buffer, gridWidth, gridHeight);
    const candidates = candidateCellsFromPairEvidence(pairEvidence, gridWidth, gridHeight, DEFAULT_PAIR_EVIDENCE_PREFILTER_THRESHOLD);
    // The known boundary column (source x=30, grid cx ~7) must be a candidate.
    expect(candidates).toContain(7 * gridWidth + 8); // row 8, column 7 (matches other tests' own convention)
  });
});

describe("selectWeightedQuantizer", () => {
  function oneSamplePerCell(colors: RGB[]): WeightedColorSample[] {
    return colors.map((rgb, i) => ({ oklab: rgbToOklab(rgb), weight: 1, cellIndex: i }));
  }

  it("plainKMeansQuantizer (Original) maps to weightedQuantize -- no merge/reinvest happens", () => {
    // A fixture with real near-duplicate redundancy: kMeansQuantizer
    // (Latest) would merge+reinvest here, plainKMeansQuantizer would not.
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
    const fn = selectWeightedQuantizer(plainKMeansQuantizer);
    const weighted = fn(oneSamplePerCell(colors), 5, () => 0);
    const standard = plainKMeansQuantizer.quantize(
      { data: new Uint8ClampedArray(colors.flatMap(([r, g, b]) => [r, g, b])), width: colors.length, height: 1 },
      5
    );
    expect(weighted.palette).toEqual(standard.palette);
  });

  it("kMeansQuantizer (Latest) maps to weightedKMeansQuantize -- merge/reinvest happens", () => {
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
    const fn = selectWeightedQuantizer(kMeansQuantizer);
    const weighted = fn(oneSamplePerCell(colors), 5, () => 0);
    const standard = kMeansQuantizer.quantize(
      { data: new Uint8ClampedArray(colors.flatMap(([r, g, b]) => [r, g, b])), width: colors.length, height: 1 },
      5
    );
    expect(weighted.palette).toEqual(standard.palette);
  });

  it("throws a clear, explicit error for a custom ColorQuantizer, rather than silently ignoring Crisp mode", () => {
    const customQuantizer = { quantize: () => ({ cellPaletteIndex: new Uint8Array(0), palette: [] }) };
    expect(() => selectWeightedQuantizer(customQuantizer)).toThrow(/does not support a custom ColorQuantizer/);
  });
});
