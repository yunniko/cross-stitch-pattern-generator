import { describe, expect, it } from "vitest";
import { buildPattern, type EdgeMode } from "@/lib/pipeline/pattern";
import { downsampleToGridWithCoverage, emptyCellMask, MIN_CELL_COVERAGE } from "@/lib/pipeline/downsample";
import { EMPTY_CELL, type PixelBuffer, type RGB } from "@/lib/types";

/**
 * G-050: a photo with transparency charts its transparent parts as empty stitches, and takes neither colour nor
 * structure from pixels that are not there. The hard constraint is the other way round: a photo with no transparent
 * pixel must chart exactly as it did before, which the golden hashes (D107) pin.
 */

/** A disc of `colour` on a transparent field, plus an anti-aliased rim one pixel wide. */
function discOnTransparency(size: number, radius: number, colour: RGB): PixelBuffer {
  const data = new Uint8ClampedArray(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      const o = (y * size + x) * 4;
      data[o] = colour[0];
      data[o + 1] = colour[1];
      data[o + 2] = colour[2];
      data[o + 3] = d <= radius ? 255 : d <= radius + 1 ? 128 : 0;
    }
  }
  return { data, width: size, height: size };
}

const MODES: EdgeMode[] = ["standard", "crisp", "crisp-plus"];

describe("a transparent background becomes empty stitches", () => {
  it("marks a cell empty exactly when the photo covers less than half of it", () => {
    const half: PixelBuffer = { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 };
    // Left half opaque, right half transparent, on a 2x2 grid: each cell is exactly half covered.
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const o = (y * 4 + x) * 4;
        half.data[o] = 200;
        half.data[o + 3] = x < 2 ? 255 : 0;
      }
    }
    const { coverage } = downsampleToGridWithCoverage(half, 2, 2);
    expect(Array.from(coverage)).toEqual([1, 0, 1, 0]);
    expect(MIN_CELL_COVERAGE).toBe(0.5);
    // A cell exactly at the threshold is stitched, not dropped.
    const exactly: Float32Array = new Float32Array([0.5, 0.49, 1, 0]);
    expect(Array.from(emptyCellMask(exactly)!)).toEqual([0, 1, 0, 1]);
    expect(emptyCellMask(new Float32Array([1, 1, 1])), "no mask at all when every cell is covered").toBeNull();
  });

  for (const edgeMode of MODES) {
    it(`charts the disc and leaves the background empty (${edgeMode})`, () => {
      const source = discOnTransparency(120, 40, [200, 60, 60]);
      const pattern = buildPattern(source, { longerSideStitches: 40, colorCount: 8, edgeMode });

      const corner = pattern.cellPalette[0];
      expect(corner, `${edgeMode}: the corner is outside the disc`).toBe(EMPTY_CELL);
      const middle = pattern.cellPalette[Math.floor(pattern.height / 2) * pattern.width + Math.floor(pattern.width / 2)];
      expect(middle, `${edgeMode}: the middle is stitched`).not.toBe(EMPTY_CELL);

      let empty = 0;
      for (const index of pattern.cellPalette) if (index === EMPTY_CELL) empty++;
      // A disc of radius 40 in a 120-wide frame covers about π·40²/120² = 35% of it.
      expect(empty / pattern.cellPalette.length, `${edgeMode}: roughly the area outside the disc is empty`).toBeGreaterThan(0.5);
      expect(empty / pattern.cellPalette.length, `${edgeMode}: but not the whole chart`).toBeLessThan(0.75);

      // No colour may be drawn from pixels that are not there: the disc is one colour, so one colour is enough.
      for (const colour of pattern.palette) {
        expect(colour.rgb[0], `${edgeMode}: ${colour.name} came from the disc, not from transparent black`).toBeGreaterThan(120);
      }
      // Counts and the palette agree with the cells, empties excluded.
      const counts = new Array(pattern.palette.length).fill(0);
      for (const index of pattern.cellPalette) if (index !== EMPTY_CELL) counts[index]++;
      expect(pattern.palette.map((c) => c.count), `${edgeMode}: counts exclude empty stitches`).toEqual(counts);
      expect(counts.filter((n) => n === 0), `${edgeMode}: no colour left with nothing to stitch`).toEqual([]);
    });
  }

  it("keeps an opaque photo on its old path: no mask, no empty stitch", () => {
    const opaque = discOnTransparency(60, 60, [90, 140, 200]); // radius >= size, so every pixel is opaque
    const { coverage } = downsampleToGridWithCoverage(opaque, 20, 20);
    expect(emptyCellMask(coverage)).toBeNull();
    for (const edgeMode of MODES) {
      const pattern = buildPattern(opaque, { longerSideStitches: 20, colorCount: 6, edgeMode });
      expect(Array.from(pattern.cellPalette).some((v) => v === EMPTY_CELL), `${edgeMode}`).toBe(false);
    }
  });

  it("charts a fully transparent photo as a chart of nothing, without crashing", () => {
    const blank: PixelBuffer = { data: new Uint8ClampedArray(40 * 40 * 4), width: 40, height: 40 };
    for (const edgeMode of MODES) {
      const pattern = buildPattern(blank, { longerSideStitches: 20, colorCount: 6, edgeMode });
      expect(pattern.palette, `${edgeMode}: nothing to stitch, so no colours`).toEqual([]);
      expect(Array.from(pattern.cellPalette).every((v) => v === EMPTY_CELL), `${edgeMode}: every stitch empty`).toBe(true);
    }
  });
});
