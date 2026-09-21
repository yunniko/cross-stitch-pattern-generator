import { describe, expect, it } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import { ditherToPalette } from "@/lib/pipeline/dither";
import { DEFAULT_DITHER_TEXTURE, dotScore, handDrawnThresholds, markCentres, markLibrary, MARK_SPACING } from "@/lib/pipeline/dither-hand-drawn";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { buildPattern } from "@/lib/pipeline/pattern";
import type { PixelBuffer, RGB, StitchPattern } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "./helpers/fixtures";

/**
 * G-054: the marks are placed, not tiled, and drawn as strokes rather than stamped.
 *
 * M1's three: the placement repeats nowhere, it is even rather than clumped, and it holds tone exactly. M2's two: the
 * library draws every shape it claims, a ring's middle stays open while its stroke is still going round, and a real
 * photo survives the clustering (criterion 4, the measure that would catch marks smearing detail away).
 */

const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];

/** A flat grid at `t` of the way from black to white, as interleaved OKLab. */
function flatGrid(width: number, height: number, t: number): Float64Array {
  const black = rgbToOklab(BLACK);
  const white = rgbToOklab(WHITE);
  const out = new Float64Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) out[i * 3 + c] = black[c] + t * (white[c] - black[c]);
  }
  return out;
}

/** Mean squared OKLab error with photo and chart each averaged over a `radius` neighbourhood of stitches. */
function meanError(source: PixelBuffer, pattern: StitchPattern, radius: number): number {
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
        const sum = [0, 0, 0];
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            for (let c = 0; c < 3; c++) sum[c] += src[(yy * width + xx) * 3 + c];
            n++;
          }
        }
        for (let c = 0; c < 3; c++) out[(y * width + x) * 3 + c] = sum[c] / n;
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

