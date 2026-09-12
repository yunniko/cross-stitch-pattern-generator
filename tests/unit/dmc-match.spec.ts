import { describe, expect, it } from "vitest";
import { DMC_COLORS } from "@/lib/dmc-colors";
import { applyBrandPalette, nearestColorInBrand } from "@/lib/dmc-match";
import { buildPattern } from "@/lib/pattern";
import type { CellColorBuffer, PaletteColor, PixelBuffer, RGB, StitchPattern } from "@/lib/types";

function makePattern(width: number, height: number, cellPalette: number[], colors: RGB[]): StitchPattern {
  const counts = new Array(colors.length).fill(0);
  for (const i of cellPalette) counts[i]++;
  const palette: PaletteColor[] = colors.map((rgb, i) => ({
    index: i,
    rgb,
    symbol: String(i),
    name: `Color ${i}`,
    count: counts[i],
  }));
  return { width, height, cellPalette: Uint8Array.from(cellPalette), palette, isLandscape: width >= height };
}

describe("DMC_COLORS", () => {
  it("has 454 colors (the full standard DMC stranded cotton line), all with unique codes", () => {
    expect(DMC_COLORS).toHaveLength(454);
    expect(new Set(DMC_COLORS.map((c) => c.code)).size).toBe(454);
  });

  it("includes a few well-known reference colors at their known values", () => {
    expect(DMC_COLORS.find((c) => c.code === "310")).toEqual({ code: "310", name: "Black", rgb: [0, 0, 0] });
    expect(DMC_COLORS.find((c) => c.code === "B5200")?.rgb).toEqual([255, 255, 255]);
  });
});

describe("nearestColorInBrand", () => {
  it("returns the exact match when the RGB is already a real DMC color", () => {
    expect(nearestColorInBrand([0, 0, 0], "dmc").code).toBe("310"); // Black
  });

  it("finds the closest color for an RGB that isn't an exact DMC value", () => {
    // Just barely off pure black -- should still land on 310 Black, not
    // some unrelated dark color.
    expect(nearestColorInBrand([1, 1, 2], "dmc").code).toBe("310");
  });
});

