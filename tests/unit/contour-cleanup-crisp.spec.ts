import { describe, expect, it } from "vitest";
import { fixDiagonalConnections, recolorSmallComponents, defaultComponentRecolorOptions } from "@/lib/contour-cleanup";
import { rgbToOklab } from "@/lib/color";
import type { BoundaryEvidence } from "@/lib/crisp-edge-evidence";
import type { CrispEvidenceLayer } from "@/lib/crisp-evidence-layer";
import type { CellColorBuffer, RGB } from "@/lib/types";

/**
 * G-024 M4.5 (HANDOVER.md D68): contour-cleanup integration
 * (`fixDiagonalConnections`, `recolorSmallComponents`). Not wired into
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

function makeEvidence(overrides: Partial<BoundaryEvidence> = {}): BoundaryEvidence {
  return {
    modes: [rgbToOklab([0, 0, 0]), rgbToOklab([255, 255, 255])],
    coverage: [0.5, 0.5],
    spread: [0, 0],
    spatialSeparation: 0.5,
    boundaryDirection: [1, 0],
    edgeSharpness: 1,
    confidence: 0.9,
    ...overrides,
  };
}

describe("fixDiagonalConnections: Standard-compatibility", () => {
  it("is byte-identical with an omitted vs. empty crispEvidenceLayer", () => {
    const nearA: RGB = [222, 22, 22];
    const A: RGB = [220, 20, 20];
    const closePalette = [A, nearA];
    const cells = makeCells(2, 2, (x, y) => (x === y ? A : nearA));
    const assignment = Uint8Array.from([0, 1, 1, 0]);
    const withoutLayer = fixDiagonalConnections(cells, assignment, closePalette);
    const withEmptyLayer = fixDiagonalConnections(cells, assignment, closePalette, undefined, undefined, undefined, { evidenceByCell: new Map() });
    expect(Array.from(withEmptyLayer)).toEqual(Array.from(withoutLayer));
  });
});

describe("fixDiagonalConnections: admissibility", () => {
  it("never proposes a recolor to an unsupported label for a protected cell, even when it would otherwise be the cheapest fix", () => {
    // A 2x2 pinch where the CHEAPEST fix (by raw color distance) would
    // recolor the protected cell to an unsupported label -- must be
    // rejected, forcing a different candidate (or none) instead.
    const black: RGB = [0, 0, 0];
    const white: RGB = [255, 255, 255];
    const gray: RGB = [130, 130, 130]; // very close to white in this palette, would normally be the cheap fix
    const palette = [black, white, gray];
    // tl=black(0), tr=white(1), bl=white(1), br=black(0) -- a diagonal-only pinch.
    const cells = makeCells(2, 2, (x, y) => {
      if (x === 0 && y === 0) return black;
      if (x === 1 && y === 0) return white;
      if (x === 0 && y === 1) return white;
      return gray; // br's TRUE source color is close to gray/white, biasing the naive cheapest-fix search toward an unsupported label
    });
    const assignment = Uint8Array.from([0, 1, 1, 0]); // black white / white black

    // Protect the br cell (index 3): its only admissible labels are black(0)/white(1), never gray(2).
    const evidence = makeEvidence();
    const layer: CrispEvidenceLayer = { evidenceByCell: new Map([[3, evidence]]) };

    const result = fixDiagonalConnections(cells, assignment, palette, undefined, undefined, undefined, layer);
    expect(result[3]).not.toBe(2); // br must never become the unsupported gray label
  });
});

describe("recolorSmallComponents: Standard-compatibility", () => {
  it("is byte-identical with an omitted vs. empty crispEvidenceLayer", () => {
    const A: RGB = [220, 20, 20];
    const B: RGB = [20, 20, 220];
    const palette = [A, B];
    const cells = makeCells(4, 4, (x) => (x < 2 ? A : B));
    const assignment = new Uint8Array(16);
    for (let i = 0; i < 16; i++) assignment[i] = i % 4 < 2 ? 0 : 1;
    assignment[5] = 1; // a lone off-color cell forming a small component

    const withoutLayer = recolorSmallComponents(cells, assignment, palette, undefined, defaultComponentRecolorOptions(16));
    const withEmptyLayer = recolorSmallComponents(cells, assignment, palette, undefined, defaultComponentRecolorOptions(16), undefined, {
      evidenceByCell: new Map(),
    });
    expect(Array.from(withEmptyLayer)).toEqual(Array.from(withoutLayer));
  });
});

describe("recolorSmallComponents: a candidate unsupported for ANY protected member is rejected for the WHOLE component", () => {
  it("never recolors a component to a label unsupported by one of its protected members", () => {
    // A small (2-cell) component surrounded by gray -- Standard behavior
    // would recolor it to gray (matching its neighbors, reducing boundary
    // energy). One member of the component is a confident black/white
    // cell whose admissible set never includes gray -- the whole
    // component's recolor-to-gray candidate must be rejected.
    const black: RGB = [0, 0, 0];
    const gray: RGB = [128, 128, 128];
    const palette = [black, gray];
    const width = 4;
    const height = 3;
    // Row 1 (y=1): gray gray gray gray, except cells (1,1) and (2,1) are black -- a small 2-cell black component surrounded by gray.
    const cells = makeCells(width, height, (x, y) => (y === 1 && (x === 1 || x === 2) ? black : gray));
    const assignment = new Uint8Array(width * height).fill(1); // everyone starts on gray(1)
    const memberA = 1 * width + 1; // (1,1)
    const memberB = 1 * width + 2; // (2,1)
    assignment[memberA] = 0;
    assignment[memberB] = 0;

    const evidence = makeEvidence(); // black/white only -- gray(1) is never admissible
    const layer: CrispEvidenceLayer = { evidenceByCell: new Map([[memberA, evidence]]) };

    const result = recolorSmallComponents(cells, assignment, palette, undefined, defaultComponentRecolorOptions(width * height), undefined, layer);
    expect(result[memberA]).not.toBe(1); // never gray
    expect(result[memberB]).not.toBe(1); // the WHOLE component is rejected together, not just the protected member
  });
});