describe("hand-drawn marks are placed, not tiled", () => {
  const width = 240;
  const height = 180;

  it("repeats at no shift, where a matrix repeats at its own size", () => {
    const thresholds = handDrawnThresholds(width, height, DEFAULT_DITHER_TEXTURE, dotScore);
    const lit = (t: number) => Uint8Array.from(thresholds, (v) => (t > v ? 1 : 0));
    const agreement = (labels: Uint8Array, shiftX: number, shiftY: number) => {
      let same = 0;
      let total = 0;
      for (let y = 0; y + shiftY < height; y++) {
        for (let x = 0; x + shiftX < width; x++) {
          same += labels[y * width + x] === labels[(y + shiftY) * width + x + shiftX] ? 1 : 0;
          total++;
        }
      }
      return same / total;
    };
    // At a quarter tone the marks are small and well separated, which is where a period would show most clearly.
    const labels = lit(0.25);
    const base = agreement(labels, 0, 0);
    expect(base).toBe(1);
    for (let shift = 1; shift <= 32; shift++) {
      // A repeat would show as near-total agreement at its own shift. Chance agreement between two fields that are
      // three-quarters dark sits near 0.62, so the bound is generous and still far below a tile's spike.
      expect(agreement(labels, shift, 0), `horizontal shift ${shift}`).toBeLessThan(0.92);
      expect(agreement(labels, 0, shift), `vertical shift ${shift}`).toBeLessThan(0.92);
    }
  });

  it("spaces its marks evenly rather than scattering them", () => {
    const centres = markCentres(width, height);
    const count = centres.length / 2;
    expect(count, "a mark roughly every spacing squared").toBeGreaterThan((width * height) / (MARK_SPACING * MARK_SPACING) / 2);

    const nearest: number[] = [];
    for (let a = 0; a < count; a++) {
      let best = Infinity;
      for (let b = 0; b < count; b++) {
        if (a === b) continue;
        const dx = centres[a * 2] - centres[b * 2];
        const dy = centres[a * 2 + 1] - centres[b * 2 + 1];
        best = Math.min(best, Math.hypot(dx, dy));
      }
      nearest.push(best);
    }
    // Poisson scatter would put some marks on top of each other and leave holes; a lattice would make every distance
    // identical. Evenly placed but irregular means: never closer than the minimum, and rarely more than a spacing.
    expect(Math.min(...nearest), "no two marks blot together").toBeGreaterThanOrEqual(0.72 * MARK_SPACING - 1e-9);
    const sorted = [...nearest].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    expect(median).toBeGreaterThan(0.72 * MARK_SPACING);
    expect(median).toBeLessThan(1.4 * MARK_SPACING);
    // And they are not all the same distance apart, which is what makes it look drawn rather than printed.
    const spread = sorted[Math.floor(sorted.length * 0.9)] - sorted[Math.floor(sorted.length * 0.1)];
    expect(spread, "the spacing varies").toBeGreaterThan(0.1 * MARK_SPACING);
  });

  it("holds tone exactly: the share of stitches lit is the tone asked for", () => {
    // The point of ranking each mark's own cells: a flat tone lights that share of every mark, so the chart carries
    // the same amount of thread an undithered one would, and the marks only decide which stitches.
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const labels = ditherToPalette(flatGrid(width, height, t), width, height, [BLACK, WHITE], "hand-drawn");
      const share = Array.from(labels).filter((v) => v === 1).length / (width * height);
      expect(Math.abs(share - t), `tone ${t} came back as ${share.toFixed(3)}`).toBeLessThan(0.02);
    }
  });

  it("is the same chart every time it is drawn", () => {
    const first = ditherToPalette(flatGrid(80, 60, 0.4), 80, 60, [BLACK, WHITE], "hand-drawn");
    const second = ditherToPalette(flatGrid(80, 60, 0.4), 80, 60, [BLACK, WHITE], "hand-drawn");
    expect(Array.from(second)).toEqual(Array.from(first));
  });

  it("draws every shape in its library, in something like the share each is given", () => {
    const marks = markLibrary(width, height);
    expect(marks.length).toBeGreaterThan(500);
    const share = (shape: string) => marks.filter((mark) => mark.shape === shape).length / marks.length;
    // The weights are 0.42 / 0.20 / 0.23 / 0.15; a tenth either way is enough to catch a mis-wired table without
    // pinning the draw itself, which would make every future change to the library a test edit.
    expect(share("ring")).toBeGreaterThan(0.32);
    expect(share("ring")).toBeLessThan(0.52);
    for (const shape of ["broken-ring", "dot", "lump"]) {
      expect(share(shape), `${shape} is drawn at all`).toBeGreaterThan(0.05);
    }
  });

  it("leaves a ring's middle open while its stroke is still being drawn", () => {
    // What separates this family from the ring screen: the middle is open because the mark is a stroke around a
    // circle, and it closes only when the tone asks for more than the ring itself.
    const thresholds = handDrawnThresholds(width, height);
    const centres = markCentres(width, height);
    const marks = markLibrary(width, height);
    const thresholdAt = (x: number, y: number) => thresholds[Math.round(y - 0.5) * width + Math.round(x - 0.5)];

    let checked = 0;
    for (let m = 0; m < marks.length && checked < 40; m++) {
      const mark = marks[m];
      if (mark.shape !== "ring") continue;
      const cx = centres[m * 2];
      const cy = centres[m * 2 + 1];
      if (cx < MARK_SPACING || cy < MARK_SPACING || cx > width - MARK_SPACING || cy > height - MARK_SPACING) continue;
      const middle = thresholdAt(cx, cy);
      // The earliest cell on the mark's own circle, sampled at the four axes.
      const onRing = Math.min(
        thresholdAt(cx + mark.radius, cy),
        thresholdAt(cx - mark.radius, cy),
        thresholdAt(cx, cy + mark.radius),
        thresholdAt(cx, cy - mark.radius)
      );
      expect(onRing, `mark ${m}: the stroke is drawn before the middle`).toBeLessThan(middle);
      checked++;
    }
    expect(checked, "rings were found to check").toBeGreaterThan(20);
  });

  it("keeps the picture: local tone no worse than the undithered chart, on every fixture", () => {
    // Criterion 4 of G-054. Tone is exact for a flat patch by construction; this is the harder case — a real photo,
    // where the marks must not smear detail away as they cluster stitches together.
    const fixtures: Array<{ name: string; source: PixelBuffer }> = [
      { name: "gradient", source: makeBuffer(160, 120, (x, y) => [40 + (x * 180) / 160, 60 + (y * 150) / 120, 200 - (x * 120) / 160]) },
      { name: "photo", source: makePhotoLikeBuffer(160, 120) },
      {
        name: "flat regions",
        source: makeBuffer(160, 120, (x, y) => {
          const base: RGB = x < 80 ? (y < 60 ? [200, 60, 60] : [60, 140, 90]) : y < 60 ? [70, 100, 190] : [220, 190, 70];
          const n = pseudoNoise(x, y, 6);
          return [base[0] + n, base[1] + n, base[2] + n];
        }),
      },
    ];
    for (const { name, source } of fixtures) {
      const options = { longerSideStitches: 100, colorCount: 16 };
      const plain = meanError(source, buildPattern(source, options), 2);
      const drawn = meanError(source, buildPattern(source, { ...options, ditherMode: "hand-drawn" as const }), 2);
      expect(drawn, `${name}: drawn ${drawn.toExponential(2)} vs undithered ${plain.toExponential(2)}`).toBeLessThanOrEqual(plain);
    }
  });

  it("grows a mark outward from its centre, so stitches of one thread touch", () => {
    const labels = ditherToPalette(flatGrid(width, height, 0.3), width, height, [BLACK, WHITE], "hand-drawn");
    let lit = 0;
    let withNeighbour = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (labels[y * width + x] !== 1) continue;
        lit++;
        const neighbours: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        if (neighbours.some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < height && labels[(y + dy) * width + x + dx] === 1)) withNeighbour++;
      }
    }
    expect(withNeighbour / lit, "a drawn mark is a cluster, not a speck").toBeGreaterThan(0.9);
  });
});
