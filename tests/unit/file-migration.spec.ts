import path from "node:path";
import { describe, expect, it } from "vitest";
import { flatten } from "@/lib/document/convert";
import { FLAT_FORMAT_VERSION, FORMAT_VERSION, fileVersion, migrateToCurrent } from "@/lib/document/migrate";
import { setFabric } from "@/lib/editor/pattern-edit";
import { deserializePattern, parsePatternDocument, readFabric, serializePattern } from "@/lib/editor/pattern-serialize";
import { decodeRecord } from "@/lib/editor/project-store";
import { NO_SYMMETRY } from "@/lib/editor/symmetry-axes";
import { exportWithRust } from "@/processor/rust-jobs";
import { formatThreadName } from "@/lib/threads/thread-brands";
import { seededColors } from "./helpers/thread-systems";
import type { StitchPattern } from "@/lib/types";

/**
 * G-094: the file. One migration step for every earlier version, a later one refused; a file re-saved is the file that was
 * opened, byte for byte; a chart's fabric travels in it; and the Rust writer writes the same bytes.
 */

process.env.CS_JOB_BINARY = path.join(
  __dirname,
  "..",
  "..",
  "rust",
  "target",
  "release",
  process.platform === "win32" ? "cs-job.exe" : "cs-job"
);

const dmc = seededColors("dmc");
const cells = [0, 1, 0, 1, 255, 0];

/** A chart of one layer exactly as the current version writes it (format 7, G-130 D390), with every optional field, in the writer's order. */
const CURRENT_FULL =
  `{"formatVersion":7,"width":3,"height":2,"isLandscape":true,"cellPalette":[${cells.join(",")}],` +
  `"palette":[{"rgb":[200,30,40],"symbol":"A","name":"${formatThreadName(dmc[0])}","source":{"brand":"dmc","code":"${dmc[0].code}"}},` +
  `{"rgb":[10,20,30],"symbol":"B","name":"Mine"}],` +
  `"name":"Full","edgeMode":"crisp","photoAdjust":{"brightness":25,"contrast":0,"saturation":-50,"temperature":0},"vivid":true,` +
  `"symmetry":{"vertical":true},"backstitch":[{"x1":0,"y1":0,"x2":2,"y2":2,"paletteIndex":1}],"cellKind":[0,1,0,2,0,0]}`;

const CURRENT_PLAIN = `{"formatVersion":7,"width":3,"height":2,"isLandscape":true,"cellPalette":[${cells.join(",")}],"palette":[{"rgb":[200,30,40],"symbol":"A","name":"One"},{"rgb":[10,20,30],"symbol":"B","name":"Two"}]}`;

const resave = (text: string) => {
  const { pattern, symmetry } = parsePatternDocument(text);
  return serializePattern(pattern, symmetry);
};

describe("a chart of one layer, written as format 7", () => {
  it("re-saves as the same bytes, with every optional field and with none", () => {
    // The photo sliders are read through their own check; this guards the test's own fixture against a renamed field.
    expect(deserializePattern(CURRENT_FULL).photoAdjust).toBeDefined();
    expect(resave(CURRENT_FULL)).toBe(CURRENT_FULL);
    expect(resave(CURRENT_PLAIN)).toBe(CURRENT_PLAIN);
  });

  it("is handed on untouched by the migration step when it is of the current version", () => {
    const data = { formatVersion: FORMAT_VERSION, width: 1, height: 1, palette: [], layers: [] } as Record<string, unknown>;
    expect(migrateToCurrent(data)).toBe(data);
  });
});

