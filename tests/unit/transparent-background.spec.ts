import { describe, expect, it } from "vitest";
import { buildPattern, type EdgeMode } from "@/lib/pipeline/pattern";
import { downsampleToGridWithCoverage, emptyCellMask, MIN_CELL_COVERAGE } from "@/lib/pipeline/downsample";
import { computeCellImportance, computeEdgeMagnitude, opaquePixelMask, sourceLuminance } from "@/lib/pipeline/edge-map";
import { computePairEdgeEvidence } from "@/lib/pipeline/pair-edge-evidence";
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

describe("structure is read from the photo that is there", () => {
  /** The same subject twice: once centred on a transparent field, once cropped to its own bounds. */
  function subject(size: number, pad: number) {
    const inner = size - 2 * pad;
    const colourAt = (x: number): RGB => (x < inner / 2 ? [210, 70, 60] : [40, 90, 190]);
    const onTransparency: PixelBuffer = { data: new Uint8ClampedArray(size * size * 4), width: size, height: size };
    const cropped: PixelBuffer = { data: new Uint8ClampedArray(inner * inner * 4), width: inner, height: inner };
    for (let y = 0; y < inner; y++) {
      for (let x = 0; x < inner; x++) {
        const [r, g, b] = colourAt(x);
        const outer = ((y + pad) * size + x + pad) * 4;
        onTransparency.data[outer] = r;
        onTransparency.data[outer + 1] = g;
        onTransparency.data[outer + 2] = b;
        onTransparency.data[outer + 3] = 255;
        const i = (y * inner + x) * 4;
        cropped.data[i] = r;
        cropped.data[i + 1] = g;
        cropped.data[i + 2] = b;
        cropped.data[i + 3] = 255;
      }
    }
    return { onTransparency, cropped, inner };
  }

  it("finds no edge where the photo merely stops", () => {
    const { onTransparency } = subject(64, 16);
    const opaque = opaquePixelMask(onTransparency)!;
    const gray = sourceLuminance(onTransparency);
    const masked = computeEdgeMagnitude(onTransparency, gray, opaque);
    const unmasked = computeEdgeMagnitude(onTransparency, gray);
    const at = (x: number, y: number, m: Float32Array) => m[y * 64 + x];
    // Column 16 is where the photo starts; column 32 is the subject own red-to-blue boundary.
    expect(at(16, 32, unmasked), "reading transparency as a colour invents an edge where the photo stops").toBeGreaterThan(0);
    expect(at(16, 32, masked), "with the mask, none").toBe(0);
    expect(at(32, 32, masked), "the real boundary inside the subject is still found").toBeGreaterThan(0);
  });

  it("gives the subject the same importance whether or not it sits on transparency", () => {
    const { onTransparency, cropped, inner } = subject(64, 16);
    const grid = 8;
    const croppedImportance = computeCellImportance(cropped, computeEdgeMagnitude(cropped, sourceLuminance(cropped)), grid, grid, sourceLuminance(cropped));
    const opaque = opaquePixelMask(onTransparency)!;
    const paddedGrid = (64 / inner) * grid;
    const padded = computeCellImportance(
      onTransparency,
      computeEdgeMagnitude(onTransparency, sourceLuminance(onTransparency), opaque),
      paddedGrid,
      paddedGrid,
      sourceLuminance(onTransparency),
      opaque
    );
    // The subject fills the middle of the padded grid. Its border cells legitimately differ (one side has no
    // neighbour), so the comparison is over the cells strictly inside it.
    let compared = 0;
    for (let y = 1; y < grid - 1; y++) {
      for (let x = 1; x < grid - 1; x++) {
        expect(padded[(y + grid / 2) * paddedGrid + x + grid / 2], `cell ${x},${y}`).toBeCloseTo(croppedImportance[y * grid + x], 5);
        compared++;
      }
    }
    expect(compared).toBe(36);
  });

  it("keeps pair evidence out of the transparent field", () => {
    const { onTransparency } = subject(64, 16);
    const opaque = opaquePixelMask(onTransparency)!;
    const grid = 16;
    const masked = computePairEdgeEvidence(onTransparency, grid, grid, undefined, undefined, opaque);
    const unmasked = computePairEdgeEvidence(onTransparency, grid, grid);
    // The pair that straddles where the photo starts: cell 3 to cell 4 on the middle row (4 cells of padding).
    const row = Math.floor(grid / 2);
    const east = (cell: number, m: Float32Array) => m[cell * 4];
    const atBoundary = row * grid + 3;
    expect(east(atBoundary, unmasked), "transparency read as colour makes evidence where the photo stops").toBeGreaterThan(0.5);
    expect(east(atBoundary, masked), "with the mask it is quiet").toBeLessThan(0.5);
  });
});

