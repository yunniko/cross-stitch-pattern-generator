import { describe, expect, it } from "vitest";
import {
  addBrandColor,
  addColor,
  compactUnusedColors,
  editColorRgb,
  editColorToBrandColor,
  mergeColors,
  renameColor,
  restoreColor,
  setColorSymbol,
} from "@/lib/editor/pattern-edit";
import { parseOxs, serializeOxs } from "@/lib/editor/oxs";
import { deserializePattern, deserializePatternData, serializePattern } from "@/lib/editor/pattern-serialize";
import { printedThreadCodeName } from "@/lib/export/a4-render";
import { buildPattern } from "@/lib/pipeline/pattern";
import { findThread, formatThreadName, type ThreadBrand } from "@/lib/threads/thread-brands";
import { EMPTY_CELL, type PaletteColor, type RGB, type StitchPattern } from "@/lib/types";
import { makePhotoLikeBuffer } from "./helpers/fixtures";

/** G-033 M1: every palette color's thread identity (`source`) through edits, generation, saved files and OXS (D122). */

const thread = (brand: ThreadBrand, code: string) => findThread(brand, code)!;
const threadColor = (brand: ThreadBrand, code: string): Partial<PaletteColor> & { rgb: RGB } => ({
  rgb: thread(brand, code).rgb,
  name: formatThreadName(thread(brand, code)),
  source: { brand, code },
});

function makePattern(colors: Array<Partial<PaletteColor> & { rgb: RGB }>, extra: Partial<StitchPattern> = {}): StitchPattern {
  const palette: PaletteColor[] = colors.map((c, i) => ({ index: i, symbol: String(i), name: `Color ${i}`, count: 1, ...c }));
  return { width: colors.length, height: 1, cellPalette: Uint8Array.from(colors.map((_, i) => i)), palette, isLandscape: true, ...extra };
}

describe("thread source through edits", () => {
  it("is set with the canonical code by a thread pick and by adding a thread", () => {
    const base = makePattern([{ rgb: [9, 9, 9] }]);
    expect(editColorToBrandColor(base, 0, "310", "dmc").palette[0].source).toEqual({ brand: "dmc", code: "310" });
    expect(addBrandColor(base, "403", "anchor").palette[1].source).toEqual({ brand: "anchor", code: "403" });
  });

  it("is dropped by a manual RGB edit, and absent from a newly added custom color", () => {
    const picked = editColorToBrandColor(makePattern([{ rgb: [9, 9, 9] }]), 0, "310", "dmc");
    const edited = editColorRgb(picked, 0, [1, 2, 3]);
    expect("source" in edited.palette[0]).toBe(false);
    expect(edited.palette[0].name).toBe(picked.palette[0].name);
    expect("source" in addColor(picked, [5, 5, 5]).palette[1]).toBe(false);
  });

  it("is kept by rename, symbol change and compaction, and merges keep the surviving color's identity", () => {
    const pattern = makePattern([threadColor("dmc", "310"), { rgb: [200, 10, 10], name: "Custom red" }]);
    expect(renameColor(pattern, 0, "Sky").palette[0].source).toEqual({ brand: "dmc", code: "310" });
    expect(setColorSymbol(pattern, 0, "Q").palette[0].source).toEqual({ brand: "dmc", code: "310" });
    const withUnused = {
      ...pattern,
      palette: [...pattern.palette, { index: 2, rgb: [1, 1, 1] as RGB, symbol: "Z", name: "Unused", count: 0 }],
    };
    expect(compactUnusedColors(withUnused).palette[0].source).toEqual({ brand: "dmc", code: "310" });
    // Thread into custom: the custom target survives without a source. Custom into thread: the thread survives.
    expect("source" in mergeColors(pattern, 0, 1).palette[0]).toBe(false);
    expect(mergeColors(pattern, 1, 0).palette[0].source).toEqual({ brand: "dmc", code: "310" });
    expect(mergeColors(pattern, 0, EMPTY_CELL).palette).toHaveLength(1);
  });

  it("restores RGB, name and source together, and a custom snapshot restores a custom color", () => {
    const pattern = makePattern([threadColor("dmc", "310")]);
    const snapshot = pattern.palette[0];
    const changed = editColorRgb(renameColor(pattern, 0, "Sky"), 0, [1, 2, 3]);
    expect(restoreColor(changed, 0, snapshot).palette[0]).toMatchObject({
      rgb: snapshot.rgb,
      name: snapshot.name,
      source: { brand: "dmc", code: "310" },
    });
    const custom = makePattern([{ rgb: [7, 7, 7], name: "Pebble" }]);
    const picked = editColorToBrandColor(custom, 0, "321", "dmc");
    const restored = restoreColor(picked, 0, custom.palette[0]).palette[0];
    expect(restored).toMatchObject({ rgb: [7, 7, 7], name: "Pebble" });
    expect("source" in restored).toBe(false);
  });

  it("never changes an earlier history state's source", () => {
    const first = editColorToBrandColor(makePattern([{ rgb: [9, 9, 9] }]), 0, "310", "dmc");
    const second = renameColor(first, 0, "Sky");
    const third = editColorToBrandColor(second, 0, "321", "dmc");
    editColorRgb(third, 0, [1, 2, 3]);
    expect(first.palette[0].source).toEqual({ brand: "dmc", code: "310" });
    expect(second.palette[0].source).toEqual({ brand: "dmc", code: "310" });
    expect(third.palette[0].source).toEqual({ brand: "dmc", code: "321" });
  });

  it("refuses custom colors and other brands' threads on a brand-locked pattern, and allows its own brand", () => {
    const locked = makePattern([threadColor("dmc", "310")], { threadBrand: "dmc" });
    expect(() => editColorRgb(locked, 0, [1, 2, 3])).toThrow("only DMC threads");
    expect(() => addColor(locked, [1, 2, 3])).toThrow("only DMC threads");
    expect(() => editColorToBrandColor(locked, 0, "403", "anchor")).toThrow("only DMC threads");
    expect(() => addBrandColor(locked, "600", "cosmo")).toThrow("only DMC threads");
    expect(() => restoreColor(locked, 0, { rgb: [1, 2, 3], name: "Custom" })).toThrow("only DMC threads");
    expect(editColorToBrandColor(locked, 0, "321", "dmc").palette[0].source).toEqual({ brand: "dmc", code: "321" });
  });
});

