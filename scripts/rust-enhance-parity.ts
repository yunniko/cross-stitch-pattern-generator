import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { enhancePixelBuffer, ENHANCEMENT_MODE_IDS, type EnhancementModeId } from "@/lib/pipeline/enhance";
import type { PixelBuffer, RGB } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "../tests/unit/helpers/fixtures";

/**
 * The one duplication G-068 did not remove, checked (G-068 M4).
 *
 * M3 deleted the TypeScript pipeline, with one exception: `lib/pipeline/enhance.ts` still runs, because the photo
 * pane's enhancement preview is rendered in the Next process rather than by the sidecar (D221). So the picture the
 * user judges a mode by comes out of TypeScript and the chart they then get comes out of Rust. Nothing checked that
 * those two agree — the golden hashes see enhancement only through a finished chart, where quantization to a few
 * dozen colours hides exactly the small per-pixel differences that would show here first.
 *
 * Every released mode, on every fixture, must come out byte-identical from both. The preview is still built from a
 * downscaled copy of the photo (`ENHANCEMENT_PREVIEW_MAX_SIDE`), so preview and chart legitimately differ in
 * *detail*; what must not differ is the enhancement itself given the same pixels.
 *
 * Run with `npm run test:enhance-parity:rust`, after `cargo build --release`.
 */

const ROOT = path.resolve(__dirname, "..");
const BINARY = path.join(ROOT, "rust", "target", "release", process.platform === "win32" ? "cs-bench.exe" : "cs-bench");
if (!existsSync(BINARY)) {
  throw new Error(`no cs-bench at ${BINARY} - run \`cargo build --release --manifest-path rust/Cargo.toml\` first`);
}

const workDir = mkdtempSync(path.join(os.tmpdir(), "cs-enhance-parity-"));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));
let next = 0;

/** Runs the Rust enhancement stage alone and returns the buffer it produced, plus whether it acted at all. */
function enhanceInRust(source: PixelBuffer, mode: EnhancementModeId): { buffer: PixelBuffer; applied: boolean } {
  const inFile = path.join(workDir, `in-${next}.rgba`);
  const outFile = path.join(workDir, `out-${next++}.rgba`);
  writeFileSync(inFile, source.data);
  const stdout = execFileSync(BINARY, ["enhance", inFile, String(source.width), String(source.height), mode, outFile], {
    maxBuffer: 1 << 30,
    encoding: "utf8",
  });
  const { applied } = JSON.parse(stdout) as { applied: boolean };
  return {
    buffer: { data: new Uint8ClampedArray(readFileSync(outFile)), width: source.width, height: source.height },
    applied,
  };
}

const clamp = (v: number) => Math.max(0, Math.min(255, v));

/**
 * `acts` is whether a released mode changes this fixture at all.
 *
 * Asserted rather than assumed: two implementations that both abstain agree trivially, and a parity suite made of
 * those is the kind that passes forever while testing nothing. Measured at 68–75% of bytes changed on the four
 * fixtures below, up to ±86 per channel.
 */
const FIXTURES: Array<{ name: string; source: PixelBuffer; acts: boolean }> = [
  { name: "photo", source: makePhotoLikeBuffer(240, 160, 30), acts: true },
  // Underexposed and warm-cast: the case white balance and the tone curve both have something to do.
  {
    name: "underexposed",
    source: makeBuffer(200, 140, (x, y) => {
      const n = pseudoNoise(x, y, 12);
      return [clamp(70 + x * 0.1 + n), clamp(58 + x * 0.08 + n), clamp(40 + n)] as RGB;
    }),
    acts: true,
  },
  // Skin-like tones over a flat background: what "portrait" is tuned for.
  {
    name: "faces",
    source: makeBuffer(180, 220, (x, y) => {
      const n = pseudoNoise(x, y, 15);
      const inFace = ((x - 90) / 55) ** 2 + ((y - 115) / 75) ** 2 < 1;
      const base: RGB = inFace ? [198, 156, 128] : [88, 96, 104];
      return [clamp(base[0] + n), clamp(base[1] + n), clamp(base[2] + n)];
    }),
    acts: true,
  },
  // Already well exposed and neutral: every stage should abstain, and both must abstain the same way.
  {
    name: "neutral-flat",
    source: makeBuffer(120, 120, (x, y) => [clamp(30 + x * 1.8), clamp(30 + x * 1.8), clamp(30 + y * 1.8)] as RGB),
    acts: true,
  },
  // A single flat colour: the degenerate histogram, where a divide-by-zero would differ between languages first.
  { name: "single-colour", source: makeBuffer(64, 64, () => [120, 120, 120] as RGB), acts: false },
];

/** Where the two buffers first differ, described well enough to debug from. */
function firstDifference(a: PixelBuffer, b: PixelBuffer): string | null {
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) {
      const pixel = Math.floor(i / 4);
      const channel = "rgba"[i % 4];
      return `pixel ${pixel % a.width},${Math.floor(pixel / a.width)} channel ${channel}: TypeScript ${a.data[i]}, Rust ${b.data[i]}`;
    }
  }
  return null;
}

const CASES = ENHANCEMENT_MODE_IDS.flatMap((mode) => FIXTURES.map((f) => [mode, f.name, f] as const));

describe("the shipped enhancement preview and the Rust pipeline enhance identically (D221)", () => {
  it.each(CASES)(
    "%s on %s",
    (mode, _name, fixture) => {
      const { source, acts } = fixture;
      const typescript = enhancePixelBuffer(source, mode);
      const { buffer: rust } = enhanceInRust(source, mode);
      expect(rust.data.length).toBe(typescript.data.length);
      expect(firstDifference(typescript, rust)).toBeNull();
      // The comparison above is only worth making on output enhancement actually produced.
      expect(firstDifference(typescript, source) !== null).toBe(mode !== "off" && acts);
    },
    120_000
  );
});
