import { describe, expect, it } from "vitest";
import {
  CURRENT_PROJECT_KEY,
  createMemoryKeyValueStore,
  createProjectStore,
  hashDataUrl,
  restoreProject,
  type KeyValueStore,
  type LegacyProjectSlot,
} from "@/lib/editor/project-store";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import { EMPTY_CELL, type PaletteColor, type RGB, type SourceImageRef, type StitchPattern } from "@/lib/types";

function makePattern(overrides: Partial<StitchPattern> = {}): StitchPattern {
  const colors: RGB[] = [
    [255, 0, 0],
    [0, 255, 0],
  ];
  const cells = [0, 1, EMPTY_CELL, 0];
  const palette: PaletteColor[] = colors.map((rgb, i) => ({
    index: i,
    rgb,
    symbol: String(i),
    name: `Color ${i}`,
    count: cells.filter((c) => c === i).length,
  }));
  return { width: 2, height: 2, cellPalette: Uint8Array.from(cells), palette, isLandscape: true, name: "test", ...overrides };
}

const PHOTO: SourceImageRef = {
  dataUrl: "data:image/png;base64,AAAA",
  naturalWidth: 20,
  naturalHeight: 20,
  cellSizePx: 10,
  offsetX: 0,
  offsetY: 0,
};
const OTHER_PHOTO: SourceImageRef = { ...PHOTO, dataUrl: "data:image/png;base64,BBBB" };

async function photoKeys(kv: KeyValueStore): Promise<string[]> {
  return (await kv.keys()).filter((k) => k.startsWith("photo:")).sort();
}

