import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { StitchPattern } from "@/lib/types";
import { GOLDEN_CASES, type GoldenCase } from "../tests/unit/fixtures/golden-cases";
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
const BINARY = path.join(ROOT, "rust", "target", "release", process.platform === "win32" ? "cs-bench.exe" : "cs-bench");
const HASH_FILE = path.join(ROOT, "tests", "unit", "fixtures", "golden-hashes.json");
const RECORDED: Record<string, string> = JSON.parse(readFileSync(HASH_FILE, "utf8"));
const THREADS = Number(process.env.RUST_THREADS ?? 1);

// A missing binary fails the run rather than skipping it: a golden suite that quietly tests nothing is the failure
// this goal exists to prevent (the same reasoning as CS_JOB_REQUIRED in G-067 M1).
if (!existsSync(BINARY)) {
  throw new Error(`no cs-bench at ${BINARY} — run \`cargo build --release --manifest-path rust/Cargo.toml\` first`);
}

const workDir = mkdtempSync(path.join(os.tmpdir(), "cs-goldens-"));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

interface RustPattern {
  width: number;
  height: number;
  cellPalette: number[];
  palette: StitchPattern["palette"];
  isLandscape: boolean;
  threadBrand?: string | null;
  edgeMode?: string | null;
  enhancementMode?: string | null;
  ditherMode?: string | null;
  ditherTexture?: StitchPattern["ditherTexture"] | null;
  vivid?: boolean | null;
}

/** Generates one case in Rust and returns it in the shape `hashPattern` expects. */
function generate(c: GoldenCase, index: number, extra: Record<string, unknown> = {}): StitchPattern {
  const file = path.join(workDir, `case-${index}.rgba`);
  writeFileSync(file, c.source.data);
  const options = {
    longerSideStitches: c.options.longerSideStitches,
    colorCount: c.options.colorCount,
    quantizer: c.options.quantizer ?? "latest",
    optimize: c.options.optimize ?? true,
    edgeMode: c.options.edgeMode,
    paletteMode: c.options.paletteMode,
    threads: THREADS,
    ...extra,
  };
  const stdout = execFileSync(BINARY, ["generate", file, String(c.source.width), String(c.source.height), JSON.stringify(options), "1"], {
    maxBuffer: 1 << 30,
    encoding: "utf8",
  });
  const out = JSON.parse(stdout) as { pattern: RustPattern };
  return {
    width: out.pattern.width,
    height: out.pattern.height,
    cellPalette: Uint8Array.from(out.pattern.cellPalette),
    palette: out.pattern.palette,
    isLandscape: out.pattern.isLandscape,
    threadBrand: (out.pattern.threadBrand ?? undefined) as StitchPattern["threadBrand"],
    edgeMode: (out.pattern.edgeMode ?? undefined) as StitchPattern["edgeMode"],
    enhancementMode: (out.pattern.enhancementMode ?? undefined) as StitchPattern["enhancementMode"],
    ditherMode: (out.pattern.ditherMode ?? undefined) as StitchPattern["ditherMode"],
    ditherTexture: (out.pattern.ditherTexture ?? undefined) as StitchPattern["ditherTexture"],
    vivid: out.pattern.vivid ? true : undefined,
  };
}

describe("golden hashes: the Rust pipeline still produces the recorded bytes (D107)", () => {
  it("has a recorded hash for every case, and no stale ones", () => {
    expect(Object.keys(RECORDED).sort()).toEqual(GOLDEN_CASES.map((c) => c.name).sort());
  });

  it.each(GOLDEN_CASES.map((c, i) => [c.name, c, i] as const))(
    "%s",
    (name, c, index) => {
      expect(hashPattern(generate(c, index))).toBe(RECORDED[name]);
    },
    180_000
  );

  // D112: asking for "off" explicitly must reproduce the same bytes as not asking at all.
  it.each(GOLDEN_CASES.map((c, i) => [c.name, c, i] as const))(
    "%s with enhancementMode off",
    (name, c, index) => {
      expect(hashPattern(generate(c, index, { enhancementMode: "off" }))).toBe(RECORDED[name]);
    },
    180_000
  );
});
