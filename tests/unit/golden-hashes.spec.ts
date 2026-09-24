import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPattern, type BuildPatternOptions } from "@/lib/pipeline/pattern";
import { plainKMeansQuantizer } from "@/lib/pipeline/quantize";
import type { PixelBuffer } from "@/lib/types";
import { GOLDEN_CASES } from "./fixtures/golden-cases";
import { hashPattern } from "./helpers/pattern-hash";

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

/** The shared list, mapped back to what the TypeScript pipeline takes: its quantizer is a function.
 *  Both implementations run the same cases from one place (G-068 M1). */
const CASES: Array<{ name: string; source: PixelBuffer; options: BuildPatternOptions }> = GOLDEN_CASES.map((c) => ({
  name: c.name,
  source: c.source,
  options: {
    ...c.options,
    ...(c.options.quantizer === "original" ? { quantizer: plainKMeansQuantizer } : {}),
  } as BuildPatternOptions,
}));

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

  // G-032 (D112): an explicit enhancementMode "off" must reproduce the same recorded bytes, and leave the input untouched.
  it.each(CASES.map((c) => [c.name, c] as const))(
    "%s with enhancementMode off",
    (name, { source, options }) => {
      if (updating) return;
      const before = Uint8ClampedArray.from(source.data);
      expect(hashPattern(buildPattern(source, { ...options, enhancementMode: "off" }))).toBe(recorded[name]);
      expect(source.data).toEqual(before);
    },
    120_000
  );

  it("writes the hash file when UPDATE_GOLDEN_HASHES=1 (otherwise a no-op)", () => {
    if (!updating) return;
    writeFileSync(HASH_FILE, JSON.stringify(computed, null, 2) + "\n");
    expect(Object.keys(computed)).toHaveLength(CASES.length);
  });
});
