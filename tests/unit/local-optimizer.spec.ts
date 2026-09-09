import { describe, expect, it } from "vitest";
import { runLocalOptimizer } from "@/lib/local-optimizer";
import type { CellColorBuffer, RGB } from "@/lib/types";

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

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const palette = [BLACK, WHITE]; // index 0 = black, index 1 = white

describe("runLocalOptimizer", () => {
  it("the Owner's own spec case: a lone off-color cell in a uniform field is absorbed into its surroundings", () => {
    // AAA      AAA
    // ABA  ->  AAA
    // AAA      AAA
    const width = 3;
    const height = 3;
    // Source really is uniform white -- the center cell's "B" assignment
    // below is a bad initial quantizer guess, not reflected in the source.
    const cells = makeCells(width, height, () => WHITE);
    const initial = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1]); // center = black (0), rest white (1)

    const optimized = runLocalOptimizer(cells, initial, palette);

    expect(Array.from(optimized)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("does not disturb a stable straight boundary between two large true regions", () => {
    // Left half of a 6x4 grid is genuinely black, right half genuinely white.
    const width = 6;
    const height = 4;
    const cells = makeCells(width, height, (x) => (x < 3 ? BLACK : WHITE));
    const initial = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) initial[y * width + x] = x < 3 ? 0 : 1;
    }

    const optimized = runLocalOptimizer(cells, initial, palette);

    expect(Array.from(optimized)).toEqual(Array.from(initial));
  });

  it("converges (terminates) rather than oscillating forever on a real input", () => {
    const width = 10;
    const height = 10;
    const cells = makeCells(width, height, (x, y) => ((x + y) % 2 === 0 ? BLACK : WHITE));
    const initial = new Uint8Array(width * height);
    for (let i = 0; i < initial.length; i++) initial[i] = i % 2;

    // Should return without throwing/hanging (MAX_PASSES bounds it either way).
    expect(() => runLocalOptimizer(cells, initial, palette)).not.toThrow();
  });

  it("reduces confetti on a noisy quantizer assignment without changing a uniform source's true color", () => {
    // Source is uniform mid-gray; a few cells were mis-assigned to black or
    // white by chance. All neighbors agreeing on gray should pull outliers
    // back toward the majority, since gray is closest to the source color.
    const width = 5;
    const height = 5;
    const gray: RGB = [128, 128, 128];
    const cells = makeCells(width, height, () => gray);
    const paletteWithGray = [BLACK, gray, WHITE];
    const initial = new Uint8Array(width * height).fill(1); // all gray (index 1)
    initial[12] = 0; // center cell mis-assigned to black

    const optimized = runLocalOptimizer(cells, initial, paletteWithGray);

    expect(optimized[12]).toBe(1);
  });
});
