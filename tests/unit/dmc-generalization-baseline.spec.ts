import { describe, expect, it } from "vitest";
import { buildPattern } from "@/lib/pattern";
import type { PixelBuffer, RGB } from "@/lib/types";

/**
 * G-029 M1 (Owner request 2026-09-12: Anchor/Cosmo palette modes,
 * generalizing the DMC-only plumbing first, HANDOVER.md D92). A Codex
 * critique exchange on M1's design specifically called for an independent
 * pre-refactor-vs-post-refactor comparison of `buildPattern`'s DMC-mode
 * output, run against a real fixture at both Standard/Crisp edge modes
 * with optimization on/off -- not relying solely on `regression.spec.ts`'s
 * own tolerance-banded assertions, which can pass despite a real output
 * change (D18's lesson: three earlier "improvement" attempts each looked
 * correct in isolation and were only caught by broad, exact-value testing).
 *
 * The hashes and palette summaries below were captured from the
 * UNMODIFIED pre-refactor `applyDmcPalette`/`buildPattern` (git commit
 * 8ca7659, before the G-029 M1 generalization to `applyBrandPalette` was
 * written) and are asserted unchanged after the refactor. If a future,
 * *intentional* change to the thread-matching pipeline needs to change
 * these values, re-capture them deliberately and say so in the commit
 * message -- don't just update them to make a failing test pass.
 */

function makeCircleBuffer(size: number, radius: number, inside: RGB, outside: RGB): PixelBuffer {
  const data = new Uint8ClampedArray(size * size * 4);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const [r, g, b] = dx * dx + dy * dy < radius * radius ? inside : outside;
      const o = (y * size + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

// FNV-1a, a simple non-cryptographic hash -- good enough to catch any
// single-cell difference in a large array without embedding the whole
// array as a literal in this file.
function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const EXPECTED_PALETTE = [
  { rgb: [30, 17, 8], name: "3371 - Black Brown", count: 305 },
  { rgb: [215, 206, 203], name: "453 - Shell Gray - Light", count: 1295 },
];

describe("buildPattern DMC-mode golden baseline (G-029 M1 pre/post-refactor comparison)", () => {
  const cases: Array<[string, string, Parameters<typeof buildPattern>[1]]> = [
    ["Standard edges, optimize on", "2c183504", { longerSideStitches: 40, colorCount: 4, paletteMode: "dmc" }],
    ["Standard edges, optimize off", "2c183504", { longerSideStitches: 40, colorCount: 4, paletteMode: "dmc", optimize: false }],
    ["Crisp edges, optimize on", "2c183504", { longerSideStitches: 40, colorCount: 4, paletteMode: "dmc", edgeMode: "crisp" }],
    ["Crisp edges, optimize off", "2c183504", { longerSideStitches: 40, colorCount: 4, paletteMode: "dmc", edgeMode: "crisp", optimize: false }],
  ];

  for (const [label, expectedHash, options] of cases) {
    it(`${label}: cellPalette hash and palette summary match the pre-refactor baseline`, () => {
      const buffer = makeCircleBuffer(40, 10, [30, 30, 30], [220, 210, 200]);
      const pattern = buildPattern(buffer, options);
      expect(fnv1a(pattern.cellPalette)).toBe(expectedHash);
      expect(pattern.palette.map((c) => ({ rgb: c.rgb, name: c.name, count: c.count }))).toEqual(EXPECTED_PALETTE);
    });
  }
});
