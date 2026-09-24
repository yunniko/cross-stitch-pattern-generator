import { describe, expect, it } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import { DITHER_MATRICES } from "@/lib/pipeline/dither-matrices";
import { ditherToPalette, ORDERED_DITHER_MODES, type DitherMode } from "@/lib/pipeline/dither";
import { buildPattern } from "@/lib/pipeline/pattern";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { EMPTY_CELL, type PixelBuffer, type RGB } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer } from "./helpers/fixtures";

/**
 * G-052: dithering mixes neighbouring stitches between the two nearest threads instead of rounding each one. The three
 * things that must hold: Off is the pipeline as it was, each pattern is the matrix it claims, and a dithered chart
 * fits the photo better than the same palette without it.
 */

const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];

/** A grid of one flat colour, as interleaved OKLab. */
function flatGrid(width: number, height: number, rgb: RGB): Float64Array {
  const [l, a, b] = rgbToOklab(rgb);
  const out = new Float64Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    out[i * 3] = l;
    out[i * 3 + 1] = a;
    out[i * 3 + 2] = b;
  }
  return out;
}

interface Chart {
  width: number;
  height: number;
  cellPalette: Uint8Array;
  palette: { rgb: RGB }[];
}

/**
 * Mean squared OKLab error between the photo and the chart, both averaged over a `radius` neighbourhood of stitches.
 *
 * Radius 0 is the per-stitch error, and dithering is deliberately *worse* by it: a dithered stitch is often the wrong
 * thread on purpose. What dithering buys is accuracy once neighbouring stitches are seen together, which is how a
 * stitched piece is read — so radius 1 (a 3×3 of stitches) is the measure it must win on, and the measure criterion 3
 * of G-052 is stated in.
 */
function meanError(source: PixelBuffer, pattern: Chart, radius: number): number {
  const { width, height } = pattern;
  const cells = downsampleToGrid(source, width, height);
  const want = new Float64Array(width * height * 3);
  const got = new Float64Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    want.set(rgbToOklab([cells.data[i * 3], cells.data[i * 3 + 1], cells.data[i * 3 + 2]]), i * 3);
    got.set(rgbToOklab(pattern.palette[pattern.cellPalette[i]].rgb), i * 3);
  }
  const blur = (src: Float64Array) => {
    const out = new Float64Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let n = 0;
        let l = 0;
        let a = 0;
        let b = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            const o = (yy * width + xx) * 3;
            l += src[o];
            a += src[o + 1];
            b += src[o + 2];
            n++;
          }
        }
        const o = (y * width + x) * 3;
        out[o] = l / n;
        out[o + 1] = a / n;
        out[o + 2] = b / n;
      }
    }
    return out;
  };
  const w = blur(want);
  const g = blur(got);
  let total = 0;
  for (let i = 0; i < width * height; i++) {
    total += (w[i * 3] - g[i * 3]) ** 2 + (w[i * 3 + 1] - g[i * 3 + 1]) ** 2 + (w[i * 3 + 2] - g[i * 3 + 2]) ** 2;
  }
  return total / (width * height);
}