describe("applyBrandPalette", () => {
  it("replaces every color with its nearest real DMC thread color and renames it 'CODE - Name'", () => {
    // A 2-color pattern: pure black and pure white, both already exact DMC values.
    const pattern = makePattern(2, 1, [0, 1], [
      [0, 0, 0],
      [255, 255, 255],
    ]);
    const dmc = applyBrandPalette(pattern, "dmc");
    const names = dmc.palette.map((c) => c.name).sort();
    expect(names).toEqual(["310 - Black", "B5200 - Snow White"]);
  });

  it("sets threadBrand: 'dmc' on the returned pattern (G-016, renamed from dmcMode in G-029 M1)", () => {
    const pattern = makePattern(1, 1, [0], [[0, 0, 0]]);
    expect(applyBrandPalette(pattern, "dmc").threadBrand).toBe("dmc");
  });

  it("merges two clusters that snap to the same DMC color into one palette entry with combined counts", () => {
    // Two very-slightly-different near-blacks that both snap to DMC 310.
    const pattern = makePattern(3, 1, [0, 0, 1], [
      [1, 1, 1],
      [2, 1, 2],
    ]);
    const dmc = applyBrandPalette(pattern, "dmc");
    expect(dmc.palette).toHaveLength(1);
    expect(dmc.palette[0].name).toBe("310 - Black");
    expect(dmc.palette[0].count).toBe(3); // all 3 cells, from both original clusters
    expect(Array.from(dmc.cellPalette)).toEqual([0, 0, 0]);
  });

  it("keeps distinct colors separate when they snap to different DMC codes", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [0, 0, 0],
      [255, 255, 255],
    ]);
    const dmc = applyBrandPalette(pattern, "dmc");
    expect(dmc.palette).toHaveLength(2);
    expect(new Set(dmc.cellPalette)).toEqual(new Set([0, 1]));
  });

  it("sorts the resulting palette dark-to-light, matching every other mode's legend convention", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [255, 255, 255], // white listed first in cellPalette/palette...
      [0, 0, 0], // ...but black must come first in the sorted output
    ]);
    const dmc = applyBrandPalette(pattern, "dmc");
    expect(dmc.palette[0].name).toBe("310 - Black");
    expect(dmc.palette[1].name).toBe("B5200 - Snow White");
  });

  it("assigns fresh, distinct symbols to the (possibly smaller) merged palette", () => {
    const pattern = makePattern(3, 1, [0, 0, 1], [
      [1, 1, 1],
      [255, 255, 255],
    ]);
    const dmc = applyBrandPalette(pattern, "dmc");
    const symbols = dmc.palette.map((c) => c.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("preserves width/height/isLandscape and leaves an empty pattern's palette alone", () => {
    const pattern = makePattern(4, 2, [0, 0, 0, 0, 0, 0, 0, 0], [[10, 10, 10]]);
    const dmc = applyBrandPalette(pattern, "dmc");
    expect(dmc.width).toBe(4);
    expect(dmc.height).toBe(2);
    expect(dmc.isLandscape).toBe(true);

    const empty = { ...pattern, palette: [] };
    expect(applyBrandPalette(empty, "dmc")).toBe(empty);
  });
});

function makeCellBuffer(colors: RGB[]): CellColorBuffer {
  const data = new Uint8ClampedArray(colors.length * 3);
  colors.forEach(([r, g, b], i) => {
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  });
  return { data, width: colors.length, height: 1 };
}

describe("applyBrandPalette with reoptimize (G-020 M5, HANDOVER.md D56)", () => {
  it("reassigns a cell whose true color clearly favors a different DMC group once the fine ICM pass is re-run against the new palette", () => {
    // 5 cells in a row. Continuous palette: group 0 near-black, group 1
    // near-white -- both snap to very different, far-apart real DMC
    // threads. Cell 2 is initially assigned to group 1 (white) despite
    // its OWN true color being near-black -- exactly the kind of stale
    // assignment G-020 M5 exists to correct, now that the color-error
    // cost of "wrong" is the real DMC distance, not the pre-snap one.
    const trueColors: RGB[] = [
      [10, 10, 10],
      [10, 10, 10],
      [15, 15, 15], // true color near-black, but initially assigned to the white group below
      [240, 240, 240],
      [240, 240, 240],
    ];
    const cells = makeCellBuffer(trueColors);
    const pattern = makePattern(5, 1, [0, 0, 1, 1, 1], [
      [10, 10, 10],
      [240, 240, 240],
    ]);

    const withoutReoptimize = applyBrandPalette(pattern, "dmc");
    const withReoptimize = applyBrandPalette(pattern, "dmc", { cells });

    // Without re-optimization, cell 2 stays in whichever DMC group the
    // original (stale) assignment put it in. Identify "the black one" /
    // "the white one" by relative luminance, not an absolute channel
    // threshold -- the real nearest DMC threads (measured: "3371 Black
    // Brown" [30,17,8] and "762 Pearl Gray - Very Light" [236,236,236])
    // aren't pure black/white.
    const [blackEntry, whiteEntry] = [...withoutReoptimize.palette].sort(
      (a, b) => a.rgb[0] + a.rgb[1] + a.rgb[2] - (b.rgb[0] + b.rgb[1] + b.rgb[2])
    );
    const cell2NameBefore = withoutReoptimize.palette[withoutReoptimize.cellPalette[2]].name;
    expect(cell2NameBefore).toBe(whiteEntry.name);

    // With re-optimization, cell 2's own true near-black color should win.
    const cell2NameAfter = withReoptimize.palette[withReoptimize.cellPalette[2]].name;
    expect(cell2NameAfter).toBe(blackEntry.name);
  });

  it("re-drops a DMC group emptied by re-optimization rather than leaving a zero-count legend entry", () => {
    // 3 cells, 3 originally-distinct continuous colors that would
    // otherwise snap to 3 different DMC groups -- but every cell's TRUE
    // color is near-identical and near-black, so after re-optimization
    // every cell should end up in the same (black) group, leaving the
    // other two initially-created groups with zero members.
    const trueColors: RGB[] = [
      [5, 5, 5],
      [6, 6, 6],
      [4, 4, 4],
    ];
    const cells = makeCellBuffer(trueColors);
    const pattern = makePattern(3, 1, [0, 1, 2], [
      [5, 5, 5],
      [200, 30, 30], // a clearly distinct red
      [30, 30, 200], // a clearly distinct blue
    ]);

    const dmc = applyBrandPalette(pattern, "dmc", { cells, weights: { color: 1, smoothness: 0.045, edgeLoss: 0 } });
    for (const color of dmc.palette) expect(color.count).toBeGreaterThan(0);
    expect(Array.from(dmc.cellPalette).every((i) => i === dmc.cellPalette[0])).toBe(true);
  });

  it("omitting reoptimize context reproduces exactly today's snap-only behavior", () => {
    const pattern = makePattern(3, 1, [0, 0, 1], [
      [1, 1, 1],
      [255, 255, 255],
    ]);
    expect(applyBrandPalette(pattern, "dmc")).toEqual(applyBrandPalette(pattern, "dmc", undefined));
  });
});

describe("buildPattern with paletteMode: \"dmc\" (G-020 M5, HANDOVER.md D56)", () => {
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

  it("produces a valid brand-matched pattern end-to-end, with sensible counts and no zero-count legend entries", () => {
    const buffer = makeBuffer(30, 30, (x, y) => {
      const dx = x - 15;
      const dy = y - 15;
      return dx * dx + dy * dy < 100 ? [30, 30, 30] : [220, 210, 200];
    });
    const pattern = buildPattern(buffer, { longerSideStitches: 30, colorCount: 4, paletteMode: "dmc" });
    expect(pattern.threadBrand).toBe("dmc");
    const total = pattern.palette.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBe(30 * 30);
    for (const color of pattern.palette) expect(color.count).toBeGreaterThan(0);
  });

  it("omitting paletteMode (or 'full') reproduces today's exact continuous-palette output -- no threadBrand, no behavior change", () => {
    const buffer = makeBuffer(20, 20, (x) => (x < 10 ? [60, 60, 60] : [200, 190, 180]));
    const withoutOption = buildPattern(buffer, { longerSideStitches: 20, colorCount: 3 });
    const withFull = buildPattern(buffer, { longerSideStitches: 20, colorCount: 3, paletteMode: "full" });
    expect(withoutOption.threadBrand).toBeUndefined();
    expect(withFull).toEqual(withoutOption);
  });

  it("the fine-pass re-optimization runs cleanly end-to-end alongside a plain (non-reoptimized) DMC snap on a close-color fixture", () => {
    // Close continuous colors are exactly the regime (M2's Finding 2)
    // where a boundary/color-error tradeoff has real room to move.
    // Whether re-optimization actually changes any specific fixture's
    // cell assignments depends on how close the already-converged fine
    // ICM pass already sits to the DMC-palette optimum -- this fixture
    // measured zero differing cells (the mechanism's real effect is
    // already directly, deterministically verified in the `applyBrand-
    // Palette with reoptimize` describe block above, on a fixture
    // engineered to guarantee a stale assignment). This test instead
    // checks the integration path itself: both variants produce valid,
    // non-degenerate patterns, and re-optimizing doesn't break anything
    // even when it happens to find nothing to change.
    const buffer = makeBuffer(40, 40, (x, y) => {
      const dx = x - 20;
      const dy = y - 20;
      return dx * dx + dy * dy < 150 ? [150, 150, 150] : [172, 172, 172];
    });
    const continuous = buildPattern(buffer, { longerSideStitches: 40, colorCount: 2 });
    const snapOnly = applyBrandPalette(continuous, "dmc");
    const reoptimized = buildPattern(buffer, { longerSideStitches: 40, colorCount: 2, paletteMode: "dmc" });

    expect(reoptimized.threadBrand).toBe("dmc");
    for (const color of snapOnly.palette) expect(color.count).toBeGreaterThan(0);
    for (const color of reoptimized.palette) expect(color.count).toBeGreaterThan(0);
    const totalSnap = snapOnly.palette.reduce((sum, c) => sum + c.count, 0);
    const totalReopt = reoptimized.palette.reduce((sum, c) => sum + c.count, 0);
    expect(totalReopt).toBe(totalSnap);
  });

  it("does nothing extra when optimize is false -- DMC snap still applies, but without re-optimization (no cells context needed)", () => {
    const buffer = makeBuffer(20, 20, (x) => (x < 10 ? [30, 30, 30] : [220, 210, 200]));
    const pattern = buildPattern(buffer, { longerSideStitches: 20, colorCount: 2, optimize: false, paletteMode: "dmc" });
    expect(pattern.threadBrand).toBe("dmc");
    for (const color of pattern.palette) expect(color.count).toBeGreaterThan(0);
  });
});
