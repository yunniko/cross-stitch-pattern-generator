import { describe, expect, it } from "vitest";
import { oklabDistanceSquared, rgbToOklab } from "@/lib/color";
import { downsampleToGrid } from "@/lib/downsample";
import { kMeansQuantizer, meanRgbOklab, plainKMeansQuantizer } from "@/lib/quantize";
import type { CellColorBuffer, RGB } from "@/lib/types";

function makeCells(colors: RGB[]): CellColorBuffer {
  const data = new Uint8ClampedArray(colors.length * 3);
  colors.forEach(([r, g, b], i) => {
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  });
  return { data, width: colors.length, height: 1 };
}

describe("meanRgbOklab", () => {
  it("averages a 50/50 black/white cluster to a different, genuinely-OKLab-mean gray, not the linear-RGB mean", () => {
    // The review's other worked example (code-review 2026-09-09, finding 3):
    // a simple 50/50 black/white cluster gives a lower squared-OKLab error
    // at the OKLab mean than at the linear-RGB mean (0.250 vs 0.337) --
    // meaning the two means are genuinely different grays, not the same
    // value computed two ways.
    const cells = makeCells([
      [0, 0, 0],
      [255, 255, 255],
    ]);
    const [r, g, b] = meanRgbOklab(cells, [0, 1]);
    expect(g).toBe(r);
    expect(b).toBe(r);
    // The linear-RGB mean of pure black/white is sRGB ~188 (HANDOVER.md D7's
    // own gamma-correctness rule) -- the OKLab mean must differ from that.
    expect(r).not.toBe(188);
  });

  it("returns the exact single color for a single-member cluster", () => {
    const cells = makeCells([[123, 45, 67]]);
    expect(meanRgbOklab(cells, [0])).toEqual([123, 45, 67]);
  });
});