describe("each pattern is the matrix it claims to be", () => {
  for (const mode of ORDERED_DITHER_MODES) {
    it(`${mode} reproduces its own matrix on a flat mid-tone`, () => {
      const matrix = DITHER_MATRICES[mode];
      const size = matrix.length;
      // Exactly halfway between two threads: every cell wants the same mixture, so only the matrix decides.
      const midpoint = rgbToOklab(BLACK).map((v, i) => (v + rgbToOklab(WHITE)[i]) / 2) as unknown as RGB;
      const grid = new Float64Array(size * size * 3);
      for (let i = 0; i < size * size; i++) grid.set(midpoint as unknown as number[], i * 3);

      const labels = ditherToPalette(grid, size, size, [BLACK, WHITE], mode);
      // A rank below the midpoint takes the second thread, above it the first: the matrix, cell for cell.
      const expected = matrix.flat().map((rank) => ((rank + 0.5) / (size * size) < 0.5 ? 1 : 0));
      expect(Array.from(labels)).toEqual(expected);
      // And half the stitches went each way, which is what "halfway" means.
      expect(Array.from(labels).filter((v) => v === 1)).toHaveLength((size * size) / 2);
    });
  }

  it("grows the ring screen as a ring: the whole annulus before any of the hole (G-053)", () => {
    // The shape the Owner's screenshot holds: an eight-cell ring around an unlit middle, the middle closing only at a
    // heavier tone. Stated as ranks rather than as a picture, so it pins the ordering and not one tone's rendering.
    const matrix = DITHER_MATRICES["ring-8"];
    const rank = (x: number, y: number) => matrix[y][x];
    const ring = [
      [1, 0],
      [2, 0],
      [0, 1],
      [3, 1],
      [0, 2],
      [3, 2],
      [1, 3],
      [2, 3],
    ];
    const hole = [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ];

    const lastOfRing = Math.max(...ring.map(([x, y]) => rank(x, y)));
    const firstOfHole = Math.min(...hole.map(([x, y]) => rank(x, y)));
    expect(lastOfRing, "the annulus fills before the middle does").toBeLessThan(firstOfHole);
    // And the hole does close, well before the tile is full: a ring that never fills would band at midtones.
    expect(Math.max(...hole.map(([x, y]) => rank(x, y))), "the middle closes by half tone").toBeLessThan(32);
  });

  it("gives a flat tone at a thread's own colour that thread alone, in every mode", () => {
    for (const mode of [...ORDERED_DITHER_MODES, "floyd-steinberg"] as Exclude<DitherMode, "off">[]) {
      const labels = ditherToPalette(flatGrid(8, 8, BLACK), 8, 8, [BLACK, WHITE], mode);
      expect(Array.from(labels), `${mode}: nothing to mix`).toEqual(new Array(64).fill(0));
    }
  });

  it("spreads a gradient across both threads rather than banding", () => {
    // A black-to-white ramp at two threads: every mode must use both, and the dark end must be darker than the light.
    const width = 32;
    const grid = new Float64Array(width * width * 3);
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        const v = Math.round((255 * x) / (width - 1));
        grid.set(rgbToOklab([v, v, v]), (y * width + x) * 3);
      }
    }
    for (const mode of [...ORDERED_DITHER_MODES, "floyd-steinberg"] as Exclude<DitherMode, "off">[]) {
      const labels = ditherToPalette(grid, width, width, [BLACK, WHITE], mode);
      const leftHalf = Array.from(labels).filter((_, i) => i % width < width / 2);
      const rightHalf = Array.from(labels).filter((_, i) => i % width >= width / 2);
      const whiteShare = (cells: number[]) => cells.filter((v) => v === 1).length / cells.length;
      expect(whiteShare(leftHalf), `${mode}: the dark end leans dark`).toBeLessThan(0.45);
      expect(whiteShare(rightHalf), `${mode}: the light end leans light`).toBeGreaterThan(0.55);
      expect(whiteShare(rightHalf) - whiteShare(leftHalf), `${mode}: and the ramp runs the right way`).toBeGreaterThan(0.3);
    }
  });
});

describe("Atkinson does what it is for (G-053)", () => {
  // A black-to-white ramp down the grid, as OKLab, dithered to two threads: the case the two kernels differ most on.
  const width = 160;
  const height = 120;
  const ramp = new Float64Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const v = Math.round((255 * y) / (height - 1));
    for (let x = 0; x < width; x++) ramp.set(rgbToOklab([v, v, v]), (y * width + x) * 3);
  }
  const of = (mode: Exclude<DitherMode, "off">) => ditherToPalette(ramp, width, height, [BLACK, WHITE], mode);

  /** Rows of one thread alone at each end: what a kernel that drops part of the error leaves flat. */
  function flatEnds(labels: Uint8Array): number {
    let rows = 0;
    for (let y = 0; y < height; y++) {
      const first = labels[y * width];
      if (Array.from(labels.subarray(y * width, (y + 1) * width)).every((v) => v === first)) rows++;
    }
    return rows;
  }

  /** The share of light stitches with a light stitch beside them: clumping, the other half of the look. */
  function clumped(labels: Uint8Array): number {
    let lit = 0;
    let withNeighbour = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (labels[y * width + x] !== 1) continue;
        lit++;
        const neighbours: Array<[number, number]> = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        if (
          neighbours.some(
            ([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < height && labels[(y + dy) * width + x + dx] === 1
          )
        )
          withNeighbour++;
      }
    }
    return withNeighbour / lit;
  }

  it("keeps the ends flat, where Floyd–Steinberg breaks them up", () => {
    // Measured on this ramp: Atkinson leaves 30 of 120 rows in one thread, Floyd–Steinberg 5. Atkinson passes on six
    // eighths of the error and drops the rest, so near-black and near-white never accumulate enough to flip a stitch.
    const atkinson = flatEnds(of("atkinson"));
    const floyd = flatEnds(of("floyd-steinberg"));
    expect(atkinson, `atkinson ${atkinson} rows vs floyd-steinberg ${floyd}`).toBeGreaterThan(floyd * 2);
  });

  it("clumps the stitches it does place", () => {
    // Measured: 95.1% of Atkinson's light stitches have a light neighbour, against 82.8% of Floyd–Steinberg's.
    const atkinson = clumped(of("atkinson"));
    const floyd = clumped(of("floyd-steinberg"));
    expect(atkinson, `atkinson ${atkinson.toFixed(2)} vs floyd-steinberg ${floyd.toFixed(2)}`).toBeGreaterThan(floyd + 0.1);
  });

  it("still spans both threads across the ramp, rather than posterizing it", () => {
    const labels = of("atkinson");
    const share = Array.from(labels).filter((v) => v === 1).length / (width * height);
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.65);
  });
});

