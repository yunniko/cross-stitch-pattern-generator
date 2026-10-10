// G-099: what generation costs, and what it produces, for one fixed picture across the kinds of setting there are.
// Run before and after a change to the pipeline: the times say what the change cost, and the hashes say whether any chart
// moved (the 74 golden cases do not cover traced lines, texture strokes or a chosen colour set; these do).
//
//   npx tsx scripts/measure-generation.ts            five runs of each case, single-threaded
//   npx tsx scripts/measure-generation.ts 9          nine runs
//
// Needs `cargo build --release -p cs-bench` first.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { requestSystems } from "../tests/unit/helpers/thread-systems";

const root = path.join(__dirname, "..");
const bench = path.join(root, "rust", "target", "release", process.platform === "win32" ? "cs-bench.exe" : "cs-bench");
const repeat = Number(process.argv[2] ?? 5);

/** A picture with everything the pipeline looks for: smooth gradients, hard edges, a dark line, fine texture and noise. */
function picture(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4);
  let seed = 20261005;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed >>> 24) - 128;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inDisc = (x - width * 0.35) ** 2 + (y - height * 0.45) ** 2 < (height * 0.28) ** 2;
      const stripe = Math.floor((x + y) / 9) % 2 === 0 && x > width * 0.6 && y > height * 0.55;
      const line = Math.abs(y - (height * 0.2 + Math.sin(x / 90) * 40)) < 3;
      let r = 60 + (x / width) * 150;
      let g = 90 + (y / height) * 120;
      let b = 200 - (x / width) * 110;
      if (inDisc) [r, g, b] = [215 - (y / height) * 60, 70 + (x / width) * 50, 60];
      if (stripe) [r, g, b] = [r * 0.6, g * 0.9, b * 0.5];
      if (line) [r, g, b] = [25, 20, 30];
      const n = noise() / 14;
      data[i] = Math.max(0, Math.min(255, r + n));
      data[i + 1] = Math.max(0, Math.min(255, g + n));
      data[i + 2] = Math.max(0, Math.min(255, b + n));
      data[i + 3] = 255;
    }
  }
  return data;
}

// The seeded thread systems, as the server would hand them to the pipeline (G-132).
const base = { longerSideStitches: 200, colorCount: 30, quantizer: "latest", threads: 1, threadSystems: requestSystems() };
const CASES: Array<[string, Record<string, unknown>]> = [
  ["standard, 200 stitches", base],
  ["DMC threads", { ...base, paletteMode: "dmc" }],
  ["Crisp+", { ...base, edgeMode: "crisp-plus" }],
  ["hand-drawn dither", { ...base, ditherMode: "hand-drawn" }],
  ["Vivid with photo sliders", { ...base, vivid: true, photoAdjust: { brightness: 10, contrast: 20, saturation: 30, temperature: -15 } }],
  [
    "traced lines and texture strokes",
    { ...base, backstitchLines: true, backstitchPhotos: true, textureStrokes: true, textureDensity: 0.6 },
  ],
  [
    "a chosen set of five colours",
    {
      ...base,
      paletteSet: {
        mode: "full",
        colors: [{ rgb: [220, 70, 60] }, { rgb: [60, 90, 200] }, { rgb: [200, 200, 90] }, { rgb: [25, 20, 30] }, { rgb: [120, 170, 140] }],
      },
    },
  ],
  ["standard, 1000 stitches", { ...base, longerSideStitches: 1000 }],
];

const dir = mkdtempSync(path.join(os.tmpdir(), "cs-measure-"));
const [width, height] = [1600, 1200];
const file = path.join(dir, "picture.rgba");
writeFileSync(file, picture(width, height));

console.log(`| Case | Median of ${repeat} runs | Slowest stage | Chart |`);
console.log("|---|---|---|---|");
const optionsFile = path.join(dir, "options.json");
for (const [name, options] of CASES) {
  writeFileSync(optionsFile, JSON.stringify(options));
  const stdout = execFileSync(bench, ["generate", file, String(width), String(height), `@${optionsFile}`, String(repeat)], {
    maxBuffer: 1 << 30,
    encoding: "utf8",
  });
  const { pattern, runs } = JSON.parse(stdout) as {
    pattern: Record<string, unknown>;
    runs: Array<{ totalMs: number; stages: Record<string, number> }>;
  };
  const sorted = [...runs].sort((a, b) => a.totalMs - b.totalMs);
  const median = sorted[Math.floor(sorted.length / 2)];
  const [stage, ms] = Object.entries(median.stages ?? {}).sort((a, b) => b[1] - a[1])[0] ?? ["?", 0];
  const hash = createHash("sha256").update(JSON.stringify(pattern)).digest("hex").slice(0, 12);
  console.log(`| ${name} | ${median.totalMs.toFixed(0)} ms | ${stage} ${ms.toFixed(0)} ms | ${hash} |`);
}
rmSync(dir, { recursive: true, force: true });
