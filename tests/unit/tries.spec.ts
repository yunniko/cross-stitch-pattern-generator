import { describe, expect, it } from "vitest";
import { createMemoryKeyValueStore } from "../../lib/editor/project-store";
import {
  addTry,
  deleteTry,
  inOrder,
  isTry,
  parseTrySettings,
  pinTry,
  PINNED_TRIES,
  RECENT_TRIES,
  trySettingsOf,
  trySummary,
  unpinTry,
  type Try,
  type TryMeta,
} from "../../lib/editor/tries";
import { createTriesStore } from "../../lib/editor/tries-store";
import { DEFAULT_OPTIONS } from "../../lib/editor/workspace-storage";
import { GENERATION_SETTINGS } from "../../lib/pipeline/generation-settings";
import { EMPTY_CELL, type StitchPattern } from "../../lib/types";

/** G-095 M4, D298: the tries. What is kept and what gives way, and that they come back from the store as they went in. */

const meta = (number: number, pinned = false): TryMeta => ({ id: `t${number}`, number, madeAt: number, recentSince: number, pinned });
const numbers = (tries: readonly TryMeta[]) => inOrder(tries).map((entry) => entry.number);

function chart(width: number, height: number, fill: number): StitchPattern {
  return {
    width,
    height,
    isLandscape: width >= height,
    cellPalette: new Uint8Array(width * height).fill(fill),
    palette: [
      { index: 0, rgb: [200, 30, 30], symbol: "a", name: "Red", count: 0 },
      { index: 1, rgb: [30, 30, 200], symbol: "b", name: "Blue", count: 0 },
    ],
  };
}