describe("thread source from generation", () => {
  const photo = makePhotoLikeBuffer(120, 80, 20);

  it("leaves full-range colors custom", () => {
    const pattern = buildPattern(photo, { longerSideStitches: 30, colorCount: 8 });
    expect(pattern.palette.every((color) => color.source === undefined)).toBe(true);
  });

  it.each(["dmc", "cosmo", "anchor"] as const)("gives every %s color a source naming exactly its thread", (brand) => {
    const pattern = buildPattern(photo, { longerSideStitches: 30, colorCount: 8, paletteMode: brand });
    expect(pattern.threadBrand).toBe(brand);
    for (const color of pattern.palette) {
      expect(color.source?.brand).toBe(brand);
      const catalogue = findThread(brand, color.source!.code);
      expect(catalogue?.code).toBe(color.source!.code);
      expect(formatThreadName(catalogue!)).toBe(color.name);
    }
  });
});

describe("thread source in saved files", () => {
  it("round-trips version 7 exactly: a renamed thread keeps its source, a custom color named like a thread stays custom", () => {
    const pattern = makePattern([
      { ...threadColor("dmc", "310"), name: "Sky" },
      { rgb: thread("dmc", "321").rgb, name: formatThreadName(thread("dmc", "321")) },
    ]);
    const restored = deserializePattern(serializePattern(pattern));
    expect(JSON.parse(serializePattern(pattern)).formatVersion).toBe(7);
    expect(restored.palette[0].source).toEqual({ brand: "dmc", code: "310" });
    expect("source" in restored.palette[1]).toBe(false);
  });

  const legacyFile = (palette: Array<{ rgb: RGB; name: string; source?: unknown }>, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      formatVersion: 6,
      width: palette.length,
      height: 1,
      isLandscape: true,
      cellPalette: palette.map((_, i) => i),
      palette: palette.map((c, i) => ({ symbol: String(i), ...c })),
      ...extra,
    });
  const named = (brand: ThreadBrand, code: string) => ({ rgb: thread(brand, code).rgb, name: formatThreadName(thread(brand, code)) });

  it("infers sources for an older locked file from exact thread names within its brand", () => {
    const restored = deserializePattern(legacyFile([named("dmc", "310"), named("dmc", "321")], { threadBrand: "dmc" }));
    expect(restored.threadBrand).toBe("dmc");
    expect(restored.palette.map((c) => c.source)).toEqual([
      { brand: "dmc", code: "310" },
      { brand: "dmc", code: "321" },
    ]);
    const anchor = deserializePattern(legacyFile([{ rgb: [0, 0, 0], name: "403" }], { threadBrand: "anchor" }));
    expect(anchor.palette[0].source).toEqual({ brand: "anchor", code: "403" });
    expect(deserializePattern(legacyFile([named("dmc", "310")], { dmcMode: true })).palette[0].source).toEqual({
      brand: "dmc",
      code: "310",
    });
  });

  it("clears the lock of an older file whose renamed color can't be matched, keeping the other sources", () => {
    const restored = deserializePattern(legacyFile([named("dmc", "310"), { rgb: [1, 2, 3], name: "My red" }], { threadBrand: "dmc" }));
    expect(restored.threadBrand).toBeUndefined();
    expect(restored.palette[0].source).toEqual({ brand: "dmc", code: "310" });
    expect("source" in restored.palette[1]).toBe(false);
  });

  it("never infers for an unlocked older file, even when the name and RGB match a thread", () => {
    expect("source" in deserializePattern(legacyFile([named("dmc", "310")])).palette[0]).toBe(false);
  });

  it("never infers for version 7 or later: absent means custom, and a lock without sources is cleared", () => {
    const v7 = deserializePattern(legacyFile([named("dmc", "310")], { formatVersion: 7, threadBrand: "dmc" }));
    expect("source" in v7.palette[0]).toBe(false);
    expect(v7.threadBrand).toBeUndefined();
    expect("source" in deserializePattern(legacyFile([named("dmc", "310")], { formatVersion: 99, threadBrand: "dmc" })).palette[0]).toBe(
      false
    );
  });

  it("drops malformed and unknown sources instead of rejecting the file, and restores the canonical code", () => {
    const junk: unknown[] = [
      "310",
      null,
      [],
      { brand: "rainbow", code: "1" },
      { brand: "dmc", code: "" },
      { brand: "dmc", code: "NOPE" },
      { brand: "dmc" },
    ];
    const restored = deserializePattern(
      legacyFile(
        junk.map((source) => ({ rgb: [1, 2, 3] as RGB, name: "x", source })),
        { formatVersion: 7 }
      )
    );
    expect(restored.palette.every((c) => !("source" in c))).toBe(true);
    const lower = deserializePattern(
      legacyFile([{ rgb: [255, 255, 255], name: "White", source: { brand: "dmc", code: "b5200" } }], { formatVersion: 7 })
    );
    expect(lower.palette[0].source).toEqual({ brand: "dmc", code: "B5200" });
  });

  it("treats an autosave record without formatVersion as legacy and one with it as explicit", () => {
    const record = {
      storeVersion: 1,
      width: 1,
      height: 1,
      isLandscape: true,
      cellPalette: Uint8Array.from([0]),
      palette: [{ symbol: "0", ...named("dmc", "310") }],
      threadBrand: "dmc",
    };
    expect(deserializePatternData(record).palette[0].source).toEqual({ brand: "dmc", code: "310" });
    const explicit = deserializePatternData({ ...record, formatVersion: 7 });
    expect("source" in explicit.palette[0]).toBe(false);
    expect(explicit.threadBrand).toBeUndefined();
  });
});

