import { describe, expect, it } from "vitest";
import { patternFromPixels } from "@/lib/editor/pixel-art-import";
import { pixelArtPixels } from "@/lib/export/pixel-art-png";
import { EMPTY_CELL, MAX_COLORS, MIN_STITCHES, type PaletteColor, type RGB, type StitchPattern } from "@/lib/types";

/**
 * G-049 M3, criterion 5: a chart written out as pixel art and read back in is the same chart. Over generated charts
 * rather than one example, because the pairs that break are the awkward ones — a palette whose colours differ by one,
 * a chart that is all empty, a chart with no empty stitch at all.
 *
 * The comparison is by colour, not by palette index: the import orders a palette dark to light and drops colours the
 * chart never uses, so "the same chart" means every stitch is the same colour and the used colours are the same set.
 */

/** A deterministic 32-bit generator, so a failure is reproducible from its seed. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function chart(seed: number, width: number, height: number, colorCount: number, emptyChance: number): StitchPattern {
  const next = random(seed);
  const palette: PaletteColor[] = Array.from({ length: colorCount }, (_, index) => ({
    index,
    rgb: [Math.floor(next() * 256), Math.floor(next() * 256), Math.floor(next() * 256)] as RGB,
    symbol: String.fromCodePoint(65 + index),
    name: `Colour ${index}`,
    count: 0,
  }));
  const cellPalette = new Uint8Array(width * height);
  for (let cell = 0; cell < cellPalette.length; cell++) {
    const empty = next() < emptyChance;
    const index = Math.floor(next() * colorCount);
    cellPalette[cell] = empty ? EMPTY_CELL : index;
    if (!empty) palette[index].count++;
  }
  return { width, height, cellPalette, palette, isLandscape: width > height, name: `seed-${seed}` };
}

/** Every stitch as a colour, or null where it is empty — what a round trip has to preserve. */
function colors(pattern: StitchPattern): (string | null)[] {
  return Array.from(pattern.cellPalette, (index) => (index === EMPTY_CELL ? null : pattern.palette[index].rgb.join(",")));
}

function roundTrip(pattern: StitchPattern): StitchPattern {
  const result = patternFromPixels(pixelArtPixels(pattern), pattern.name);
  expect(result.error, `round trip refused: ${result.error}`).toBeNull();
  return result.pattern!;
}

describe("a chart exported as pixel art and imported again is the same chart", () => {
  const cases = [
    { name: "a small chart with a few colours", width: 16, height: 12, colorCount: 4, emptyChance: 0.2 },
    { name: "a chart with no empty stitches", width: 23, height: 17, colorCount: 7, emptyChance: 0 },
    { name: "a chart that is mostly empty", width: 31, height: 11, colorCount: 5, emptyChance: 0.9 },
    { name: "a full palette", width: 40, height: 40, colorCount: MAX_COLORS, emptyChance: 0.1 },
    { name: "a single-colour chart", width: 12, height: 12, colorCount: 1, emptyChance: 0.5 },
    { name: "a tall thin chart", width: 10, height: 120, colorCount: 9, emptyChance: 0.3 },
  ];

  for (const { name, width, height, colorCount, emptyChance } of cases) {
    it(name, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const original = chart(seed, width, height, colorCount, emptyChance);
        const returned = roundTrip(original);
        expect([returned.width, returned.height], `seed ${seed}`).toEqual([width, height]);
        expect(colors(returned), `seed ${seed}`).toEqual(colors(original));
        // The palette is the colours actually stitched, no more and no fewer.
        const used = new Set(colors(original).filter((c): c is string => c !== null));
        expect(new Set(returned.palette.map((c) => c.rgb.join(",")))).toEqual(used);
        expect(returned.palette.reduce((n, c) => n + c.count, 0)).toBe(used.size === 0 ? 0 : colors(original).filter((c) => c !== null).length);
      }
    });
  }

  it("keeps an all-empty chart empty, with no colours at all", () => {
    const blank: StitchPattern = {
      width: 20,
      height: 20,
      cellPalette: new Uint8Array(400).fill(EMPTY_CELL),
      palette: [],
      isLandscape: false,
      name: "blank",
    };
    const returned = roundTrip(blank);
    expect(returned.palette).toEqual([]);
    expect(Array.from(returned.cellPalette).every((v) => v === EMPTY_CELL)).toBe(true);
  });

  it("pads a chart smaller than the minimum, and a second round trip then changes nothing", () => {
    // Nothing in the app makes a chart under the minimum, but the export of one must still read back sensibly.
    const tiny = chart(9, 6, 6, 3, 0.2);
    const once = roundTrip(tiny);
    expect([once.width, once.height]).toEqual([MIN_STITCHES, MIN_STITCHES]);
    const twice = roundTrip(once);
    expect(colors(twice)).toEqual(colors(once));
  });
});