describe("what is kept", () => {
  it("the five most recent, and the sixth pushes out the oldest", () => {
    let tries: TryMeta[] = [];
    for (let n = 1; n <= RECENT_TRIES; n++) tries = addTry(tries, meta(n)).tries;
    expect(numbers(tries)).toEqual([1, 2, 3, 4, 5]);
    const sixth = addTry(tries, meta(6));
    expect(numbers(sixth.tries)).toEqual([2, 3, 4, 5, 6]);
    expect(sixth.dropped.map((entry) => entry.number)).toEqual([1]);
  });

  it("a pinned try is beside the five, not one of them", () => {
    let tries: TryMeta[] = [meta(1, true), meta(2, true)];
    for (let n = 3; n <= 8; n++) tries = addTry(tries, meta(n)).tries;
    // Two pinned, and the five most recent of the six others.
    expect(numbers(tries)).toEqual([1, 2, 4, 5, 6, 7, 8]);
  });

  it("at most five are pinned: the sixth pin is refused with the reason, and nothing changes", () => {
    const tries = [1, 2, 3, 4, 5].map((n) => meta(n, true)).concat(meta(6));
    const result = pinTry(tries, "t6");
    expect("refused" in result && result.refused).toMatch(/5 tries are pinned already/);
    const four = pinTry(tries.slice(1), "t6");
    expect("tries" in four && four.tries.filter((entry) => entry.pinned)).toHaveLength(PINNED_TRIES);
  });

  it("pinning takes a try out of the five, which makes room for nothing by itself", () => {
    const tries = [1, 2, 3, 4, 5].map((n) => meta(n));
    const pinned = pinTry(tries, "t1");
    expect("tries" in pinned && numbers(pinned.tries)).toEqual([1, 2, 3, 4, 5]);
    // The next one made now drops nothing: four recent and one pinned were kept.
    const next = "tries" in pinned ? addTry(pinned.tries, meta(6)) : null;
    expect(next?.dropped).toEqual([]);
    expect(numbers(next!.tries)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("unpinning makes a try the most recent, so it is not lost on the spot; the oldest of the others gives way", () => {
    const tries = [meta(1, true), ...[2, 3, 4, 5, 6].map((n) => meta(n))];
    const result = unpinTry(tries, "t1", 100);
    expect(numbers(result.tries)).toEqual([1, 3, 4, 5, 6]);
    expect(result.dropped.map((entry) => entry.number)).toEqual([2]);
    expect(result.tries.find((entry) => entry.id === "t1")).toMatchObject({ pinned: false, recentSince: 100 });
  });

  it("deleting removes the one asked for, pinned or not", () => {
    expect(numbers(deleteTry([meta(1, true), meta(2)], "t1"))).toEqual([2]);
    expect(numbers(deleteTry([meta(1, true), meta(2)], "nothing"))).toEqual([1, 2]);
  });
});

describe("the settings a try was made with", () => {
  it("are every generation setting the editor keeps, and how the size and the colours were being chosen", () => {
    const kept = Object.keys(trySettingsOf(DEFAULT_OPTIONS)).sort();
    const declared = GENERATION_SETTINGS.map((setting) => setting.id).filter((id) => id in DEFAULT_OPTIONS);
    expect(kept).toEqual([...declared, "sizePreset", "customSize", "paletteSetup", "generationExtras"].sort());
  });

  it("carry the values as they stood", () => {
    const settings = trySettingsOf({
      ...DEFAULT_OPTIONS,
      colorCount: 9,
      paletteMode: "dmc",
      sizePreset: "custom",
      customSize: 77,
      vivid: true,
    });
    expect(settings).toMatchObject({ colorCount: 9, paletteMode: "dmc", sizePreset: "custom", customSize: 77, vivid: true });
  });

  it("read back from storage: a name the editor does not have, or a value of the wrong kind, is dropped", () => {
    expect(parseTrySettings({ colorCount: 12, vivid: "yes", authorName: "x", nonsense: 1, photoAdjust: null, paletteMode: "dmc" })).toEqual(
      {
        colorCount: 12,
        paletteMode: "dmc",
      }
    );
    expect(parseTrySettings(null)).toEqual({});
    expect(parseTrySettings([1, 2])).toEqual({});
  });
});

describe("which try the chart on screen is", () => {
  const made = chart(4, 3, 0);

  it("is that try while its stitches, threads and backstitch are untouched, whatever else was set on the chart", () => {
    expect(isTry({ ...made, name: "renamed", fabric: { count: 14, unit: "cm" } }, made)).toBe(true);
  });

  it("is still that try when read back as an equal chart, as after a reload", () => {
    expect(isTry(structuredClone(made), made)).toBe(true);
  });

  it("is not once a stitch, the size, a thread or the backstitch differs", () => {
    const painted = { ...made, cellPalette: Uint8Array.from(made.cellPalette) };
    painted.cellPalette[5] = 1;
    expect(isTry(painted, made)).toBe(false);
    expect(isTry(chart(3, 4, 0), made)).toBe(false);
    expect(isTry({ ...made, palette: made.palette.slice(0, 1) }, made)).toBe(false);
    expect(isTry({ ...made, backstitch: [{ x1: 0, y1: 0, x2: 1, y2: 1, paletteIndex: 0 }] }, made)).toBe(false);
    expect(isTry(null, made)).toBe(false);
  });
});

describe("a try in a line", () => {
  it("says its size, its colours, and the brand or the palette they were chosen from", () => {
    const pattern = chart(120, 90, 0);
    expect(trySummary({ pattern, settings: { paletteMode: "full" } })).toBe("120 × 90 · 2 colours");
    expect(trySummary({ pattern, settings: { paletteMode: "dmc" } })).toBe("120 × 90 · 2 colours · DMC");
    expect(trySummary({ pattern, settings: { paletteMode: "dmc", paletteSetup: true } })).toBe("120 × 90 · 2 colours · your palette");
  });
});

describe("the tries in the store", () => {
  const PHOTO = "data:image/png;base64,AAAA";
  const aTry = (number: number, fill: number, pinned = false): Try => ({
    ...meta(number, pinned),
    settings: { colorCount: 10 + number, paletteMode: "dmc" },
    pattern: {
      ...chart(6, 4, fill),
      sourceImage: { dataUrl: PHOTO, naturalWidth: 60, naturalHeight: 40, cellSizePx: 10, offsetX: 0, offsetY: 0 },
    },
  });

  it("come back as they went in: order, pins, settings, stitches and the photo in hand", async () => {
    const store = createTriesStore(createMemoryKeyValueStore());
    const tries = [aTry(1, 0, true), aTry(2, 1), aTry(3, EMPTY_CELL)];
    await store.save({ photoKey: "photo:abc", nextNumber: 4, tries }, { made: tries });

    const read = await store.loadFor("photo:abc", PHOTO);
    expect(read.nextNumber).toBe(4);
    expect(read.tries.map(({ number, pinned, settings }) => ({ number, pinned, settings }))).toEqual([
      { number: 1, pinned: true, settings: { colorCount: 11, paletteMode: "dmc" } },
      { number: 2, pinned: false, settings: { colorCount: 12, paletteMode: "dmc" } },
      { number: 3, pinned: false, settings: { colorCount: 13, paletteMode: "dmc" } },
    ]);
    for (let i = 0; i < tries.length; i++) {
      expect(isTry(read.tries[i].pattern, tries[i].pattern), `try ${i + 1}`).toBe(true);
      expect(read.tries[i].pattern.sourceImage?.dataUrl).toBe(PHOTO);
    }
  });

  it("the photo itself is not stored a second time with them", async () => {
    const kv = createMemoryKeyValueStore();
    const store = createTriesStore(kv);
    const made = aTry(1, 0);
    await store.save({ photoKey: "photo:abc", nextNumber: 2, tries: [made] }, { made: [made] });
    for (const key of await kv.keys()) expect(JSON.stringify(await kv.get(key))).not.toContain(PHOTO);
  });

  it("a try dropped is gone from the store, and its chart with it", async () => {
    const kv = createMemoryKeyValueStore();
    const store = createTriesStore(kv);
    const tries = [aTry(1, 0), aTry(2, 1)];
    await store.save({ photoKey: "photo:abc", nextNumber: 3, tries }, { made: tries });
    await store.save({ photoKey: "photo:abc", nextNumber: 3, tries: [tries[1]] }, { dropped: ["t1"] });
    expect((await kv.keys()).sort()).toEqual(["tries", "try:t2"]);
    expect((await store.loadFor("photo:abc", PHOTO)).tries.map((entry) => entry.number)).toEqual([2]);
  });

  it("tries of another photo are dropped when a photo is taken up, and the count starts again", async () => {
    const kv = createMemoryKeyValueStore();
    const store = createTriesStore(kv);
    const tries = [aTry(1, 0, true), aTry(2, 1)];
    await store.save({ photoKey: "photo:abc", nextNumber: 3, tries }, { made: tries });
    expect(await store.loadFor("photo:other", PHOTO)).toEqual({ photoKey: "photo:other", nextNumber: 1, tries: [] });
    expect(await kv.keys()).toEqual([]);
  });

  it("a try whose chart cannot be read is left out, and the others come back", async () => {
    const kv = createMemoryKeyValueStore();
    const store = createTriesStore(kv);
    const tries = [aTry(1, 0), aTry(2, 1)];
    await store.save({ photoKey: "photo:abc", nextNumber: 3, tries }, { made: tries });
    await kv.put("try:t1", { storeVersion: 99 });
    const read = await store.loadFor("photo:abc", PHOTO);
    expect(read.tries.map((entry) => entry.number)).toEqual([2]);
    // The number of the one that was lost is not handed out again.
    expect(read.nextNumber).toBe(3);
  });

  it("nothing stored is no tries, and a list that cannot be read is treated as none", async () => {
    const kv = createMemoryKeyValueStore();
    const store = createTriesStore(kv);
    expect(await store.loadFor("photo:abc", PHOTO)).toEqual({ photoKey: "photo:abc", nextNumber: 1, tries: [] });
    await kv.put("tries", "not a list");
    expect((await store.loadFor("photo:abc", PHOTO)).tries).toEqual([]);
  });
});
