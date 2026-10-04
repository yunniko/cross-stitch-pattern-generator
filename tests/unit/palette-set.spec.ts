import { describe, expect, it } from "vitest";
import {
  colorLabel,
  paletteFileName,
  movedColor,
  generationPaletteData,
  paletteFileText,
  parseGenerationPalette,
  parsePaletteFile,
  parseSet,
  setFromPattern,
  setFromPrediction,
  setRequest,
  threadColor,
  withColor,
  withoutColor,
  type PaletteSet,
} from "@/lib/editor/palette-set";
import { deserializePatternData, serializePattern } from "@/lib/editor/pattern-serialize";
import type { ColorPrediction } from "@/lib/pipeline/prediction";
import type { StitchPattern } from "@/lib/types";

/** G-087: a set of colours chosen for a generation, its file, and what a chart carries of it. */

const dmc = (...codes: string[]): PaletteSet => ({ mode: "dmc", colors: codes.map((c) => threadColor("dmc", c)!) });

describe("a set of colours", () => {
  it("holds a thread once, takes it out again, and refuses more than the colour limit", () => {
    let set = dmc("310");
    set = withColor(set, threadColor("dmc", "321")!);
    set = withColor(set, threadColor("dmc", "321")!);
    expect(set.colors.map((c) => c.code)).toEqual(["310", "321"]);
    expect(withoutColor(set, 0).colors.map((c) => c.code)).toEqual(["321"]);
    let big: PaletteSet = { mode: "full", colors: [] };
    for (let i = 0; i < 150; i++) big = withColor(big, { rgb: [i, 0, 0] });
    expect(big.colors).toHaveLength(100);
  });

  it("is named to the generation by code in a brand and by colour otherwise", () => {
    expect(setRequest(dmc("310", "321"))).toEqual({ mode: "dmc", colors: [{ code: "310" }, { code: "321" }] });
    expect(setRequest({ mode: "full", colors: [{ rgb: [1, 2, 3] }] })).toEqual({ mode: "full", colors: [{ rgb: [1, 2, 3] }] });
    expect(colorLabel({ rgb: [255, 0, 16] })).toBe("#ff0010");
    expect(colorLabel(threadColor("dmc", "310")!)).toMatch(/^310 - /);
  });

  it("is filled from a prediction: the threads nearest the colours in a brand, once each, and the colours themselves otherwise", () => {
    const prediction = {
      colors: [
        { rgb: [10, 10, 10], cells: 5, thread: { code: "310", name: "Black" } },
        { rgb: [12, 12, 12], cells: 4, thread: { code: "310", name: "Black" } },
        { rgb: [200, 20, 20], cells: 3, thread: { code: "321", name: "Red" } },
      ],
    } as unknown as ColorPrediction;
    expect(setFromPrediction(prediction, "dmc").colors.map((c) => c.code)).toEqual(["310", "321"]);
    expect(setFromPrediction(prediction, "full").colors.map((c) => c.rgb)).toEqual([
      [10, 10, 10],
      [12, 12, 12],
      [200, 20, 20],
    ]);
  });
});

describe("the palette file", () => {
  it("round-trips a set in a brand and a set of custom colours", () => {
    for (const set of [
      dmc("310", "321", "797"),
      {
        mode: "full" as const,
        colors: [{ rgb: [1, 2, 3] as [number, number, number] }, { rgb: [250, 250, 0] as [number, number, number] }],
      },
    ]) {
      const back = parsePaletteFile(paletteFileText(set, "mine"));
      expect("set" in back && back.set).toEqual(set);
      expect("name" in back && back.name).toBe("mine");
    }
  });

  it("refuses what is not a palette, with a reason", () => {
    expect(parsePaletteFile("not json")).toHaveProperty("error");
    expect(parsePaletteFile(JSON.stringify({ format: "something-else" }))).toHaveProperty("error");
    expect(parsePaletteFile(JSON.stringify({ format: "cross-stitch-palette", mode: "dmc", colors: [{ code: "no-such" }] }))).toHaveProperty(
      "error"
    );
    expect(parsePaletteFile(JSON.stringify({ format: "cross-stitch-palette", mode: "sparkle", colors: [] }))).toHaveProperty("error");
    expect(
      parsePaletteFile(JSON.stringify({ format: "cross-stitch-palette", mode: "full", colors: [{ rgb: [1, 2, 300] }] }))
    ).toHaveProperty("error");
    expect(parseSet({ mode: "full", colors: [] })).toHaveProperty("error");
  });

  it("is made of a chart's own threads: a thread by code, a custom colour by RGB", () => {
    const pattern = {
      width: 2,
      height: 1,
      cellPalette: new Uint8Array([0, 1]),
      palette: [
        { index: 0, rgb: [0, 0, 0], symbol: "A", name: "310 - Black", count: 1, source: { brand: "dmc", code: "310" } },
        { index: 1, rgb: [9, 9, 9], symbol: "B", name: "Mine", count: 1 },
      ],
      isLandscape: true,
      threadBrand: undefined,
    } as unknown as StitchPattern;
    const set = setFromPattern(pattern);
    expect(set.mode).toBe("full");
    expect(set.colors[0].code).toBe("310");
    expect(set.colors[1]).toEqual({ rgb: [9, 9, 9] });
  });
});