describe("dithering earns its place, and costs what it costs", () => {
  const gradient = makeBuffer(120, 80, (x, y) => [40 + (x * 180) / 120, 60 + (y * 150) / 80, 200 - (x * 120) / 120]);

  it("fits the photo better than the same palette undithered, once neighbouring stitches are read together", () => {
    for (const colorCount of [8, 16]) {
      const plain = buildPattern(gradient, { longerSideStitches: 60, colorCount });
      const plainError = meanError(gradient, plain, 1);
      for (const ditherMode of [...ORDERED_DITHER_MODES, "floyd-steinberg"] as DitherMode[]) {
        const dithered = buildPattern(gradient, { longerSideStitches: 60, colorCount, ditherMode });
        expect(meanError(gradient, dithered, 1), `${ditherMode} at ${colorCount} colours`).toBeLessThan(plainError);
      }
    }
  });

  it("is worse stitch by stitch on this gradient, which is the trade it makes", () => {
    // Stated rather than hidden: a dithered stitch is often the wrong thread on purpose. It is not a universal rule —
    // on a photo the undithered chart runs the optimizer, which trades colour accuracy for smoothness, so a dithered
    // chart can be closer per stitch there too (`docs/reviews/2026-09-21-dithering-comparison.md`). On a smooth ramp,
    // where the undithered chart was already close, the loss is real and this pins it.
    const plain = buildPattern(gradient, { longerSideStitches: 60, colorCount: 8 });
    const perStitchPlain = meanError(gradient, plain, 0);
    for (const ditherMode of [...ORDERED_DITHER_MODES, "floyd-steinberg"] as DitherMode[]) {
      const dithered = buildPattern(gradient, { longerSideStitches: 60, colorCount: 8, ditherMode });
      expect(meanError(gradient, dithered, 0), `${ditherMode}`).toBeGreaterThan(perStitchPlain);
    }
  });

  it("produces a valid chart: every cell inside the palette, every colour stitched", () => {
    for (const ditherMode of [...ORDERED_DITHER_MODES, "floyd-steinberg"] as DitherMode[]) {
      const pattern = buildPattern(makePhotoLikeBuffer(120, 80), { longerSideStitches: 40, colorCount: 12, ditherMode });
      const counts = new Array(pattern.palette.length).fill(0);
      for (const index of pattern.cellPalette) {
        expect(index, `${ditherMode}: inside the palette`).toBeLessThan(pattern.palette.length);
        counts[index]++;
      }
      expect(
        counts.filter((n) => n === 0),
        `${ditherMode}: no colour with nothing to stitch`
      ).toEqual([]);
      expect(
        pattern.palette.map((c) => c.count),
        `${ditherMode}: counts match`
      ).toEqual(counts);
      expect(pattern.ditherMode, `${ditherMode}: recorded on the chart`).toBe(ditherMode);
    }
  });

  it("leaves a transparent background empty, as an undithered chart does", () => {
    const disc: PixelBuffer = { data: new Uint8ClampedArray(80 * 80 * 4), width: 80, height: 80 };
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 80; x++) {
        const o = (y * 80 + x) * 4;
        disc.data[o] = 40 + x * 2;
        disc.data[o + 1] = 90;
        disc.data[o + 2] = 200 - y;
        disc.data[o + 3] = Math.hypot(x - 40, y - 40) < 28 ? 255 : 0;
      }
    }
    const pattern = buildPattern(disc, { longerSideStitches: 40, colorCount: 8, ditherMode: "bayer-8" });
    expect(pattern.cellPalette[0]).toBe(EMPTY_CELL);
    expect(Array.from(pattern.cellPalette).filter((v) => v === EMPTY_CELL).length).toBeGreaterThan(400);
  });
});

