// G-100: how long a drawn pattern's preview takes the server to draw (`cs-job dither-preview`, the process the processor
// spawns per request), so it can be compared with the TypeScript it replaced (M1's baseline,
// `docs/reviews/2026-10-07-dither-preview-baseline.md`). Times the whole process, spawn included; the app adds its own
// pause before asking (`REDRAW_PAUSE_MS` in `app/components/dither-preview.tsx`, 120 ms) and the request's round trip.
// Patterns without settings are not timed: their pictures are built into the app (D327) and cost nothing to show.
//
//   npx tsx scripts/measure-dither-preview.ts        nine runs of each, after one to warm up
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DEFAULT_DITHER_TEXTURE } from "@/lib/pipeline/dither-hand-drawn";

const RUNS = Number(process.argv[2] ?? 9);
const CS_JOB = path.join(__dirname, "..", "rust", "target", "release", process.platform === "win32" ? "cs-job.exe" : "cs-job");
if (!existsSync(CS_JOB)) throw new Error(`no cs-job at ${CS_JOB} - run \`cargo build --release --manifest-path rust/Cargo.toml\` first`);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function time(draw: () => unknown): number {
  draw();
  const runs: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    draw();
    runs.push(performance.now() - start);
  }
  return median(runs);
}

console.log(`| What | Median ms (${RUNS} runs) |`);
console.log("|---|---|");
for (const [w, h] of [
  [56, 56],
  [100, 70],
  [200, 140],
  [300, 200],
  [500, 350],
  [1000, 700],
] as const) {
  const request = JSON.stringify({ ditherMode: "hand-drawn", chartWidth: w, chartHeight: h, ditherTexture: DEFAULT_DITHER_TEXTURE });
  console.log(
    `| Server preview, hand-drawn (default texture), ${w} × ${h} chart | ${time(() => execFileSync(CS_JOB, ["dither-preview", request])).toFixed(1)} |`
  );
}
