import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildPattern, type BuildPatternOptions } from "@/lib/pipeline/pattern";
import { plainKMeansQuantizer } from "@/lib/pipeline/quantize";
import type { PixelBuffer, StitchPattern } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "../tests/unit/helpers/fixtures";
import { hashPattern } from "../tests/unit/helpers/pattern-hash";

/**
 * G-048: the Rust port against the TypeScript pipeline. `npm run compare:rust` (after `cargo build --release` in
 * `rust/`). Every case is built by both; the Rust pattern is hashed with the same `hashPattern` as the golden
 * regression, and must equal both the TypeScript hash and, for golden cases, the recorded one (D107). Wall times are
 * the minimum of `RUST_PARITY_REPEAT` runs (default 3) on each side; `RUST_PARITY_OUT` writes them as JSON.
 */

const ROOT = path.resolve(__dirname, "..");
const BINARY = path.join(ROOT, "rust", "target", "release", process.platform === "win32" ? "cs-bench.exe" : "cs-bench");
const RECORDED: Record<string, string> = JSON.parse(readFileSync(path.join(ROOT, "tests/unit/fixtures/golden-hashes.json"), "utf8"));
const REPEAT = Number(process.env.RUST_PARITY_REPEAT ?? 3);

// The Standard, full-palette golden cases, with the fixtures defined exactly as in tests/unit/golden-hashes.spec.ts;
// the TypeScript hash is checked against the recorded one too, so a drifted copy fails here rather than passing.
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

interface Case {
  name: string;
  source: PixelBuffer;
  options: BuildPatternOptions;
  golden: boolean;
}

const golden = (name: string, source: PixelBuffer, options: BuildPatternOptions): Case => ({ name, source, options, golden: true });
const CASES: Case[] = [
  golden("two-region/standard/latest/8", twoRegion, { longerSideStitches: 60, colorCount: 8 }),
  golden("two-region/standard/original/8", twoRegion, { longerSideStitches: 60, colorCount: 8, quantizer: plainKMeansQuantizer }),
  golden("two-region/standard/latest/12/no-optimize", twoRegion, { longerSideStitches: 60, colorCount: 12, optimize: false }),
  golden("realistic-ratio/standard/latest/16", realisticRatio, { longerSideStitches: 100, colorCount: 16 }),
  golden("gradient/standard/latest/8", gradient, { longerSideStitches: 40, colorCount: 8 }),
  golden("circle/standard/latest/3", circle, { longerSideStitches: 30, colorCount: 3 }),
  golden("hard-split/standard/latest/3", hardSplit, { longerSideStitches: 16, colorCount: 3 }),
  golden("photo/standard/latest/24", photo, { longerSideStitches: 150, colorCount: 24 }),
  golden("photo/standard/original/24", photo, { longerSideStitches: 150, colorCount: 24, quantizer: plainKMeansQuantizer }),
  golden("photo/standard/latest/64", photo, { longerSideStitches: 300, colorCount: 64 }),
  golden("photo/standard/latest/100", photo, { longerSideStitches: 120, colorCount: 100 }),
  // The capacity probe's Standard shapes (scripts/capacity-probe.ts): no recorded hash, TypeScript is the reference.
  ...(process.env.RUST_PARITY_LARGE === "0"
    ? []
    : [
        { name: "probe/1000st-64col-1500x1000", source: makePhotoLikeBuffer(1500, 1000), options: { longerSideStitches: 1000, colorCount: 64 }, golden: false },
        { name: "probe/1500st-64col-2250x1500", source: makePhotoLikeBuffer(2250, 1500), options: { longerSideStitches: 1500, colorCount: 64 }, golden: false },
      ]),
];

interface RustOutput {
  pattern: { width: number; height: number; cellPalette: number[]; palette: StitchPattern["palette"]; isLandscape: boolean };
  runs: Array<{ totalMs: number; stages: Record<string, number> }>;
  peakRssMb: number | null;
}

const workDir = mkdtempSync(path.join(os.tmpdir(), "cs-rust-parity-"));
const results: Array<Record<string, unknown>> = [];
afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
  if (process.env.RUST_PARITY_OUT) writeFileSync(process.env.RUST_PARITY_OUT, JSON.stringify(results, null, 2) + "\n");
  console.table(results.map((r) => ({ case: r.name, tsMs: r.tsMs, rustMs: r.rustMs, speedup: r.speedup, identical: r.identical })));
});

function runRust(c: Case, index: number): RustOutput {
  const file = path.join(workDir, `case-${index}.rgba`);
  writeFileSync(file, c.source.data);
  const options = {
    longerSideStitches: c.options.longerSideStitches,
    colorCount: c.options.colorCount,
    quantizer: c.options.quantizer === plainKMeansQuantizer ? "original" : "latest",
    optimize: c.options.optimize ?? true,
  };
  const stdout = execFileSync(BINARY, ["generate", file, String(c.source.width), String(c.source.height), JSON.stringify(options), String(REPEAT)], {
    maxBuffer: 1 << 30,
    encoding: "utf8",
  });
  return JSON.parse(stdout) as RustOutput;
}

describe("Rust exact tier reproduces the TypeScript pipeline (G-048)", () => {
  it.each(CASES.map((c, i) => [c.name, c, i] as const))("%s", (name, c, index) => {
    let tsPattern: StitchPattern | undefined;
    let tsMs = Infinity;
    for (let r = 0; r < REPEAT; r++) {
      const start = performance.now();
      tsPattern = buildPattern(c.source, c.options);
      tsMs = Math.min(tsMs, performance.now() - start);
    }
    const tsHash = hashPattern(tsPattern!);

    const rust = runRust(c, index);
    const rustPattern: StitchPattern = {
      width: rust.pattern.width,
      height: rust.pattern.height,
      cellPalette: Uint8Array.from(rust.pattern.cellPalette),
      palette: rust.pattern.palette,
      isLandscape: rust.pattern.isLandscape,
    };
    const rustHash = hashPattern(rustPattern);
    const rustMs = Math.min(...rust.runs.map((run) => run.totalMs));
    const fastest = rust.runs.reduce((a, b) => (b.totalMs < a.totalMs ? b : a));
    results.push({
      name,
      grid: `${rust.pattern.width}x${rust.pattern.height}`,
      tsMs: Math.round(tsMs),
      rustMs: Math.round(rustMs),
      speedup: Number((tsMs / rustMs).toFixed(2)),
      rustStagesMs: Object.fromEntries(Object.entries(fastest.stages).map(([k, v]) => [k, Math.round(v)])),
      identical: rustHash === tsHash,
    });

    if (c.golden) expect(tsHash, "TypeScript no longer matches the recorded golden hash").toBe(RECORDED[name]);
    if (rustHash !== tsHash) {
      const cellDiff = tsPattern!.cellPalette.reduce((n, v, i) => n + (v !== rustPattern.cellPalette[i] ? 1 : 0), 0);
      const paletteDiff = tsPattern!.palette
        .map((p, i) => [p, rustPattern.palette[i]] as const)
        .filter(([a, b]) => !b || JSON.stringify(a) !== JSON.stringify(b))
        .slice(0, 5);
      throw new Error(
        `Rust differs: ${tsPattern!.width}x${tsPattern!.height} vs ${rustPattern.width}x${rustPattern.height}, ` +
          `${cellDiff} cells differ, palette ${tsPattern!.palette.length} vs ${rustPattern.palette.length}; first palette differences ${JSON.stringify(paletteDiff)}`
      );
    }
  });
});
