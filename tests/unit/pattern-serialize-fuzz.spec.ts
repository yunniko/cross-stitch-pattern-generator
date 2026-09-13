import { describe, expect, it } from "vitest";
import { deserializePattern, serializePattern } from "@/lib/editor/pattern-serialize";
import { mulberry32 } from "@/lib/prng";
import { drawChart, renderNavigatorPixels } from "@/lib/export/render";
import { EMPTY_CELL, MAX_COLORS, MAX_STITCHES, type StitchPattern } from "@/lib/types";
import { makeRecordingContext } from "./helpers/recording-context";

/**
 * Seeded fuzz of `deserializePattern` (G-031 M1, review finding B2/B3): a
 * valid file is mutated in random ways and the result must either throw or
 * be a pattern that every renderer can draw without producing `undefined`/
 * `NaN` fills -- never a pattern that only crashes later. Reproducible: the
 * seed and mutation list are in the failure message.
 */

const CASES = 200;
const SEED = 0x5eed;

type Json = Record<string, unknown>;

function validFile(rng: () => number): Json {
  const width = 1 + Math.floor(rng() * 6);
  const height = 1 + Math.floor(rng() * 6);
  const colors = 1 + Math.floor(rng() * 5);
  const palette = Array.from({ length: colors }, (_, i) => ({
    rgb: [Math.floor(rng() * 256), Math.floor(rng() * 256), Math.floor(rng() * 256)],
    symbol: String.fromCharCode(65 + i),
    name: `Color ${i}`,
  }));
  const cellPalette = Array.from({ length: width * height }, () => (rng() < 0.1 ? EMPTY_CELL : Math.floor(rng() * colors)));
  return {
    formatVersion: 5,
    width,
    height,
    isLandscape: width >= height,
    cellPalette,
    palette,
    name: "fuzz",
    sourceImage: rng() < 0.5 ? { dataUrl: "data:image/png;base64,AAAA", naturalWidth: 10, naturalHeight: 10, cellSizePx: 2, offsetX: 0, offsetY: 0 } : undefined,
    threadBrand: rng() < 0.3 ? "dmc" : undefined,
    edgeMode: rng() < 0.3 ? "crisp" : undefined,
    enhancementMode: rng() < 0.3 ? pick(rng, ["brighten", "auto", "vivid", "portrait"]) : undefined,
  };
}

const JUNK: unknown[] = [null, undefined, "", "x", 0, -1, 1.5, NaN, Infinity, true, [], {}, [1, 2], "300", 1e9];

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Applies one random mutation in place and returns its description. */
function mutate(file: Json, rng: () => number): string {
  const kind = Math.floor(rng() * 14);
  // An earlier mutation may have replaced these with junk (a string, a number, an object), so only real arrays count.
  const palette = Array.isArray(file.palette) ? (file.palette as Array<Json>) : undefined;
  const cells = Array.isArray(file.cellPalette) ? (file.cellPalette as unknown[]) : undefined;
  switch (kind) {
    case 0: {
      const key = pick(rng, Object.keys(file));
      delete file[key];
      return `delete ${key}`;
    }
    case 1: {
      const key = pick(rng, ["width", "height", "cellPalette", "palette", "isLandscape", "name", "sourceImage", "threadBrand", "edgeMode", "enhancementMode", "formatVersion", "dmcMode"]);
      const value = pick(rng, JUNK);
      file[key] = value;
      return `set ${key} = ${JSON.stringify(value)}`;
    }
    case 2: {
      const key = pick(rng, ["width", "height"] as const);
      const value = pick(rng, [0, -1, 1.5, MAX_STITCHES + 1, 2, "2", NaN]);
      file[key] = value;
      return `set ${key} = ${String(value)}`;
    }
    case 3:
      if (!cells) return "noop";
      cells.push(0);
      return "push cell";
    case 4:
      if (!cells || cells.length === 0) return "noop";
      cells.pop();
      return "pop cell";
    case 5: {
      if (!cells || cells.length === 0) return "noop";
      const i = Math.floor(rng() * cells.length);
      const value = pick(rng, [-1, 1.5, 255, 254, 100, 300, "0", null, NaN, palette ? palette.length : 0]);
      cells[i] = value;
      return `cell[${i}] = ${String(value)}`;
    }
    case 6: {
      if (!palette) return "noop";
      const extra = Math.floor(rng() * 20) + (rng() < 0.3 ? MAX_COLORS : 0);
      for (let i = 0; i < extra; i++) palette.push({ rgb: [1, 2, 3], symbol: `s${palette.length}`, name: "extra" });
      return `push ${extra} palette entries`;
    }
    case 7:
      if (!palette || palette.length === 0) return "noop";
      palette.pop();
      return "pop palette entry";
    case 8: {
      if (!palette || palette.length === 0) return "noop";
      const i = Math.floor(rng() * palette.length);
      const value = pick(rng, JUNK);
      palette[i] = value as Json;
      return `palette[${i}] = ${JSON.stringify(value)}`;
    }
    case 9: {
      if (!palette || palette.length === 0) return "noop";
      const entry = pick(rng, palette);
      if (typeof entry !== "object" || entry === null) return "noop";
      const value = pick(rng, ["red", [1, 2], [1, 2, 300], [1, 2, -1], [1, 2, 2.5], [null, 0, 0], [0, 0, 0, 0], [12, 34, 56], undefined]);
      entry.rgb = value;
      return `rgb = ${JSON.stringify(value)}`;
    }
    case 10: {
      if (!palette || palette.length === 0) return "noop";
      const entry = pick(rng, palette);
      if (typeof entry !== "object" || entry === null) return "noop";
      const other = pick(rng, palette);
      const value = pick(rng, ["", 1, null, undefined, typeof other === "object" && other ? other.symbol : "dup", "Z"]);
      entry.symbol = value;
      return `symbol = ${JSON.stringify(value)}`;
    }
    case 11: {
      if (!palette || palette.length === 0) return "noop";
      const entry = pick(rng, palette);
      if (typeof entry !== "object" || entry === null) return "noop";
      const value = pick(rng, [null, 5, undefined, "", "Renamed"]);
      entry.name = value;
      return `name = ${JSON.stringify(value)}`;
    }
    case 12: {
      const value = pick(rng, [{ dataUrl: "nope" }, { dataUrl: "data:x", naturalWidth: -1 }, "data:x", 5, { dataUrl: "data:x", naturalWidth: 10, naturalHeight: 10, cellSizePx: 0, offsetX: 0, offsetY: 0 }]);
      file.sourceImage = value;
      return `sourceImage = ${JSON.stringify(value)}`;
    }
    default: {
      const value = pick(rng, ["rainbow", "cosmo", "anchor", 1, null]);
      file.threadBrand = value;
      return `threadBrand = ${JSON.stringify(value)}`;
    }
  }
}