describe("the set a chart carries", () => {
  const base: StitchPattern = {
    width: 2,
    height: 1,
    cellPalette: new Uint8Array([0, 0]),
    palette: [{ index: 0, rgb: [0, 0, 0], symbol: "A", name: "Black", count: 2 }],
    isLandscape: true,
  };

  it("is written to the editable file and read back with the chart", () => {
    const pattern: StitchPattern = { ...base, generationPalette: { ...dmc("310", "321"), active: true } };
    const back = deserializePatternData(JSON.parse(serializePattern(pattern)));
    expect(back.generationPalette).toEqual(pattern.generationPalette);
    expect(JSON.parse(serializePattern({ ...base })).generationPalette).toBeUndefined();
  });

  it("is dropped, and the chart still opens, when the file's is not a set; and an older file has none", () => {
    const json = JSON.parse(serializePattern(base));
    expect(
      deserializePatternData({ ...json, generationPalette: { mode: "dmc", colors: [{ code: "nope" }] } }).generationPalette
    ).toBeUndefined();
    expect(deserializePatternData({ ...json, generationPalette: "x" }).generationPalette).toBeUndefined();
    expect(deserializePatternData(json).generationPalette).toBeUndefined();
  });

  it("keeps whether the chart was made from it", () => {
    const set = { ...dmc("310"), active: false };
    expect(parseGenerationPalette(generationPaletteData(set))).toEqual(set);
  });
});

describe("movedColor", () => {
  const set = {
    mode: "full" as const,
    colors: [
      { rgb: [1, 1, 1] as [number, number, number] },
      { rgb: [2, 2, 2] as [number, number, number] },
      { rgb: [3, 3, 3] as [number, number, number] },
    ],
  };
  const firsts = (s: PaletteSet) => s.colors.map((c) => c.rgb[0]);

  it("moves a colour to a place, keeping the others in order", () => {
    expect(firsts(movedColor(set, 0, 2))).toEqual([2, 3, 1]);
    expect(firsts(movedColor(set, 2, 0))).toEqual([3, 1, 2]);
  });

  it("clamps the place, and returns the same set when nothing moves", () => {
    expect(firsts(movedColor(set, 0, 9))).toEqual([2, 3, 1]);
    expect(movedColor(set, 1, 1)).toBe(set);
    expect(movedColor(set, 7, 0)).toBe(set);
  });
});

describe("QA 2026-10-04 fixes", () => {
  it("a palette file name keeps any script and replaces only what a file name cannot hold", () => {
    expect(paletteFileName("Rust")).toBe("Rust_palette.json");
    expect(paletteFileName("🧵 нитки")).toBe("🧵 нитки_palette.json");
    expect(paletteFileName('con/..\\up:*?"<>|')).toBe("con_.._up_palette.json");
    expect(paletteFileName("  ..  ")).toBe("palette_palette.json");
  });

  it("a colour named twice in a file is one colour", () => {
    const file = JSON.stringify({
      format: "cross-stitch-palette",
      version: 1,
      mode: "full",
      colors: [{ rgb: [1, 2, 3] }, { rgb: [1, 2, 3] }, { rgb: [4, 5, 6] }],
    });
    const parsed = parsePaletteFile(file);
    expect("set" in parsed && parsed.set.colors).toHaveLength(2);
    const threads = parsePaletteFile(
      JSON.stringify({ format: "cross-stitch-palette", version: 1, mode: "dmc", colors: [{ code: "310" }, { code: "310" }] })
    );
    expect("set" in threads && threads.set.colors).toHaveLength(1);
  });

  it("a file from a newer version is refused, not half read", () => {
    const file = JSON.stringify({ format: "cross-stitch-palette", version: 2, mode: "full", colors: [{ rgb: [1, 2, 3] }] });
    expect(parsePaletteFile(file)).toEqual({ error: "That palette file was written by a newer version of this app." });
  });
});
