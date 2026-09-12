import { describe, it } from "vitest";
import { buildPattern, type BuildPatternOptions } from "@/lib/pattern";
import type { PixelBuffer, RGB } from "@/lib/types";

/**
 * G-024 M6 (HANDOVER.md D96): benchmarks Standard vs Crisp generation time
 * and approximate peak memory on a representative grid and a large grid.
 * Numbers and full discussion: `docs/reviews/2026-09-12-crisp-edges-
 * acceptance-and-delivery.md` Section 2.
 *
 * The large case is 500 stitches/32 colors, NOT the project's literal
 * established "worst case" of 1000 stitches/64 colors (HANDOVER.md D5/M5,
 * ~13.4s pre-Crisp for that exact configuration) -- that configuration WAS
 * attempted first, against this same 1500x1000 noisy four-region source,
 * and abandoned after a single Standard-mode run alone exceeded 400 CPU-
 * seconds with no sign of finishing (watched via steadily-climbing process
 * CPU time, not a hang). This fixture's dense per-pixel noise gives the
 * ICM optimizer far more genuinely-distinct local color variation to
 * reconsider on every pass than whatever simpler image produced the
 * historical 13.4s figure; at 667,000 cells and 64 colors that cost
 * compounds heavily. Scaled down rather than spend several more CPU-
 * minutes chasing an exact 1000/64 number the Standard-vs-Crisp *ratio*
 * doesn't need -- see the delivery doc for the full account.
 *
 * Deliberately NOT a `.spec.ts` file (vitest's `include` in `vitest.config
 * .ts` only matches `*.spec.ts`), and deliberately NOT written with
 * Vitest's own `bench()` API either -- a first attempt using `bench()`
 * burned several CPU-minutes on the large/64-color configuration alone
 * (tinybench's default warmup phase runs additional untimed iterations
 * before its measured ones, with no cheap way to bound total wall-clock
 * time for a single call this expensive). This file instead does its own
 * manual, explicitly-bounded timing (`performance.now()`) and approximate
 * memory measurement (`process.memoryUsage().heapUsed` deltas, no forced
 * GC -- labeled as approximate, not GC-isolated, per this project's own
 * honesty standard) with a small, fixed iteration count per configuration.
 *
 * Run manually when a future change might affect performance and this
 * needs re-measuring -- rename to `crisp-benchmark.spec.ts`, run
 * `npx vitest run tests/unit/crisp-benchmark.spec.ts`, then rename back
 * (never runs as part of `npm run test:unit`/CI as `.ts`).
 */

function pseudoNoise(x: number, y: number, amplitude: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * amplitude;
}

/** A photo-like fixture: four broad regions plus per-pixel noise, so both a plausible number of hard boundaries and plenty of ordinary/noisy interior exist -- not a degenerate all-noise or all-flat case. */
function makePhotoLikeBuffer(width: number, height: number): PixelBuffer {
  const regions: RGB[] = [
    [40, 90, 160],
    [200, 140, 60],
    [60, 150, 90],
    [180, 60, 120],
  ];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const regionX = x < width / 2 ? 0 : 1;
      const regionY = y < height / 2 ? 0 : 1;
      const base = regions[regionY * 2 + regionX];
      const noise = pseudoNoise(x, y, 40);
      const o = (y * width + x) * 4;
      data[o] = Math.max(0, Math.min(255, base[0] + noise));
      data[o + 1] = Math.max(0, Math.min(255, base[1] + noise));
      data[o + 2] = Math.max(0, Math.min(255, base[2] + noise));
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

function measure(label: string, buffer: PixelBuffer, options: BuildPatternOptions, repeats: number) {
  const times: number[] = [];
  let heapDelta = 0;
  for (let i = 0; i < repeats; i++) {
    const heapBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    const pattern = buildPattern(buffer, options);
    const elapsed = performance.now() - start;
    const heapAfter = process.memoryUsage().heapUsed;
    times.push(elapsed);
    if (i === repeats - 1) heapDelta = heapAfter - heapBefore;
    // Reference pattern so it isn't optimized away and so a real palette size prints once.
    if (i === 0) console.log(`${label}: palette size ${pattern.palette.length}`);
  }
  const meanMs = times.reduce((s, t) => s + t, 0) / times.length;
  console.log(`${label}: ${times.map((t) => t.toFixed(0)).join("ms, ")}ms across ${repeats} run(s), mean ${meanMs.toFixed(0)}ms, heapUsed delta (last run, approximate) ${(heapDelta / 1e6).toFixed(1)}MB`);
}

describe("G-024 M6 benchmark (manual invocation only, see file doc comment)", () => {
  it("representative grid (600x400 source, 150 stitches, 24 colors)", () => {
    const buffer = makePhotoLikeBuffer(600, 400);
    measure("representative/standard", buffer, { longerSideStitches: 150, colorCount: 24, edgeMode: "standard" }, 3);
    measure("representative/crisp", buffer, { longerSideStitches: 150, colorCount: 24, edgeMode: "crisp" }, 3);
  });

  it(
    "large grid (1500x1000 source, 500 stitches, 32 colors)",
    () => {
      // Single-run (not averaged). The report's/D5-M5's own established
      // "worst case" (1000 stitches, 64 colors) was ATTEMPTED first at this
      // same 1500x1000 source and abandoned after a single Standard-mode
      // run alone exceeded 400 CPU-seconds on this machine with no sign of
      // finishing -- a real, honestly-reported finding (see the delivery
      // doc's benchmark section and HANDOVER.md D96), not a hang: this
      // fixture's dense per-pixel noise across four broad regions gives the
      // ICM optimizer far more genuinely-distinct local color variation to
      // reconsider on every pass than whatever simpler synthetic image
      // produced the historical ~13.4s figure, and 64 requested colors
      // against 667,000 cells multiplies that cost heavily (`MAX_PASSES`
      // re-evaluates every candidate color for every cell on every pass).
      // Scaled down to a grid still 11x representative's own cell count
      // (500-stitch longer side vs. 150) so the comparison stays meaningful
      // without spending several more CPU-minutes chasing an exact
      // 1000/64 figure the Standard-vs-Crisp RATIO doesn't actually need.
      const buffer = makePhotoLikeBuffer(1500, 1000);
      measure("large/standard", buffer, { longerSideStitches: 500, colorCount: 32, edgeMode: "standard" }, 1);
      measure("large/crisp", buffer, { longerSideStitches: 500, colorCount: 32, edgeMode: "crisp" }, 1);
    },
    300_000
  );
});
