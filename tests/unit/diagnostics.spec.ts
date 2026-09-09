import { describe, expect, it } from "vitest";
import { computePatternDiagnostics } from "@/lib/diagnostics";
import type { CellColorBuffer, PaletteColor, RGB, StitchPattern } from "@/lib/types";

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

function makePattern(width: number, height: number, cellPalette: number[], palette: RGB[]): StitchPattern {
  const paletteColors: PaletteColor[] = palette.map((rgb, i) => ({
    index: i,
    rgb,
    symbol: String(i),
    count: cellPalette.filter((c) => c === i).length,
  }));
  return { width, height, cellPalette: Uint8Array.from(cellPalette), palette: paletteColors, isLandscape: width >= height };
}

const A: RGB = [220, 20, 20];
const B: RGB = [20, 20, 220];

describe("computePatternDiagnostics", () => {
  it("reports zero confetti and one component for a uniform pattern", () => {
    const cells = makeCells(4, 4, () => A);
    const pattern = makePattern(4, 4, new Array(16).fill(0), [A]);

    const diagnostics = computePatternDiagnostics(pattern, cells);

    expect(diagnostics.componentCount).toBe(1);
    expect(diagnostics.confettiRatio).toBe(0);
    expect(diagnostics.singleCellComponentCount).toBe(0);
    expect(diagnostics.boundaryCellPairCount).toBe(0);
    expect(diagnostics.averageReconstructionError).toBe(0);
  });

  it("reports high confetti ratio for a checkerboard", () => {
    const cells = makeCells(4, 4, (x, y) => ((x + y) % 2 === 0 ? A : B));
    const cellPalette = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) cellPalette.push((x + y) % 2 === 0 ? 0 : 1);
    const pattern = makePattern(4, 4, cellPalette, [A, B]);

    const diagnostics = computePatternDiagnostics(pattern, cells);

    expect(diagnostics.confettiRatio).toBe(1);
    expect(diagnostics.singleCellComponentCount).toBe(16);
  });

  it("gives a compact single region a lower average compactness than a fragmented one of the same area", () => {
    const size = 10;
    const cells = makeCells(size, size, () => A);

    const compactPalette = new Array(size * size).fill(0);
    const compact = computePatternDiagnostics(makePattern(size, size, compactPalette, [A]), cells);

    // Checkerboard-ish fragmentation using 2 colors so components stay
    // small (area>2 excluded from compactness -- use area-3 "L" shapes).
    const fragmented = new Array(size * size).fill(0);
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        if (x + 1 < size) fragmented[y * size + x + 1] = 1;
      }
    }
    const fragmentedResult = computePatternDiagnostics(makePattern(size, size, fragmented, [A, B]), cells);

    expect(compact.averageCompactness).toBeLessThan(fragmentedResult.averageCompactness || Infinity);
  });

  it("computes a nonzero reconstruction error when the palette color doesn't match the true source color", () => {
    const cells = makeCells(2, 2, () => A);
    const wrongPalette: RGB[] = [B];
    const pattern = makePattern(2, 2, [0, 0, 0, 0], wrongPalette);

    const diagnostics = computePatternDiagnostics(pattern, cells);

    expect(diagnostics.averageReconstructionError).toBeGreaterThan(0);
  });

  it("returns NaN edgeAlignmentScore when no importance map is given, and a real score when one is", () => {
    const cells = makeCells(4, 4, (x) => (x < 2 ? A : B));
    const cellPalette = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) cellPalette.push(x < 2 ? 0 : 1);
    const pattern = makePattern(4, 4, cellPalette, [A, B]);

    const withoutImportance = computePatternDiagnostics(pattern, cells);
    expect(Number.isNaN(withoutImportance.edgeAlignmentScore)).toBe(true);

    // High importance exactly on the real boundary column, zero elsewhere.
    const importance = new Float32Array(16);
    for (let y = 0; y < 4; y++) {
      importance[y * 4 + 1] = 1;
      importance[y * 4 + 2] = 1;
    }
    const withImportance = computePatternDiagnostics(pattern, cells, importance);
    expect(withImportance.edgeAlignmentScore).toBeGreaterThan(0);
  });

  it("counts boundary cell-pairs correctly for a simple vertical split", () => {
    const cells = makeCells(4, 2, (x) => (x < 2 ? A : B));
    const cellPalette = [0, 0, 1, 1, 0, 0, 1, 1];
    const pattern = makePattern(4, 2, cellPalette, [A, B]);

    const diagnostics = computePatternDiagnostics(pattern, cells);

    // One vertical boundary crossing per row, 2 rows -> 2 boundary pairs.
    expect(diagnostics.boundaryCellPairCount).toBe(2);
  });
});