function assertRenderable(pattern: StitchPattern): void {
  expect(Number.isInteger(pattern.width) && pattern.width >= 1 && pattern.width <= MAX_STITCHES).toBe(true);
  expect(Number.isInteger(pattern.height) && pattern.height >= 1 && pattern.height <= MAX_STITCHES).toBe(true);
  expect(pattern.cellPalette).toBeInstanceOf(Uint8Array);
  expect(pattern.cellPalette.length).toBe(pattern.width * pattern.height);
  expect(pattern.palette.length).toBeGreaterThanOrEqual(1);
  expect(pattern.palette.length).toBeLessThanOrEqual(MAX_COLORS);
  const symbols = new Set<string>();
  for (const [i, color] of pattern.palette.entries()) {
    expect(color.index).toBe(i);
    expect(color.rgb).toHaveLength(3);
    for (const channel of color.rgb) expect(Number.isInteger(channel) && channel >= 0 && channel <= 255).toBe(true);
    expect(typeof color.symbol === "string" && color.symbol.length > 0).toBe(true);
    expect(typeof color.name).toBe("string");
    expect(Number.isInteger(color.count) && color.count >= 0).toBe(true);
    symbols.add(color.symbol);
  }
  expect(symbols.size).toBe(pattern.palette.length);
  for (const index of pattern.cellPalette) {
    expect(index === EMPTY_CELL || index < pattern.palette.length).toBe(true);
  }
  if (pattern.threadBrand !== undefined) expect(["dmc", "cosmo", "anchor"]).toContain(pattern.threadBrand);
  if (pattern.enhancementMode !== undefined) expect(["brighten", "auto", "vivid", "portrait"]).toContain(pattern.enhancementMode);

  // Every renderer must run clean on the accepted pattern.
  const pixels = renderNavigatorPixels(pattern);
  expect(pixels.length).toBe(pattern.cellPalette.length * 4);
  for (const mode of ["color", "bw"] as const) {
    const ctx = makeRecordingContext();
    drawChart(ctx, pattern, mode, 8);
    for (const style of ctx.styles) expect(style).not.toMatch(/undefined|NaN|null/);
    for (const { text } of ctx.texts) expect(text).not.toMatch(/^(undefined|null)$/);
  }
  // And it must survive its own round trip byte-for-byte.
  const again = deserializePattern(serializePattern(pattern));
  expect(Array.from(again.cellPalette)).toEqual(Array.from(pattern.cellPalette));
  expect(again.palette).toEqual(pattern.palette);
}

describe("deserializePattern fuzz", () => {
  it(`either throws or returns a fully renderable pattern for ${CASES} seeded mutations of a valid file`, () => {
    const rng = mulberry32(SEED);
    let accepted = 0;
    let rejected = 0;
    for (let i = 0; i < CASES; i++) {
      const file = validFile(rng);
      const mutations: string[] = [];
      const count = 1 + Math.floor(rng() * 3);
      for (let m = 0; m < count; m++) mutations.push(mutate(file, rng));
      const json = JSON.stringify(file);
      const label = `case ${i} (seed ${SEED}): ${mutations.join("; ")}`;

      let pattern: StitchPattern;
      try {
        pattern = deserializePattern(json);
      } catch (error) {
        expect(error, label).toBeInstanceOf(Error);
        expect((error as Error).message, label).not.toBe("");
        rejected++;
        continue;
      }
      try {
        assertRenderable(pattern);
      } catch (error) {
        throw new Error(`${label} was accepted but is not renderable: ${(error as Error).message}`);
      }
      accepted++;
    }
    // The mutation set includes benign edits, so both outcomes must occur --
    // otherwise the test would pass vacuously by rejecting everything.
    expect(accepted).toBeGreaterThan(10);
    expect(rejected).toBeGreaterThan(50);
  });

  it("accepts every unmutated generated file", () => {
    const rng = mulberry32(SEED + 1);
    for (let i = 0; i < 50; i++) assertRenderable(deserializePattern(JSON.stringify(validFile(rng))));
  });
});
