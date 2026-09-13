import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPattern, type BuildPatternOptions } from "@/lib/pattern";
import { plainKMeansQuantizer } from "@/lib/quantize";
import type { PixelBuffer, StitchPattern } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "./helpers/fixtures";

/**
 * Byte-identity guard for the whole generation pipeline (G-031 M3). Each
 * case hashes the finished pattern (dimensions, every cell index, every
 * palette RGB, symbol and name) and compares it with the hash recorded
 * from the pre-M3 code in `fixtures/golden-hashes.json`. A performance
 * refactor must leave every hash unchanged; a deliberate algorithm change
 * regenerates the file with `UPDATE_GOLDEN_HASHES=1 npx vitest run
 * tests/unit/golden-hashes.spec.ts` and says so in its decision record.
 */

const HASH_FILE = path.join(__dirname, "fixtures", "golden-hashes.json");

function hashPattern(pattern: StitchPattern): string {
  const hash = createHash("sha256");
  hash.update(`${pattern.width}x${pattern.height};`);
  hash.update(pattern.cellPalette);
  for (const color of pattern.palette) hash.update(`${color.index}:${color.rgb.join(",")}:${color.symbol}:${color.name}:${color.count};`);
  hash.update(`${pattern.threadBrand ?? ""};${pattern.edgeMode ?? ""}`);
  return hash.digest("hex");
}

const twoRegion = makeBuffer(60, 40, (x, y) => {
  const base = x < 30 ? [200, 150, 100] : [80, 120, 90];
  const noise = pseudoNoise(x, y, 50);
  return [base[0] + noise, base[1] + noise, base[2] + noise];
});
const realisticRatio = makeBuffer(240, 160, (x, y) => {
  const base = y < 90 ? [120 + x * 0.2, 160 + x * 0.15, 220] : [90 + x * 0.1, 130 - y * 0.1, 40];
  const noise = pseudoNoise(x, y, 60);
  return [base[0] + noise, base[1] + noise, base[2] + noise];
});
const gradient = makeBuffer(40, 40, (x, y) => {
  const value = 120 + (x / 40) * 20 + pseudoNoise(x, y, 4);
  return [value, value, value];
});
const circle = makeBuffer(30, 30, (x, y) => {
  const dx = x - 15;
  const dy = y - 15;
  const base = dx * dx + dy * dy < 100 ? [30, 30, 30] : [220, 210, 200];
  const noise = pseudoNoise(x, y, 15);
  return [base[0] + noise, base[1] + noise, base[2] + noise];
});
const hardSplit = makeBuffer(64, 64, (x) => (x < 30 ? [0, 0, 0] : [255, 255, 255]));
const photo = makePhotoLikeBuffer(600, 400);

const CASES: Array<{ name: string; source: PixelBuffer; options: BuildPatternOptions }> = [
  { name: "two-region/standard/latest/8", source: twoRegion, options: { longerSideStitches: 60, colorCount: 8 } },
  { name: "two-region/standard/original/8", source: twoRegion, options: { longerSideStitches: 60, colorCount: 8, quantizer: plainKMeansQuantizer } },
  { name: "two-region/standard/latest/12/no-optimize", source: twoRegion, options: { longerSideStitches: 60, colorCount: 12, optimize: false } },
  { name: "realistic-ratio/standard/latest/16", source: realisticRatio, options: { longerSideStitches: 100, colorCount: 16 } },
  { name: "gradient/standard/latest/8", source: gradient, options: { longerSideStitches: 40, colorCount: 8 } },
  { name: "circle/standard/latest/3", source: circle, options: { longerSideStitches: 30, colorCount: 3 } },
  { name: "hard-split/crisp/latest/3", source: hardSplit, options: { longerSideStitches: 16, colorCount: 3, edgeMode: "crisp" } },
  { name: "hard-split/standard/latest/3", source: hardSplit, options: { longerSideStitches: 16, colorCount: 3 } },
  { name: "photo/standard/latest/24", source: photo, options: { longerSideStitches: 150, colorCount: 24 } },
  { name: "photo/standard/original/24", source: photo, options: { longerSideStitches: 150, colorCount: 24, quantizer: plainKMeansQuantizer } },
  { name: "photo/crisp/latest/24", source: photo, options: { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp" } },
  { name: "photo/crisp/original/24", source: photo, options: { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp", quantizer: plainKMeansQuantizer } },
  { name: "photo/standard/latest/24/dmc", source: photo, options: { longerSideStitches: 150, colorCount: 24, paletteMode: "dmc" } },
  { name: "photo/standard/latest/24/cosmo", source: photo, options: { longerSideStitches: 150, colorCount: 24, paletteMode: "cosmo" } },
  { name: "photo/standard/latest/24/anchor", source: photo, options: { longerSideStitches: 150, colorCount: 24, paletteMode: "anchor" } },
  { name: "photo/crisp/latest/24/dmc", source: photo, options: { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp", paletteMode: "dmc" } },
  { name: "photo/standard/latest/64", source: photo, options: { longerSideStitches: 300, colorCount: 64 } },
  { name: "photo/standard/latest/100", source: photo, options: { longerSideStitches: 120, colorCount: 100 } },
];

describe("golden hashes: generation output is byte-identical to the recorded pre-M3 pipeline", () => {
  const recorded: Record<string, string> = existsSync(HASH_FILE) ? JSON.parse(readFileSync(HASH_FILE, "utf8")) : {};
  const updating = process.env.UPDATE_GOLDEN_HASHES === "1";
  const computed: Record<string, string> = {};

  it.each(CASES.map((c) => [c.name, c] as const))(
    "%s",
    (name, { source, options }) => {
      const hash = hashPattern(buildPattern(source, options));
      computed[name] = hash;
      if (updating) return;
      expect(recorded[name], `no recorded hash for "${name}" -- run with UPDATE_GOLDEN_HASHES=1`).toBeDefined();
      expect(hash).toBe(recorded[name]);
    },
    // The 300-stitch/64-color case took 27 s on the pre-M3 pipeline.
    120_000
  );

  it("writes the hash file when UPDATE_GOLDEN_HASHES=1 (otherwise a no-op)", () => {
    if (!updating) return;
    writeFileSync(HASH_FILE, JSON.stringify(computed, null, 2) + "\n");
    expect(Object.keys(computed)).toHaveLength(CASES.length);
  });
});