describe("a file of an earlier version", () => {
  it("says which version it is, and one with no version, or one that is not a number, is the first", () => {
    expect(fileVersion({ formatVersion: 4 })).toBe(4);
    expect(fileVersion({})).toBe(1);
    expect(fileVersion({ formatVersion: "7" })).toBe(1);
    expect(fileVersion({ formatVersion: 0 })).toBe(1);
  });

  it("from before thread brands: the one-brand flag becomes the brand, and every colour gets its thread by name", () => {
    const old = {
      formatVersion: 4,
      width: 3,
      height: 2,
      isLandscape: true,
      cellPalette: cells,
      dmcMode: true,
      palette: [
        { rgb: dmc[0].rgb, symbol: "A", name: formatThreadName(dmc[0]) },
        { rgb: dmc[1].rgb, symbol: "B", name: formatThreadName(dmc[1]) },
      ],
    };
    const migrated = migrateToCurrent(old);
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated.threadBrand).toBe("dmc");
    const pattern = deserializePattern(JSON.stringify(old));
    expect(pattern.threadBrand).toBe("dmc");
    expect(pattern.palette.map((c) => c.source)).toEqual([
      { brand: "dmc", code: dmc[0].code },
      { brand: "dmc", code: dmc[1].code },
    ]);
    // Saved again it is a current file, and that file re-saves as itself.
    const saved = serializePattern(pattern);
    expect(JSON.parse(saved).formatVersion).toBe(FLAT_FORMAT_VERSION);
    expect(resave(saved)).toBe(saved);
  });

  it("with a colour that is not one of its brand's: the colour stays custom and the chart keeps its brand, which locks nothing (D395)", () => {
    const old = {
      formatVersion: 6,
      width: 3,
      height: 2,
      isLandscape: true,
      cellPalette: cells,
      threadBrand: "dmc",
      palette: [
        { rgb: dmc[0].rgb, symbol: "A", name: formatThreadName(dmc[0]) },
        { rgb: [1, 2, 3], symbol: "B", name: "Not a thread" },
      ],
    };
    const pattern = deserializePattern(JSON.stringify(old));
    expect(pattern.threadBrand).toBe("dmc");
    expect(pattern.palette[0].source).toEqual({ brand: "dmc", code: dmc[0].code });
    expect(pattern.palette[1].source).toBeUndefined();
  });

  it("does not have the old file's data changed under it", () => {
    const old = { formatVersion: 4, dmcMode: true, palette: [{ name: formatThreadName(dmc[0]) }] };
    const before = JSON.stringify(old);
    migrateToCurrent(old);
    expect(JSON.stringify(old)).toBe(before);
  });

  it("as an autosaved record without a version is read the same way", () => {
    const record = {
      storeVersion: 1,
      width: 3,
      height: 2,
      isLandscape: true,
      cellPalette: Uint8Array.from(cells),
      threadBrand: "dmc",
      palette: [
        { rgb: dmc[0].rgb, symbol: "A", name: formatThreadName(dmc[0]) },
        { rgb: dmc[1].rgb, symbol: "B", name: formatThreadName(dmc[1]) },
      ],
    };
    expect(decodeRecord(record, undefined).palette[1].source).toEqual({ brand: "dmc", code: dmc[1].code });
  });
});

describe("a file of a later version", () => {
  it("is refused by name, as a file and as an autosaved record", () => {
    const later = CURRENT_PLAIN.replace('"formatVersion":7', '"formatVersion":9');
    expect(() => deserializePattern(later)).toThrow(
      "That file was saved by a newer version of this app (format 9; this one reads up to 8). Reload the page to get the latest version, then open it again."
    );
    expect(() => decodeRecord({ ...JSON.parse(later), storeVersion: 1 }, undefined)).toThrow(/newer version of this app/);
  });
});

