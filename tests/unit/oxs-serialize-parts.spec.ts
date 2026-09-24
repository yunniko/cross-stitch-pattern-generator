import { describe, expect, it } from "vitest";
import { serializeOxs, serializeOxsBytes, serializeOxsParts } from "@/lib/editor/oxs";
import { formatThreadName, THREAD_BRANDS } from "@/lib/threads/thread-brands";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";
import { serializeOxsPreG046M4 } from "./reference/oxs-serialize-pre-g046m4";

/**
 * G-046 M4 (D180): the OXS file is built a row at a time instead of as one array of every stitch's line. The text must
 * be exactly what the one-array version wrote, for charts with empty rows, empty charts, thread-matched palettes and
 * non-ASCII symbols and names, and the bytes must be that text in UTF-8.
 */

function chart(width: number, height: number, emptyAt: (x: number, y: number) => boolean, threads = false): StitchPattern {
  const dmc = THREAD_BRANDS.dmc.colors;
  const palette: PaletteColor[] = ["★", "A", "é", "∆"].map((symbol, i) =>
    threads
      ? { index: i, rgb: dmc[i].rgb, symbol, name: formatThreadName(dmc[i]), count: 0, source: { brand: "dmc", code: dmc[i].code } }
      : { index: i, rgb: [i * 60, 255 - i * 50, 90], symbol, name: `Ünïcode & "quoted" <${i}>`, count: 0 }
  );
  const cellPalette = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) cellPalette[y * width + x] = emptyAt(x, y) ? EMPTY_CELL : (x * 3 + y) % palette.length;
  for (const p of cellPalette) if (p !== EMPTY_CELL) palette[p].count++;
  return {
    width,
    height,
    cellPalette,
    palette,
    isLandscape: width >= height,
    name: "Tëst & <chart>",
    threadBrand: threads ? "dmc" : undefined,
  };
}

describe("the OXS file built a row at a time", () => {
  const cases: Array<[string, StitchPattern]> = [
    ["full", chart(37, 23, () => false)],
    ["empty rows and scattered holes", chart(40, 30, (x, y) => y % 7 === 3 || (x + y) % 11 === 0)],
    ["only empty stitches", chart(12, 10, () => true)],
    ["one stitch", chart(1, 1, () => false)],
    ["thread-matched", chart(25, 18, (x) => x === 4, true)],
  ];
  for (const [name, pattern] of cases) {
    it(`${name}: the same text and its UTF-8 bytes`, () => {
      const options = { authorName: 'Jö & "Ann"', aidaCount: 16 };
      const expected = serializeOxsPreG046M4(pattern, options);
      expect(serializeOxs(pattern, options)).toBe(expected);
      expect(serializeOxsParts(pattern, options).join("")).toBe(expected);
      expect(Buffer.compare(Buffer.from(serializeOxsBytes(pattern, options)), Buffer.from(expected, "utf8"))).toBe(0);
    });
  }
});
