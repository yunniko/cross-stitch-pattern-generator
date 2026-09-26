import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { NEUTRAL_ADJUST } from "@/lib/pipeline/photo-adjust";
import type { StitchPattern } from "@/lib/types";
import { GOLDEN_CASES, type GoldenCase } from "../tests/unit/fixtures/golden-cases";
import { openCsBench } from "../tests/unit/helpers/cs-bench";
import { hashPattern } from "../tests/unit/helpers/pattern-hash";

/**
 * The recorded golden hashes (D107) checked against **Rust**, with no TypeScript in the loop (G-068 M1).
 *
 * `compare:rust` already runs these cases through both implementations, but the assertion it makes about the
 * recorded hashes is about the TypeScript one — Rust matches the record only transitively, through the comparison.
 * That is fine while both exist and worthless the moment one is deleted. This suite asserts the thing that has to
 * survive: the binary production runs still produces the bytes the project recorded.
 *
 * Run with `npm run test:goldens:rust`, after `cargo build --release`.
 */

const ROOT = path.resolve(__dirname, "..");
const HASH_FILE = path.join(ROOT, "tests", "unit", "fixtures", "golden-hashes.json");
const RECORDED: Record<string, string> = JSON.parse(readFileSync(HASH_FILE, "utf8"));

const bench = openCsBench("goldens");
afterAll(() => bench.dispose());

/** Generates one case in Rust and returns it in the shape `hashPattern` expects. */
function generate(c: GoldenCase, extra: Record<string, unknown> = {}): StitchPattern {
  return bench.generate(c.source, {
    longerSideStitches: c.options.longerSideStitches,
    colorCount: c.options.colorCount,
    quantizer: c.options.quantizer ?? "latest",
    optimize: c.options.optimize ?? true,
    edgeMode: c.options.edgeMode,
    paletteMode: c.options.paletteMode,
    photoAdjust: c.options.photoAdjust,
    ditherMode: c.options.ditherMode,
    ditherTexture: c.options.ditherTexture,
    vivid: c.options.vivid,
    ...extra,
  });
}

/**
 * Records a hash the file does not have yet, under `GOLDEN_RECORD=1`.
 *
 * It only ever *adds*. G-068's constraint is that the values recorded under D107 keep them through the migration,
 * so the one operation the recorder will not perform is overwriting one — a hash that moved is a bug to explain,
 * never a file to regenerate.
 */
const RECORDING = process.env.GOLDEN_RECORD === "1";
const added: Record<string, string> = {};
afterAll(() => {
  if (!RECORDING || Object.keys(added).length === 0) return;
  writeFileSync(HASH_FILE, `${JSON.stringify({ ...RECORDED, ...added }, null, 2)}\n`);
});

function checkHash(name: string, pattern: StitchPattern): void {
  const hash = hashPattern(pattern);
  if (RECORDING && RECORDED[name] === undefined) {
    added[name] = hash;
    return;
  }
  expect(hash).toBe(RECORDED[name]);
}

/** Cases that leave the sliders alone: asking for neutral explicitly must reproduce them exactly (G-074). */
const NEUTRAL_CASES = GOLDEN_CASES.filter((c) => c.options.photoAdjust === undefined);

describe("golden hashes: the Rust pipeline still produces the recorded bytes (D107)", () => {
  it("has a recorded hash for every case, and no stale ones", () => {
    if (RECORDING) return;
    expect(Object.keys(RECORDED).sort()).toEqual(GOLDEN_CASES.map((c) => c.name).sort());
  });

  it.each(GOLDEN_CASES.map((c) => [c.name, c] as const))(
    "%s",
    (name, c) => {
      const pattern = generate(c);
      checkHash(name, pattern);
      // What the chart says it was built with, which the hash does not cover for dither and Vivid (G-068 M4).
      if (c.records) {
        expect({
          ditherMode: pattern.ditherMode,
          vivid: pattern.vivid,
          photoAdjust: pattern.photoAdjust,
          edgeMode: pattern.edgeMode,
        }).toMatchObject(c.records);
      }
    },
    180_000
  );

  // Criterion 4, on every case rather than one: sliders sent at neutral must produce the bytes a request
  // without them produces. It is what lets the sliders exist without moving anything that came before.
  it.each(NEUTRAL_CASES.map((c) => [c.name, c] as const))(
    "%s with the sliders centred",
    (name, c) => {
      // While recording there is nothing yet to be equal to; the assertion below runs on every normal run after.
      if (RECORDING && RECORDED[name] === undefined) return;
      expect(hashPattern(generate(c, { photoAdjust: NEUTRAL_ADJUST }))).toBe(RECORDED[name]);
    },
    180_000
  );
});