describe("dithering and Crisp are mutually exclusive", () => {
  it("refuses the combination rather than letting one undo the other", () => {
    for (const edgeMode of ["crisp", "crisp-plus"] as const) {
      expect(() =>
        buildPattern(makePhotoLikeBuffer(60, 40), { longerSideStitches: 20, colorCount: 8, edgeMode, ditherMode: "bayer-4" })
      ).toThrow(/cannot be combined with dithering/);
    }
  });

  it("leaves Off exactly as it was", () => {
    const source = makePhotoLikeBuffer(90, 60);
    const withoutOption = buildPattern(source, { longerSideStitches: 30, colorCount: 10 });
    const explicitlyOff = buildPattern(source, { longerSideStitches: 30, colorCount: 10, ditherMode: "off" });
    expect(Array.from(explicitlyOff.cellPalette)).toEqual(Array.from(withoutOption.cellPalette));
    expect(explicitlyOff.palette.map((c) => c.rgb)).toEqual(withoutOption.palette.map((c) => c.rgb));
    expect(explicitlyOff.ditherMode).toBeUndefined();
  });
});

describe("the line screens are one pattern with a direction (G-059)", () => {
  const size = 8;

  /** A flat tone between black and white, as interleaved OKLab. */
  function flatTone(t: number): Float64Array {
    const black = rgbToOklab(BLACK);
    const white = rgbToOklab(WHITE);
    const grid = new Float64Array(size * size * 3);
    for (let i = 0; i < size * size; i++) {
      for (let c = 0; c < 3; c++) grid[i * 3 + c] = black[c] + t * (white[c] - black[c]);
    }
    return grid;
  }

  /** How often a stitch matches the one a step away, wrapped — 1 means the lines run unbroken that way. */
  function runAlong(mode: DitherMode, tone: number, dx: number, dy: number): number {
    const labels = ditherToPalette(flatTone(tone), size, size, [BLACK, WHITE], mode as Exclude<DitherMode, "off">);
    const at = (x: number, y: number) => labels[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
    let same = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (at(x, y) === at(x + dx, y + dy)) same++;
    return same / (size * size);
  }

  const DIRECTIONS: Array<[DitherMode, [number, number], [number, number]]> = [
    ["lines-horizontal", [1, 0], [0, 1]],
    ["lines-vertical", [0, 1], [1, 0]],
    ["lines-diagonal", [1, -1], [1, 1]],
    ["lines-anti-diagonal", [1, 1], [1, -1]],
  ];

  for (const [mode, along, across] of DIRECTIONS) {
    it(`${mode} draws unbroken lines its own way`, () => {
      for (const tone of [0.25, 0.5, 0.75]) {
        expect(runAlong(mode, tone, along[0], along[1]), `${mode} at ${tone}, along`).toBe(1);
      }
      // Across the lines they break. Checked at a quarter tone: at half tone every other line is lit, and stepping
      // two lines at a time lands on a lit one again, so even the wrong direction reads as unbroken there.
      expect(runAlong(mode, 0.25, across[0], across[1]), `${mode} across`).toBeLessThan(1);
    });
  }

  it("keeps every direction a permutation, and all four different", () => {
    const flat = (mode: string) => DITHER_MATRICES[mode].flat();
    for (const mode of ["lines-horizontal", "lines-vertical", "lines-diagonal", "lines-anti-diagonal"]) {
      expect(new Set(flat(mode)).size, `${mode} is a permutation`).toBe(size * size);
    }
    const strings = ["lines-horizontal", "lines-vertical", "lines-diagonal", "lines-anti-diagonal"].map((m) => flat(m).join(","));
    expect(new Set(strings).size, "no two directions are the same matrix").toBe(4);
  });
});
