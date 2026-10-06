// G-100 M1: how long the dither previews take to draw, so the previews G-100 makes in Rust (built pictures, and the
// server for the drawn marks) can be compared with today. Times the drawing alone, in Node; the app adds its own pause
// before redrawing (`REDRAW_PAUSE_MS` in `app/components/dither-preview.tsx`, 120 ms).
//
//   npx tsx scripts/measure-dither-preview.ts        nine runs of each, after one to warm up
import { performance } from "node:perf_hooks";
import { DEFAULT_DITHER_TEXTURE } from "@/lib/pipeline/dither-hand-drawn";
import { DITHERED_MODES, drawToday, previewCases, TILE, type PreviewCase } from "../tests/unit/fixtures/dither-preview-cases";

const RUNS = Number(process.argv[2] ?? 9);

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

const tiles = previewCases().filter((c) => c.name.startsWith("tile/"));
console.log(`| What | Median ms (${RUNS} runs) |`);
console.log("|---|---|");
console.log(`| All ${tiles.length} chooser tiles (${TILE} × ${TILE}) | ${time(() => tiles.forEach(drawToday)).toFixed(2)} |`);
for (const mode of DITHERED_MODES.filter((m) => m !== "hand-drawn")) {
  const c: PreviewCase = { name: `preview/${mode}`, mode, chartWidth: 300, chartHeight: 200 };
  console.log(`| Preview, ${mode}, 300 × 200 chart | ${time(() => drawToday(c)).toFixed(2)} |`);
}
for (const [w, h] of [
  [56, 56],
  [100, 70],
  [200, 140],
  [300, 200],
  [500, 350],
  [1000, 700],
] as const) {
  const c: PreviewCase = { name: "preview/hand-drawn", mode: "hand-drawn", chartWidth: w, chartHeight: h, texture: DEFAULT_DITHER_TEXTURE };
  console.log(`| Preview, hand-drawn (default texture), ${w} × ${h} chart | ${time(() => drawToday(c)).toFixed(1)} |`);
}
