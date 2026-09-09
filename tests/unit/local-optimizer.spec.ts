import { describe, expect, it } from "vitest";
import { computeCellImportance, computeEdgeMagnitude } from "@/lib/edge-map";
import { downsampleToGrid } from "@/lib/downsample";
import { runLocalOptimizer, runMultiScaleOptimizer } from "@/lib/local-optimizer";
import type { CellColorBuffer, PixelBuffer, RGB } from "@/lib/types";

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

  it("without an importance map, a real (not noise) small high-contrast source detail still gets smoothed away", () => {
    // This documents Phase A's actual limitation (Owner's spec section 24)
    // -- unlike the earlier orphan test, the source genuinely contains this
    // detail; the point is that plain smoothing can't tell the difference.
    const detail = makeSourceWithDot();
    const cells = downsampleToGrid(detail.source, 5, 5);
    const initial = new Uint8Array(25).fill(0);
    initial[detail.centerCell] = 1;

    const optimized = runLocalOptimizer(cells, initial, detail.palette);

    expect(optimized[detail.centerCell]).toBe(0); // smoothed away to background
  });

  it("with a real importance map AND a nonzero edgeLoss weight, that same genuine detail survives", () => {
    // edgeLoss must be nonzero to test this meaningfully -- DEFAULT_LOCAL_OPTIMIZER_WEIGHTS'
    // edgeLoss:0 exists to reproduce Phase A exactly (see its own docstring)
    // and was never meant to represent real edge-aware behavior on its own;
    // the pipeline always runs the fine pass with edgeLoss:0.05 in practice
    // (DEFAULT_MULTI_SCALE_WEIGHTS.fine). At edge=0.7 here, that's enough to
    // clamp the mismatch penalty to zero entirely (weights.smoothness*(1-0.7)
    // - weights.edgeLoss*0.7 = 0.0135 - 0.035 < 0, clamped to 0) -- a boundary
    // this edge-justified costs nothing, so the cell's own true color wins.
    const detail = makeSourceWithDot();
    const cells = downsampleToGrid(detail.source, 5, 5);
    const initial = new Uint8Array(25).fill(0);
    initial[detail.centerCell] = 1;
    const importance = computeCellImportance(detail.source, computeEdgeMagnitude(detail.source), 5, 5);

    const optimized = runLocalOptimizer(cells, initial, detail.palette, importance, {
      color: 1,
      smoothness: 0.045,
      edgeLoss: 0.05,
    });

    expect(optimized[detail.centerCell]).toBe(1); // preserved
  });

  it("runMultiScaleOptimizer also preserves a genuine detail (its fine pass carries real edge-awareness)", () => {
    const detail = makeSourceWithDot();
    const cells = downsampleToGrid(detail.source, 5, 5);
    const initial = new Uint8Array(25).fill(0);
    initial[detail.centerCell] = 1;
    const importance = computeCellImportance(detail.source, computeEdgeMagnitude(detail.source), 5, 5);

    const optimized = runMultiScaleOptimizer(cells, initial, detail.palette, importance);

    expect(optimized[detail.centerCell]).toBe(1);
  });

  it("runMultiScaleOptimizer still cleans up genuine confetti elsewhere in the same grid", () => {
    const detail = makeSourceWithDot();
    const cells = downsampleToGrid(detail.source, 5, 5);
    const initial = new Uint8Array(25).fill(0);
    initial[detail.centerCell] = 1;
    initial[0] = 1; // spurious quantizer noise, unrelated to the real detail, in a flat corner
    const importance = computeCellImportance(detail.source, computeEdgeMagnitude(detail.source), 5, 5);

    const optimized = runMultiScaleOptimizer(cells, initial, detail.palette, importance);

    expect(optimized[0]).toBe(0); // noise cleaned up
    expect(optimized[detail.centerCell]).toBe(1); // real detail still preserved
  });
});

/** A 3x3 mid-gray dot in the middle of a 15x15 light-gray field -- realistic enough (multiple source pixels per cell after downsampling to 5x5) that the dot's own cell captures both the dot and its surrounding contrast. */
function makeSourceWithDot(): { source: PixelBuffer; palette: RGB[]; centerCell: number } {
  const size = 15;
  const center = Math.floor(size / 2);
  const background: RGB = [200, 200, 200];
  const dotColor: RGB = [140, 140, 140];
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isDot = Math.abs(x - center) <= 1 && Math.abs(y - center) <= 1;
      const [r, g, b] = isDot ? dotColor : background;
      const o = (y * size + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return {
    source: { data, width: size, height: size },
    palette: [background, dotColor],
    centerCell: 2 * 5 + 2, // center of the 5x5 downsampled grid
  };
}