describe("a chart's fabric", () => {
  const plain = deserializePattern(CURRENT_PLAIN);

  it("is absent from a chart that was never given one, in memory and in the file", () => {
    expect("fabric" in plain).toBe(false);
    expect(serializePattern(plain)).not.toContain("fabric");
  });

  it("is written last, read back, and re-saved as the same bytes", () => {
    const withFabric = setFabric(plain, { count: 16, unit: "in" });
    const saved = serializePattern(withFabric);
    expect(saved.endsWith(',"fabric":{"count":16,"unit":"in"}}')).toBe(true);
    expect(deserializePattern(saved).fabric).toEqual({ count: 16, unit: "in" });
    expect(resave(saved)).toBe(saved);
  });

  it("is the same chart when nothing differs, so choosing the value already chosen is no change", () => {
    const once = setFabric(plain, { count: 14, unit: "cm" });
    expect(setFabric(once, { count: 14, unit: "cm" })).toBe(once);
    expect(setFabric(once, { count: 18, unit: "cm" })).not.toBe(once);
    expect(plain.fabric).toBeUndefined();
  });

  it("that is not a count above zero with a unit is dropped, and the chart still opens", () => {
    for (const bad of [
      null,
      14,
      {},
      { count: 0, unit: "cm" },
      { count: -3, unit: "in" },
      { count: "14", unit: "cm" },
      { count: 14, unit: "mm" },
    ]) {
      expect(readFabric(bad), JSON.stringify(bad)).toBeUndefined();
    }
    const opened = deserializePattern(CURRENT_PLAIN.replace(/}$/, ',"fabric":{"count":14,"unit":"furlong"}}'));
    expect(opened.fabric).toBeUndefined();
    expect(opened.width).toBe(3);
  });

  it("and the chart with its photo come back from the autosave record as the same file, byte for byte", async () => {
    const { createProjectStore } = await import("@/lib/editor/project-store");
    const kept = new Map<string, unknown>();
    const store = createProjectStore({
      get: async (key) => kept.get(key),
      put: async (key, value) => void kept.set(key, value),
      delete: async (key) => void kept.delete(key),
      keys: async () => [...kept.keys()],
    });
    const sourceImage = {
      dataUrl: "data:image/png;base64,AAAA",
      naturalWidth: 30,
      naturalHeight: 20,
      cellSizePx: 10,
      offsetX: 0,
      offsetY: 0,
    };
    const chart = setFabric({ ...deserializePattern(CURRENT_FULL), sourceImage }, { count: 16, unit: "in" });
    await store.save(chart, NO_SYMMETRY);
    const loaded = await store.load();
    expect(serializePattern(flatten(loaded.document!), NO_SYMMETRY)).toBe(serializePattern(chart, NO_SYMMETRY));
  });

  it("survives the autosave record", async () => {
    const { createProjectStore } = await import("@/lib/editor/project-store");
    const kept = new Map<string, unknown>();
    const store = createProjectStore({
      get: async (key) => kept.get(key),
      put: async (key, value) => void kept.set(key, value),
      delete: async (key) => void kept.delete(key),
      keys: async () => [...kept.keys()],
    });
    await store.save(setFabric(plain, { count: 18, unit: "cm" }), NO_SYMMETRY);
    const loaded = await store.load();
    expect(loaded.document?.properties.fabric).toEqual({ count: 18, unit: "cm" });
  });
});

describe("the editable file the server writes (Rust)", () => {
  const save = async (pattern: StitchPattern) => {
    const result = await exportWithRust(
      {
        kind: "editable",
        pattern,
        baseName: "chart",
        aidaCount: 14,
        sizeUnit: "cm",
        authorName: "",
        overlapCells: 0,
        stitchTexture: "classic",
      } as Parameters<typeof exportWithRust>[0],
      NO_SYMMETRY,
      () => {}
    );
    return new TextDecoder().decode(result.bytes);
  };

  it("is byte for byte the one the editor writes: with every field, with none, and with a fabric", async () => {
    const full = deserializePattern(CURRENT_FULL);
    for (const pattern of [full, deserializePattern(CURRENT_PLAIN), setFabric(full, { count: 11, unit: "in" })]) {
      expect(await save(pattern)).toBe(serializePattern(pattern, NO_SYMMETRY));
    }
    // Until G-094 the server's writer dropped what no export reads; these are the fields it lost.
    const written = await save(full);
    expect(written).toContain('"photoAdjust":');
    expect(written).toContain('"vivid":true');
  });
});
