import JSZip from "jszip";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPatternFromFile } from "@/lib/editor/pattern-import";
import { deserializePattern, FORMAT_VERSION, parsePatternDocument, readSymmetry, serializePattern } from "@/lib/editor/pattern-serialize";
import { createMemoryKeyValueStore, createProjectStore } from "@/lib/editor/project-store";
import { NO_SYMMETRY, type SymmetryAxes } from "@/lib/editor/symmetry";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";

/** G-037 criterion 1: symmetry is saved with the document and restored when it opens (D138). */

function makePattern(width: number, height: number): StitchPattern {
  const colors: RGB[] = [
    [10, 20, 30],
    [200, 100, 50],
  ];
  const cellPalette = Uint8Array.from({ length: width * height }, (_, i) => i % 2);
  const palette: PaletteColor[] = colors.map((rgb, index) => ({
    index,
    rgb,
    symbol: String(index),
    name: `Color ${index}`,
    count: cellPalette.filter((v) => v === index).length,
  }));
  return { width, height, cellPalette, palette, isLandscape: width >= height, name: "sym" };
}

const axes = (on: Partial<SymmetryAxes>): SymmetryAxes => ({ ...NO_SYMMETRY, ...on });

describe("symmetry in the editable JSON", () => {
  it("round-trips every combination on a square canvas", () => {
    const pattern = makePattern(6, 6);
    for (let mask = 0; mask < 16; mask++) {
      const symmetry = axes({ vertical: !!(mask & 1), horizontal: !!(mask & 2), diagonal: !!(mask & 4), antidiagonal: !!(mask & 8) });
      expect(parsePatternDocument(serializePattern(pattern, symmetry)).symmetry).toEqual(symmetry);
    }
  });

  it("writes no field when every axis is off, so the file is identical to one saved before G-037", () => {
    const pattern = makePattern(5, 4);
    const off = serializePattern(pattern, NO_SYMMETRY);
    expect(off).toBe(serializePattern(pattern));
    expect(JSON.parse(off)).not.toHaveProperty("symmetry");
    const on = JSON.parse(serializePattern(pattern, axes({ vertical: true })));
    expect(on.symmetry).toEqual({ vertical: true });
    const { symmetry: _symmetry, ...rest } = on;
    void _symmetry;
    expect(rest).toEqual(JSON.parse(off));
  });

  it("keeps the format version: the field is optional and older builds ignore it", () => {
    const withField = JSON.parse(serializePattern(makePattern(4, 4), axes({ diagonal: true })));
    expect(withField.formatVersion).toBe(FORMAT_VERSION);
    expect(FORMAT_VERSION).toBe(7);
    // The existing parser still reads the file and ignores the field.
    expect(deserializePattern(JSON.stringify(withField)).width).toBe(4);
  });

  it("opens with symmetry off when the field is missing or unreadable, without an error", () => {
    const base = JSON.parse(serializePattern(makePattern(4, 4)));
    for (const bad of [undefined, null, true, "vertical", 3, ["vertical"], { vertical: "yes" }, { vertical: 1 }, {}]) {
      const json = JSON.stringify(bad === undefined ? base : { ...base, symmetry: bad });
      expect(parsePatternDocument(json).symmetry, JSON.stringify(bad)).toEqual(NO_SYMMETRY);
    }
    expect(readSymmetry({ vertical: true, unknown: true }, 4, 4)).toEqual(axes({ vertical: true }));
  });

  it("turns diagonals off when the saved canvas isn't square, keeping the straight axes", () => {
    const pattern = makePattern(6, 4);
    const json = JSON.parse(serializePattern(pattern));
    json.symmetry = { horizontal: true, diagonal: true, antidiagonal: true };
    expect(parsePatternDocument(JSON.stringify(json)).symmetry).toEqual(axes({ horizontal: true }));
    // And a diagonal is never written for a non-square pattern.
    expect(JSON.parse(serializePattern(pattern, axes({ diagonal: true }))).symmetry).toBeUndefined();
  });
});

describe("symmetry in the autosaved project", () => {
  it("saves and restores the axes with the pattern", async () => {
    const store = createProjectStore(createMemoryKeyValueStore());
    const pattern = makePattern(5, 5);
    await store.save(pattern, axes({ vertical: true, antidiagonal: true }));
    const loaded = await store.load();
    expect(loaded.pattern?.width).toBe(5);
    expect(loaded.symmetry).toEqual(axes({ vertical: true, antidiagonal: true }));
  });

  it("restores symmetry off for a record without it, and after saving with none on", async () => {
    const kv = createMemoryKeyValueStore();
    const store = createProjectStore(kv);
    await store.save(makePattern(5, 5));
    expect((await store.load()).symmetry).toEqual(NO_SYMMETRY);
    await store.save(makePattern(5, 5), axes({ horizontal: true }));
    await store.save(makePattern(5, 5), NO_SYMMETRY);
    expect((await store.load()).symmetry).toEqual(NO_SYMMETRY);
  });
});

describe("symmetry when opening files", () => {
  it("restores it from a JSON file and from the JSON inside a .cspzip", async () => {
    const pattern = makePattern(6, 6);
    const symmetry = axes({ vertical: true, diagonal: true });
    const json = serializePattern(pattern, symmetry);
    expect((await loadPatternFromFile(new File([json], "sym.json"))).symmetry).toEqual(symmetry);
    const zip = new JSZip();
    zip.file("sym_editable.json", json);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const fromZip = await loadPatternFromFile(new File([bytes], "sym.cspzip"));
    expect(fromZip.format).toBe("zip");
    expect(fromZip.symmetry).toEqual(symmetry);
  });

  it("opens an .oxs import with symmetry off", async () => {
    const oxs = readFileSync(path.join(__dirname, "..", "e2e", "fixtures", "sample.oxs"));
    const loaded = await loadPatternFromFile(new File([oxs], "sample.oxs"));
    expect(loaded.format).toBe("oxs");
    expect(loaded.symmetry).toEqual(NO_SYMMETRY);
  });
});
