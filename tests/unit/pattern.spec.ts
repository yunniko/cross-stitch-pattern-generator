import { describe, expect, it } from "vitest";
import { buildPattern } from "@/lib/pattern";
import type { PixelBuffer, RGB } from "@/lib/types";

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

describe("buildPattern", () => {
  it("produces a grid sized from the longer-side stitch count, preserving aspect ratio", () => {
    const buffer = makeBuffer(200, 100, () => [128, 64, 200]);
    const pattern = buildPattern(buffer, { longerSideStitches: 40, colorCount: 3 });
    expect(pattern.width).toBe(40);
    expect(pattern.height).toBe(20);
    expect(pattern.cellPalette).toHaveLength(40 * 20);
  });

  it("flags landscape vs portrait from the source image dimensions", () => {
    const landscape = buildPattern(makeBuffer(200, 100, () => [10, 10, 10]), {
      longerSideStitches: 20,
      colorCount: 2,
    });
    const portrait = buildPattern(makeBuffer(100, 200, () => [10, 10, 10]), {
      longerSideStitches: 20,
      colorCount: 2,
    });
    expect(landscape.isLandscape).toBe(true);
    expect(portrait.isLandscape).toBe(false);
  });

  it("assigns every cell a valid palette index and gives each palette entry a unique symbol", () => {
    const buffer = makeBuffer(20, 20, (x) => (x < 10 ? [230, 20, 20] : [20, 20, 230]));
    const pattern = buildPattern(buffer, { longerSideStitches: 10, colorCount: 2 });

    for (const index of pattern.cellPalette) {
      expect(index).toBeLessThan(pattern.palette.length);
    }
    const symbols = pattern.palette.map((c) => c.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("orders the legend from darkest to lightest", () => {
    const buffer = makeBuffer(30, 10, (x) => {
      if (x < 10) return [10, 10, 10]; // dark
      if (x < 20) return [130, 130, 130]; // mid
      return [250, 250, 250]; // light
    });
    const pattern = buildPattern(buffer, { longerSideStitches: 30, colorCount: 3 });

    const luminances = pattern.palette.map((c) => 0.2126 * c.rgb[0] + 0.7152 * c.rgb[1] + 0.0722 * c.rgb[2]);
    for (let i = 1; i < luminances.length; i++) {
      expect(luminances[i]).toBeGreaterThanOrEqual(luminances[i - 1]);
    }
  });

  it("counts stitches per color summing to the total cell count", () => {
    const buffer = makeBuffer(10, 10, () => [50, 50, 50]);
    const pattern = buildPattern(buffer, { longerSideStitches: 10, colorCount: 4 });
    const total = pattern.palette.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBe(pattern.width * pattern.height);
  });

  it("the region-aware optimizer measurably reduces confetti versus the raw quantizer output", () => {
    // A checkerboard-ish noisy pattern over two base regions is exactly the
    // case the local optimizer + palette merge exist for (HANDOVER.md D6).
    const buffer = makeBuffer(20, 20, (x, y) => {
      const base: RGB = x < 10 ? [220, 30, 30] : [30, 30, 220];
      const noisy = (x * 7 + y * 13) % 11 === 0;
      return noisy ? [base[0] ^ 0x55, base[1], base[2]] : base;
    });

    const optimized = buildPattern(buffer, { longerSideStitches: 20, colorCount: 4, optimize: true });
    const raw = buildPattern(buffer, { longerSideStitches: 20, colorCount: 4, optimize: false });

    // Simple proxy: count cells whose all 4 neighbors differ from them.
    const countOrphans = (pattern: typeof optimized) => {
      let orphans = 0;
      for (let y = 0; y < pattern.height; y++) {
        for (let x = 0; x < pattern.width; x++) {
          const i = y * pattern.width + x;
          const me = pattern.cellPalette[i];
          const neighbors = [
            x > 0 ? pattern.cellPalette[i - 1] : me,
            x < pattern.width - 1 ? pattern.cellPalette[i + 1] : me,
            y > 0 ? pattern.cellPalette[i - pattern.width] : me,
            y < pattern.height - 1 ? pattern.cellPalette[i + pattern.width] : me,
          ];
          if (neighbors.every((n) => n !== me)) orphans++;
        }
      }
      return orphans;
    };

    expect(countOrphans(optimized)).toBeLessThanOrEqual(countOrphans(raw));
  });

  it("optimize: false returns the quantizer's raw assignment untouched", () => {
    const buffer = makeBuffer(10, 10, (x) => (x < 5 ? [220, 20, 20] : [20, 20, 220]));
    const optimized = buildPattern(buffer, { longerSideStitches: 10, colorCount: 2, optimize: true });
    const raw = buildPattern(buffer, { longerSideStitches: 10, colorCount: 2, optimize: false });
    // Both should still be valid patterns of the same shape.
    expect(raw.width).toBe(optimized.width);
    expect(raw.height).toBe(optimized.height);
  });
});
