import { describe, expect, it } from "vitest";
import { confettiRatio, floodFillDiagonal, labelRegions } from "@/lib/regions";

describe("labelRegions", () => {
  it("gives every cell in a uniform grid the same label", () => {
    const cellPalette = new Uint8Array(9).fill(0);
    const { labels, components } = labelRegions(cellPalette, 3, 3);
    expect(new Set(labels)).toEqual(new Set([labels[0]]));
    expect(components).toHaveLength(1);
    expect(components[0].area).toBe(9);
  });

  it("treats diagonal-only touching as two separate components, not one", () => {
    // A B
    // B A
    const cellPalette = Uint8Array.from([0, 1, 1, 0]);
    const { components } = labelRegions(cellPalette, 2, 2);
    // Two color-0 cells (diagonal) and two color-1 cells (diagonal) -> 4 separate components.
    expect(components).toHaveLength(4);
    expect(components.every((c) => c.area === 1)).toBe(true);
  });

  it("merges orthogonally adjacent same-color cells into one component", () => {
    // A A B
    // A A B
    const cellPalette = Uint8Array.from([0, 0, 1, 0, 0, 1]);
    const { components } = labelRegions(cellPalette, 3, 2);
    expect(components).toHaveLength(2);
    const areas = components.map((c) => c.area).sort((a, b) => a - b);
    expect(areas).toEqual([2, 4]);
  });

  it("computes a correct bounding box per component", () => {
    const cellPalette = Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    const { components } = labelRegions(cellPalette, 3, 3);
    const orphan = components.find((c) => c.area === 1)!;
    expect(orphan.minX).toBe(1);
    expect(orphan.maxX).toBe(1);
    expect(orphan.minY).toBe(1);
    expect(orphan.maxY).toBe(1);
  });

  it("gives a single interior cell a perimeter of 4 (all 4 sides border a different color)", () => {
    const cellPalette = Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    const { components } = labelRegions(cellPalette, 3, 3);
    const orphan = components.find((c) => c.area === 1)!;
    expect(orphan.perimeter).toBe(4);
  });

  it("counts the grid boundary itself as part of the perimeter", () => {
    // A single color filling the whole 3x3 grid: every one of its 9 cells'
    // edges either touches another same-color cell (not perimeter) or the
    // grid boundary (is perimeter) -- total perimeter equals the shape's
    // outer edge count, 12 (a 3x3 square).
    const cellPalette = new Uint8Array(9).fill(0);
    const { components } = labelRegions(cellPalette, 3, 3);
    expect(components[0].perimeter).toBe(12);
  });

  it("gives a compact 2x2 block a smaller perimeter than 4 separate single cells of the same total area", () => {
    // A A       A B
    // A A  vs.  B A   (checkerboard: 4 separate 1-cell components)
    const compact = labelRegions(Uint8Array.from([0, 0, 0, 0]), 2, 2);
    const scattered = labelRegions(Uint8Array.from([0, 1, 1, 0]), 2, 2);
    expect(compact.components[0].perimeter).toBeLessThan(
      scattered.components.reduce((sum, c) => sum + c.perimeter, 0)
    );
  });
});

describe("confettiRatio", () => {
  it("is zero for a single uniform region", () => {
    const cellPalette = new Uint8Array(16).fill(0);
    const regions = labelRegions(cellPalette, 4, 4);
    expect(confettiRatio(regions)).toBe(0);
  });

  it("counts isolated single cells as confetti", () => {
    // Every cell alternates color -> every component has area 1.
    const cellPalette = Uint8Array.from([0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0]);
    const regions = labelRegions(cellPalette, 4, 4);
    expect(confettiRatio(regions, 1)).toBe(1);
  });
});

describe("floodFillDiagonal (G-018 Fill tool)", () => {
  it("merges diagonally-touching same-color cells, unlike labelRegions' 4-connectivity", () => {
    // A B
    // B A
    const cellPalette = Uint8Array.from([0, 1, 1, 0]);
    const filled = floodFillDiagonal(cellPalette, 2, 2, 0);
    expect(filled.sort()).toEqual([0, 3]);
  });

  it("still merges orthogonally-adjacent same-color cells", () => {
    const cellPalette = Uint8Array.from([0, 0, 1, 0, 0, 1]);
    const filled = floodFillDiagonal(cellPalette, 3, 2, 0);
    expect(filled.sort()).toEqual([0, 1, 3, 4]);
  });

  it("does not cross into a differently-colored cell", () => {
    const cellPalette = Uint8Array.from([0, 0, 1, 1]);
    const filled = floodFillDiagonal(cellPalette, 2, 2, 0);
    expect(filled.sort()).toEqual([0, 1]);
  });

  it("returns just the start cell when all 8 neighbors differ", () => {
    const cellPalette = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1]);
    const filled = floodFillDiagonal(cellPalette, 3, 3, 4);
    expect(filled).toEqual([4]);
  });

  it("treats EMPTY_CELL (255) as an ordinary fillable value, not special-cased", () => {
    const cellPalette = Uint8Array.from([255, 255, 1, 255]);
    const filled = floodFillDiagonal(cellPalette, 2, 2, 0);
    expect(filled.sort()).toEqual([0, 1, 3]);
  });
});