describe("kMeansQuantizer", () => {
  it("recovers two well-separated colors exactly", () => {
    const red: RGB = [220, 20, 20];
    const blue: RGB = [20, 20, 220];
    const cells = makeCells([red, red, red, blue, blue, blue]);

    const { cellPaletteIndex, palette } = kMeansQuantizer.quantize(cells, 2);

    expect(palette).toHaveLength(2);
    expect(new Set([cellPaletteIndex[0], cellPaletteIndex[1], cellPaletteIndex[2]]).size).toBe(1);
    expect(new Set([cellPaletteIndex[3], cellPaletteIndex[4], cellPaletteIndex[5]]).size).toBe(1);
    expect(cellPaletteIndex[0]).not.toBe(cellPaletteIndex[3]);
  });

  it("is deterministic for the same input", () => {
    const colors: RGB[] = Array.from({ length: 40 }, (_, i) => [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256]) as RGB[];
    const cells = makeCells(colors);

    const first = kMeansQuantizer.quantize(cells, 5);
    const second = kMeansQuantizer.quantize(cells, 5);

    expect(Array.from(first.cellPaletteIndex)).toEqual(Array.from(second.cellPaletteIndex));
    expect(first.palette).toEqual(second.palette);
  });

  it("collapses to the number of distinct colors when k exceeds them, never producing empty entries", () => {
    const cells = makeCells([
      [10, 10, 10],
      [10, 10, 10],
      [200, 200, 200],
    ]);
    const { cellPaletteIndex, palette } = kMeansQuantizer.quantize(cells, 8);

    expect(palette.length).toBeLessThanOrEqual(2);
    for (const index of cellPaletteIndex) {
      expect(index).toBeLessThan(palette.length);
    }
  });

  it("never assigns an out-of-range palette index for a single input cell", () => {
    const { cellPaletteIndex, palette } = kMeansQuantizer.quantize(makeCells([[100, 100, 100]]), 5);
    expect(palette).toHaveLength(1);
    expect(cellPaletteIndex[0]).toBe(0);
  });

  it("reinvests redundant-gray palette slots into a real, rare, saturated minority color (HANDOVER.md D20)", () => {
    // 190 cells of continuously-shaded gray "fur" + 10 cells of a tight,
    // very-different yellow "eye" -- a plain population-weighted k-means
    // run at this k never allocates a slot to the eye (verified against the
    // pre-fix baseline via a git worktree comparison, see HANDOVER.md).
    const grays: RGB[] = Array.from({ length: 190 }, (_, i) => {
      const g = 90 + (i % 40);
      return [g, g, g] as RGB;
    });
    const yellow: RGB[] = Array.from({ length: 10 }, () => [210, 190, 40] as RGB);
    const cells = makeCells([...grays, ...yellow]);

    const { palette } = kMeansQuantizer.quantize(cells, 4);
    const yellowOklab = rgbToOklab([210, 190, 40]);
    const hasYellow = palette.some((rgb) => oklabDistanceSquared(rgbToOklab(rgb), yellowOklab) < 0.01);
    expect(hasYellow).toBe(true);
  });

  it("plainKMeansQuantizer (the 'Original' generation mode) genuinely differs from kMeansQuantizer ('Latest')", () => {
    // A flat 1D list of distinct cell values (like the fixture above) turns
    // out too small/simple to reproduce the population-imbalance effect --
    // both quantizers find the outlier trivially at that scale. The real
    // divergence needs the box-averaged 2D grid structure a real image
    // produces (thousands of cells, continuous shading), matching exactly
    // what the investigation's own git-worktree comparisons used
    // (HANDOVER.md D18/D20): a shaded gray field with a small, tight,
    // saturated outlier region, downsampled through the real pipeline.
    const width = 120;
    const height = 120;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const inEye = (Math.abs(x - 20) <= 1 && Math.abs(y - 22) <= 1) || (Math.abs(x - 40) <= 1 && Math.abs(y - 22) <= 1);
        const o = (y * width + x) * 4;
        if (inEye) {
          data[o] = 215;
          data[o + 1] = 190;
          data[o + 2] = 40;
        } else {
          const shade = Math.max(0, Math.min(255, 70 + (x / width) * 100 + Math.sin(x * 0.7 + y * 0.4) * 15));
          data[o] = shade;
          data[o + 1] = shade;
          data[o + 2] = shade;
        }
        data[o + 3] = 255;
      }
    }
    const cells = downsampleToGrid({ data, width, height }, width, height);
    const yellowOklab = rgbToOklab([215, 190, 40]);
    const hasYellow = (palette: RGB[]) => palette.some((rgb) => oklabDistanceSquared(rgbToOklab(rgb), yellowOklab) < 0.01);

    // k=5: consistently found by kMeansQuantizer and consistently missed by
    // plainKMeansQuantizer at this scale (measured during the D18/D20
    // investigation -- old baseline needed k=9 here).
    expect(hasYellow(plainKMeansQuantizer.quantize(cells, 5).palette)).toBe(false);
    expect(hasYellow(kMeansQuantizer.quantize(cells, 5).palette)).toBe(true);
  });

  it("recomputes the reported palette color as the OKLab centroid, not a linear-RGB mean (code-review 2026-09-09, finding 3)", () => {
    // The review's own exact repro: a 100x60 grayscale ramp through the
    // default two-color pipeline. The old linear-RGB-mean recompute gave
    // [71,71,71] and [194,194,194]; recomputing the same final memberships
    // in OKLab space (the metric assignment actually uses throughout this
    // pipeline) gives [58,58,58] and [189,189,189] -- a real, measurable
    // difference (not just a rounding nudge), matching the review's own
    // reported values exactly.
    const width = 100;
    const height = 60;
    const data = new Uint8ClampedArray(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = Math.round((x / (width - 1)) * 255);
        const o = (y * width + x) * 3;
        data[o] = v;
        data[o + 1] = v;
        data[o + 2] = v;
      }
    }
    const cells: CellColorBuffer = { data, width, height };
    const { palette } = plainKMeansQuantizer.quantize(cells, 2);
    const sorted = [...palette].sort((a, b) => a[0] - b[0]);
    expect(sorted[0]).toEqual([58, 58, 58]);
    expect(sorted[1]).toEqual([189, 189, 189]);
  });

  it("recovers a color count lost to ordinary Lloyd's-algorithm attrition, not just merge-freed slots (HANDOVER.md D39/G-020 M2)", () => {
    // Found by brute-force search over random distinct-color fixtures: 25
    // cells over 13 genuinely distinct colors, requesting k=5 -- unlucky
    // k-means++ seeding lets one seed's Voronoi region go empty during
    // Lloyd's refinement, an ordinary k-means pathology unrelated to actual
    // color scarcity (there are 13 real distinct colors available, not 4).
    // Before the fix, both quantizers silently returned only 4 colors,
    // since the reinvestment mechanism only triggered off
    // mergeSimilarColors-detected redundancy, never off a plain shortfall
    // against the requested count.
    const colors: RGB[] = [
      [248, 92, 254],
      [155, 215, 67],
      [155, 215, 67],
      [193, 4, 185],
      [193, 4, 185],
      [193, 4, 185],
      [193, 4, 49],
      [193, 4, 49],
      [193, 4, 49],
      [175, 171, 234],
      [97, 201, 147],
      [78, 129, 22],
      [78, 129, 22],
      [78, 129, 22],
      [179, 117, 189],
      [179, 117, 189],
      [114, 46, 36],
      [246, 152, 215],
      [246, 152, 215],
      [246, 152, 215],
      [190, 197, 220],
      [28, 142, 99],
      [28, 142, 99],
      [90, 197, 28],
      [90, 197, 28],
    ];
    const cells = makeCells(colors);

    expect(plainKMeansQuantizer.quantize(cells, 5).palette).toHaveLength(4);
    expect(kMeansQuantizer.quantize(cells, 5).palette).toHaveLength(5);
  });

  it("doesn't fabricate colors when every requested color is already genuinely distinct", () => {
    // No redundancy to merge here -- the reinvestment mechanism should be a
    // complete no-op, same as if it didn't exist.
    const bands: RGB[] = [
      [220, 30, 30],
      [30, 160, 60],
      [40, 90, 220],
      [220, 200, 40],
      [180, 60, 200],
    ];
    const cells = makeCells(bands.flatMap((c) => Array.from({ length: 20 }, () => c)));

    const { palette } = kMeansQuantizer.quantize(cells, 5);
    expect(palette).toHaveLength(5);
    for (const band of bands) {
      const bandOklab = rgbToOklab(band);
      const closest = Math.min(...palette.map((rgb) => oklabDistanceSquared(rgbToOklab(rgb), bandOklab)));
      expect(closest).toBeLessThan(0.001);
    }
  });
});
