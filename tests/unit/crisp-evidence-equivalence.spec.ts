import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARY_EVIDENCE_OPTIONS, extractBoundaryEvidence, SourceOklabRows, type BoundaryEvidenceOptions } from "@/lib/crisp/crisp-edge-evidence";
import { allCellIndices, buildCrispEvidenceLayer, DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS } from "@/lib/crisp/crisp-evidence-layer";
import { mulberry32 } from "@/lib/prng";
import type { PixelBuffer } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer } from "./helpers/fixtures";
import { extractBoundaryEvidence as extractBoundaryEvidencePreM4 } from "./reference/crisp-edge-evidence-pre-m4";

/**
 * G-035 M4 equivalence gate: Crisp's boundary evidence, rewritten to typed arrays with a shared per-row OKLab cache,
 * must equal the pre-M4 code exactly (toStrictEqual compares numbers with Object.is), for every cell, on sources that
 * exercise fractional scaling, grids larger than the source, partial and zero alpha, option extremes, and a cell order
 * that forces cached rows to be evicted and recomputed. The golden hashes cover the whole pipeline end to end.
 */

function withAlpha(buffer: PixelBuffer, alphaAt: (x: number, y: number) => number): PixelBuffer {
  const data = new Uint8ClampedArray(buffer.data);
  for (let y = 0; y < buffer.height; y++) for (let x = 0; x < buffer.width; x++) data[(y * buffer.width + x) * 4 + 3] = alphaAt(x, y);
  return { data, width: buffer.width, height: buffer.height };
}

const photo = makePhotoLikeBuffer(240, 160);
const SOURCES: Array<{ name: string; source: PixelBuffer; grid: [number, number] }> = [
  { name: "photo-like, 6 px per cell", source: photo, grid: [40, 27] },
  { name: "photo-like, fractional scale", source: makePhotoLikeBuffer(97, 61), grid: [23, 17] },
  { name: "hard split with a diagonal", source: makeBuffer(64, 48, (x, y) => (x + 0.6 * y < 40 ? [20, 30, 200] : [240, 220, 40])), grid: [16, 12] },
  { name: "grid larger than the source", source: makePhotoLikeBuffer(30, 20), grid: [50, 33] },
  { name: "partial and zero alpha", source: withAlpha(photo, (x, y) => (x < 40 ? 0 : x < 80 ? (x * 7 + y * 3) % 256 : 255)), grid: [40, 27] },
];

const OPTION_SETS: Array<[string, BoundaryEvidenceOptions]> = [
  ["default", DEFAULT_BOUNDARY_EVIDENCE_OPTIONS],
  ["no margin, one Lloyd iteration", { neighborhoodMargin: 0, minModeSeparation: 0.02, maxLloydIterations: 1 }],
  ["wide margin, any separation, many iterations", { neighborhoodMargin: 1.5, minModeSeparation: 0, maxLloydIterations: 20 }],
];

function shuffled(values: number[], seed: number): number[] {
  const rng = mulberry32(seed);
  const out = values.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("Crisp boundary evidence equals the pre-M4 code exactly", () => {
  for (const { name, source, grid } of SOURCES) {
    for (const [optionsName, options] of OPTION_SETS) {
      it(`${name}, ${optionsName}: every cell, row order and shuffled order`, () => {
        const [gridWidth, gridHeight] = grid;
        const cells = allCellIndices(gridWidth, gridHeight);
        for (const order of [cells, shuffled(cells, 7)]) {
          const rows = new SourceOklabRows(source);
          for (const cell of order) {
            const cx = cell % gridWidth;
            const cy = (cell - cx) / gridWidth;
            const expected = extractBoundaryEvidencePreM4(source, gridWidth, gridHeight, cx, cy, options);
            expect(extractBoundaryEvidence(source, gridWidth, gridHeight, cx, cy, options, rows)).toStrictEqual(expected);
          }
        }
      });
    }
  }

  it("a whole evidence layer matches one built from the pre-M4 evidence", () => {
    const [gridWidth, gridHeight] = [40, 27];
    const layer = buildCrispEvidenceLayer(photo, gridWidth, gridHeight, allCellIndices(gridWidth, gridHeight), { ...DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS, requireNeighborAgreement: false });
    const expected = new Map();
    for (const cell of allCellIndices(gridWidth, gridHeight)) {
      const cx = cell % gridWidth;
      const evidence = extractBoundaryEvidencePreM4(photo, gridWidth, gridHeight, cx, (cell - cx) / gridWidth, DEFAULT_BOUNDARY_EVIDENCE_OPTIONS);
      if (evidence.confidence >= DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS.confidenceThreshold) expected.set(cell, evidence);
    }
    expect(expected.size).toBeGreaterThan(0);
    expect(layer.evidenceByCell).toStrictEqual(expected);
  });

  it("rejects a row cache built for a different photo", () => {
    expect(() => extractBoundaryEvidence(photo, 40, 27, 0, 0, DEFAULT_BOUNDARY_EVIDENCE_OPTIONS, new SourceOklabRows(makePhotoLikeBuffer(240, 160)))).toThrow();
  });
});
