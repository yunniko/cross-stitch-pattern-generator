import { describe, expect, it } from "vitest";
import { confettiRatio, labelRegions } from "@/lib/regions";

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