describe("thread source in OXS", () => {
  const chart = (items: string) =>
    `<chart><properties chartwidth="3" chartheight="1"/><palette><palette_item index="0" number="cloth" name="cloth" color="FFFFFF"/>${items}</palette><fullstitches><stitch x="0" y="0" palindex="1"/><stitch x="1" y="0" palindex="2"/><stitch x="2" y="0" palindex="3"/></fullstitches></chart>`;

  it("sets a canonical source for every thread entry, even when the colors aren't all one brand", () => {
    const { pattern } = parseOxs(
      chart(
        '<palette_item index="1" number="DMC b5200" name="Snow" color="FFFFFF"/><palette_item index="2" number="Madeira 2400" name="White" color="FEFEFE"/><palette_item index="3" number="anchor 403" name="Black" color="000000"/>'
      )
    );
    expect(pattern.threadBrand).toBeUndefined();
    expect(pattern.palette.map((c) => c.source)).toEqual([{ brand: "dmc", code: "B5200" }, undefined, { brand: "anchor", code: "403" }]);
  });

  it("exports thread numbers only from source: a renamed thread keeps its code, a thread-named custom color gets none", () => {
    const pattern = makePattern([
      { ...threadColor("dmc", "310"), name: "Sky" },
      { rgb: thread("dmc", "321").rgb, name: formatThreadName(thread("dmc", "321")) },
    ]);
    const numbers = [...serializeOxs(pattern).matchAll(/<palette_item index="[12]" number="([^"]*)"/g)].map((m) => m[1]);
    expect(numbers).toEqual(["DMC 310", ""]);
  });
});

describe("printedThreadCodeName", () => {
  it("prints the source's code, keeping a renamed thread's own name", () => {
    expect(printedThreadCodeName({ name: "310 - Black", source: { brand: "dmc", code: "310" } })).toEqual({ code: "310", name: "Black" });
    expect(printedThreadCodeName({ name: "Sky", source: { brand: "dmc", code: "310" } })).toEqual({ code: "310", name: "Sky" });
    expect(printedThreadCodeName({ name: "403", source: { brand: "anchor", code: "403" } })).toEqual({ code: "403", name: "" });
    expect(printedThreadCodeName({ name: "310 - Black" })).toEqual({ code: "310", name: "Black" });
  });
});
