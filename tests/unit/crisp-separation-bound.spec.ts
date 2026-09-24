import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOUNDARY_EVIDENCE_OPTIONS,
  extractBoundaryEvidence,
  SourceOklabRows,
  type BoundaryEvidenceOptions,
} from "@/lib/crisp/crisp-edge-evidence";
import {
  allCellIndices,
  buildCrispEvidenceLayer,
  CRISP_PLUS_EVIDENCE_LAYER_OPTIONS,
  DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS,
} from "@/lib/crisp/crisp-evidence-layer";
import type { PixelBuffer } from "@/lib/types";
import { makeHardSplitWithGenuineGrayBuffer } from "./crisp-edges-fixtures";
import { makeBuffer, makePhotoLikeBuffer } from "./helpers/fixtures";
import {
  extractBoundaryEvidence as extractBoundaryEvidencePreG047,
  SourceOklabRows as SourceOklabRowsPreG047,
} from "./reference/crisp-edge-evidence-pre-g047";

/**
 * G-047 M4 (D175): a cell whose samples' OKLab bounding box is too small to hold two modes `minModeSeparation` apart
 * skips the two-mode fit. The skip must change nothing, so every cell is compared with toStrictEqual against the frozen
 * pre-M4 code: both edge models, several separation thresholds including 0, noisy and flat and hard-edged sources,
 * fractional scaling and partial alpha.
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
  { name: "low-noise photo-like", source: makePhotoLikeBuffer(180, 120, 4), grid: [60, 40] },
  { name: "hard split with a genuine grey", source: makeHardSplitWithGenuineGrayBuffer(), grid: [16, 16] },
  {
    name: "soft ramp just under and over the threshold",
    source: makeBuffer(120, 40, (x) => [100 + Math.floor(x / 3), 100, 100 + Math.floor(x / 5)]),
    grid: [40, 13],
  },
  { name: "flat colour", source: makeBuffer(60, 40, () => [120, 130, 140]), grid: [20, 13] },
  {
    name: "partial and zero alpha",
    source: withAlpha(photo, (x, y) => (x < 40 ? 0 : x < 80 ? (x * 7 + y * 3) % 256 : 255)),
    grid: [40, 27],
  },
];

const OPTION_SETS: Array<[string, BoundaryEvidenceOptions]> = [
  ["Crisp", DEFAULT_BOUNDARY_EVIDENCE_OPTIONS],
  ["Crisp+ blurred step", CRISP_PLUS_EVIDENCE_LAYER_OPTIONS.boundaryEvidenceOptions],
  ["separation 0 (never skips)", { ...DEFAULT_BOUNDARY_EVIDENCE_OPTIONS, minModeSeparation: 0 }],
  ["separation 0.001", { ...DEFAULT_BOUNDARY_EVIDENCE_OPTIONS, minModeSeparation: 0.001 }],
  ["separation 0.2, blurred step", { ...CRISP_PLUS_EVIDENCE_LAYER_OPTIONS.boundaryEvidenceOptions, minModeSeparation: 0.2 }],
];

describe("the separation bound changes no boundary evidence", () => {
  for (const { name, source, grid } of SOURCES) {
    it(`${name}: every cell, every option set`, () => {
      const [gridWidth, gridHeight] = grid;
      for (const [optionsName, options] of OPTION_SETS) {
        const rows = new SourceOklabRows(source);
        const referenceRows = new SourceOklabRowsPreG047(source);
        for (let cy = 0; cy < gridHeight; cy++) {
          for (let cx = 0; cx < gridWidth; cx++) {
            const expected = extractBoundaryEvidencePreG047(source, gridWidth, gridHeight, cx, cy, options, referenceRows);
            expect(
              extractBoundaryEvidence(source, gridWidth, gridHeight, cx, cy, options, rows),
              `${optionsName}, cell ${cx},${cy}`
            ).toStrictEqual(expected);
          }
        }
      }
    });
  }

  it("keeps the same confident cells in both evidence layers on a real-sized photo", () => {
    const big = makePhotoLikeBuffer(600, 400);
    for (const layerOptions of [DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS, CRISP_PLUS_EVIDENCE_LAYER_OPTIONS]) {
      const layer = buildCrispEvidenceLayer(big, 400, 267, allCellIndices(400, 267), layerOptions);
      const referenceRows = new SourceOklabRowsPreG047(big);
      const expected = new Map<number, unknown>();
      for (let cell = 0; cell < 400 * 267; cell++) {
        const cx = cell % 400;
        const evidence = extractBoundaryEvidencePreG047(
          big,
          400,
          267,
          cx,
          (cell - cx) / 400,
          layerOptions.boundaryEvidenceOptions,
          referenceRows
        );
        if (evidence.confidence >= layerOptions.confidenceThreshold) expected.set(cell, evidence);
      }
      // The layer keeps confident cells with a confident neighbour, so it is a subset of `expected`; every kept cell must
      // carry the frozen code's evidence exactly.
      for (const [cell, evidence] of layer.evidenceByCell) expect(evidence, `cell ${cell}`).toStrictEqual(expected.get(cell));
      expect(layer.evidenceByCell.size, "confident cells").toBeGreaterThan(0);
    }
  }, 120_000);
});