describe("project-store", () => {
  it("round-trips a pattern, recomputing counts and keeping name/brand/edge mode", async () => {
    const kv = createMemoryKeyValueStore();
    const store = createProjectStore(kv);
    // A lock means every color is that brand's thread (D122): DMC 310 and 321, with their sources.
    const unlocked = makePattern({ edgeMode: "crisp" });
    const threads = [
      { rgb: [0, 0, 0] as const, name: "310 - Black", code: "310" },
      { rgb: [199, 43, 59] as const, name: "321 - Red", code: "321" },
    ];
    await store.save({
      ...unlocked,
      threadBrand: "dmc",
      palette: unlocked.palette.map((color, i) => ({
        ...color,
        rgb: threads[i].rgb,
        name: threads[i].name,
        source: { brand: "dmc" as const, code: threads[i].code },
      })),
    });

    const { pattern, failure } = await store.load();
    expect(failure).toBeUndefined();
    expect(pattern).not.toBeNull();
    expect(Array.from(pattern!.cellPalette)).toEqual([0, 1, EMPTY_CELL, 0]);
    expect(pattern!.palette.map((c) => c.count)).toEqual([2, 1]);
    expect(pattern!.name).toBe("test");
    expect(pattern!.threadBrand).toBe("dmc");
    expect(pattern!.edgeMode).toBe("crisp");
    expect(pattern!.sourceImage).toBeUndefined();
  });

  it("keeps edgeMode crisp-plus through autosave (G-038)", async () => {
    const store = createProjectStore(createMemoryKeyValueStore());
    await store.save(makePattern({ edgeMode: "crisp-plus" }));
    const { pattern, failure } = await store.load();
    expect(failure).toBeUndefined();
    expect(pattern!.edgeMode).toBe("crisp-plus");
  });

  it("keeps backstitch through autosave, and leaves a chart without any unchanged (G-073)", async () => {
    // The record is assembled field by field, so a new pattern field is dropped unless it is named there.
    // This was: a reload lost every line, on the live build, while the editable save carried them fine.
    const lines = [
      { x1: 0, y1: 0, x2: 2, y2: 0, paletteIndex: 1 },
      { x1: 2, y1: 0, x2: 2, y2: 2, paletteIndex: 0 },
    ];
    const store = createProjectStore(createMemoryKeyValueStore());
    await store.save(makePattern({ backstitch: lines }));
    const { pattern, failure } = await store.load();
    expect(failure).toBeUndefined();
    expect(pattern!.backstitch).toEqual(lines);

    const plain = createProjectStore(createMemoryKeyValueStore());
    await plain.save(makePattern());
    expect((await plain.load()).pattern!.backstitch).toBeUndefined();
  });

  it("keeps the four photo sliders through autosave (G-074)", async () => {
    // Same trap as backstitch above: the record names every field by hand, so a chart reloaded after a
    // browser restart would forget what it was generated from.
    const photoAdjust = { brightness: 25, contrast: -40, saturation: 60, temperature: -15 };
    const store = createProjectStore(createMemoryKeyValueStore());
    await store.save(makePattern({ photoAdjust }));
    expect((await store.load()).pattern!.photoAdjust).toEqual(photoAdjust);

    const plain = createProjectStore(createMemoryKeyValueStore());
    await plain.save(makePattern());
    expect((await plain.load()).pattern!.photoAdjust).toBeUndefined();
  });

  it("stores cellPalette as the typed array itself, not a JSON number array", async () => {
    const kv = createMemoryKeyValueStore();
    await createProjectStore(kv).save(makePattern());
    const record = (await kv.get(CURRENT_PROJECT_KEY)) as { cellPalette: unknown };
    expect(record.cellPalette).toBeInstanceOf(Uint8Array);
  });

  it("stores the source photo once, keyed by content, and restores it with the pattern", async () => {
    const kv = createMemoryKeyValueStore();
    const store = createProjectStore(kv);
    const first = makePattern({ sourceImage: PHOTO });
    await store.save(first);
    await store.save({ ...first, name: "edited" }); // an edit that keeps the same photo
    await store.save({ ...first, name: "edited twice", sourceImage: { ...PHOTO, offsetX: 3 } }); // Move tool: same photo bytes, new offset

    expect(await photoKeys(kv)).toHaveLength(1);
    expect(await photoKeys(kv)).toEqual([`photo:${await hashDataUrl(PHOTO.dataUrl)}`]);
    const record = JSON.stringify(await kv.get(CURRENT_PROJECT_KEY));
    expect(record).not.toContain(PHOTO.dataUrl); // the record references the photo, it doesn't embed it

    const { pattern } = await store.load();
    expect(pattern!.sourceImage).toEqual({ ...PHOTO, offsetX: 3 });
  });

  it("prunes a photo no longer referenced after a new photo is saved", async () => {
    const kv = createMemoryKeyValueStore();
    const store = createProjectStore(kv);
    await store.save(makePattern({ sourceImage: PHOTO }));
    await store.save(makePattern({ sourceImage: OTHER_PHOTO }));
    expect(await photoKeys(kv)).toEqual([`photo:${await hashDataUrl(OTHER_PHOTO.dataUrl)}`]);
  });

  it("clears the slot and every photo when saved null", async () => {
    const kv = createMemoryKeyValueStore();
    const store = createProjectStore(kv);
    await store.save(makePattern({ sourceImage: PHOTO }));
    await store.save(null);
    expect(kv.size()).toBe(0);
    expect(await store.load()).toEqual({ pattern: null });
  });

  it("returns a failure (and clears the slot) for a corrupt record instead of throwing or returning a broken pattern", async () => {
    const kv = createMemoryKeyValueStore();
    await kv.put(CURRENT_PROJECT_KEY, {
      storeVersion: 1,
      width: 2,
      height: 2,
      cellPalette: Uint8Array.from([0, 9, 0, 0]),
      palette: [{ rgb: [0, 0, 0], symbol: "x", name: "A" }],
    });
    const store = createProjectStore(kv);

    const result = await store.load();
    expect(result.pattern).toBeNull();
    expect(result.failure?.error).toBeInstanceOf(Error);
    expect(result.failure?.payload).toContain('"width":2'); // the exact stored content, for the error report
    expect(await kv.get(CURRENT_PROJECT_KEY)).toBeUndefined(); // won't fail again on the next load
    expect(await store.load()).toEqual({ pattern: null });
  });

  it("rejects a record from an unknown store version rather than guessing at its shape", async () => {
    const kv = createMemoryKeyValueStore();
    await kv.put(CURRENT_PROJECT_KEY, {
      storeVersion: 99,
      width: 1,
      height: 1,
      cellPalette: Uint8Array.from([0]),
      palette: [{ rgb: [0, 0, 0], symbol: "x", name: "A" }],
    });
    const result = await createProjectStore(kv).load();
    expect(result.pattern).toBeNull();
    expect(String(result.failure?.error)).toMatch(/version 99/);
  });

  it("drops only sourceImage when the referenced photo is missing -- the grid is still perfectly valid", async () => {
    const kv = createMemoryKeyValueStore();
    const store = createProjectStore(kv);
    await store.save(makePattern({ sourceImage: PHOTO }));
    for (const key of await photoKeys(kv)) await kv.delete(key);

    const { pattern, failure } = await store.load();
    expect(failure).toBeUndefined();
    expect(pattern!.sourceImage).toBeUndefined();
    expect(pattern!.width).toBe(2);
  });

  it("propagates a storage write failure so the UI can show autosave as unavailable", async () => {
    const kv = createMemoryKeyValueStore();
    const failing: KeyValueStore = {
      ...kv,
      put: async () => {
        throw new Error("QuotaExceededError");
      },
    };
    await expect(createProjectStore(failing).save(makePattern())).rejects.toThrow("QuotaExceededError");
  });

  it("hashes identical photos identically and different photos differently", async () => {
    expect(await hashDataUrl(PHOTO.dataUrl)).toBe(await hashDataUrl(PHOTO.dataUrl.slice()));
    expect(await hashDataUrl(PHOTO.dataUrl)).not.toBe(await hashDataUrl(OTHER_PHOTO.dataUrl));
  });

  describe("restoreProject (one-time migration off localStorage)", () => {
    function legacy(initial: string | null): LegacyProjectSlot & { value: string | null } {
      const slot = {
        value: initial,
        read: () => slot.value,
        clear: () => {
          slot.value = null;
        },
      };
      return slot;
    }

    it("prefers the IndexedDB slot when it has a project", async () => {
      const kv = createMemoryKeyValueStore();
      const store = createProjectStore(kv);
      await store.save(makePattern({ name: "from-idb" }));
      const slot = legacy(serializePattern(makePattern({ name: "from-legacy" })));

      const { pattern } = await restoreProject(store, slot);
      expect(pattern!.name).toBe("from-idb");
      expect(slot.value).not.toBeNull(); // untouched: nothing was migrated
    });

    it("migrates a legacy localStorage project into the store and clears the old slot", async () => {
      const kv = createMemoryKeyValueStore();
      const store = createProjectStore(kv);
      const slot = legacy(serializePattern(makePattern({ name: "from-legacy", sourceImage: PHOTO })));

      const { pattern } = await restoreProject(store, slot);
      expect(pattern!.name).toBe("from-legacy");
      expect(pattern!.sourceImage).toEqual(PHOTO);
      expect(slot.value).toBeNull();
      expect((await store.load()).pattern?.name).toBe("from-legacy");
    });

    it("reports a corrupt legacy slot as a failure with its raw content, and clears it", async () => {
      const store = createProjectStore(createMemoryKeyValueStore());
      const slot = legacy("{not json");

      const result = await restoreProject(store, slot);
      expect(result.pattern).toBeNull();
      expect(result.failure?.payload).toBe("{not json");
      expect(slot.value).toBeNull();
    });

    it("returns an empty result when neither slot has anything", async () => {
      expect(await restoreProject(createProjectStore(createMemoryKeyValueStore()), legacy(null))).toEqual({ pattern: null });
    });
  });
});
