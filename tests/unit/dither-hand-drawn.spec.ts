import { describe, expect, it } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import { ditherToPalette } from "@/lib/pipeline/dither";
import { dotScore, handDrawnThresholds, markCentres, MARK_SPACING } from "@/lib/pipeline/dither-hand-drawn";
import type { RGB } from "@/lib/types";

/**
 * G-054 M1: the marks are placed, not tiled. Three things must hold before any of it is drawn as a shape — the
 * placement repeats nowhere, it is even rather than clumped, and it holds tone exactly.
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

describe("hand-drawn marks are placed, not tiled", () => {
  const width = 240;
  const height = 180;

  it("repeats at no shift, where a matrix repeats at its own size", () => {
    const thresholds = handDrawnThresholds(width, height, dotScore);
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
