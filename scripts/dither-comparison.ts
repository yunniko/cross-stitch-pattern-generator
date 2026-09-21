import { writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import { DITHER_MODES, type DitherMode } from "@/lib/pipeline/dither";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { buildPattern, type PaletteMode } from "@/lib/pipeline/pattern";
import type { PixelBuffer, RGB, StitchPattern } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "../tests/unit/helpers/fixtures";

/**
 * G-052 M3: what each dither pattern costs and buys, measured rather than judged by eye.
 *
 *   npm run compare:dither
 *
 * Writes `docs/reviews/2026-09-21-dithering-comparison.md`. Two numbers per pattern: the error once neighbouring
 * stitches are read together (which is what dithering is for) and the confetti ratio (which is what it costs).
 */

const OUT = path.resolve(__dirname, "..", "docs", "reviews", "2026-09-21-dithering-comparison.md");

/** Mean squared OKLab error, both sides averaged over a radius of stitches; radius 0 is per stitch. */
function meanError(source: PixelBuffer, pattern: StitchPattern, radius: number): number {
  const { width, height } = pattern;
  const cells = downsampleToGrid(source, width, height);
  const want = new Float64Array(width * height * 3);
  const got = new Float64Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    want.set(rgbToOklab([cells.data[i * 3], cells.data[i * 3 + 1], cells.data[i * 3 + 2]]), i * 3);
    got.set(rgbToOklab(pattern.palette[pattern.cellPalette[i]].rgb), i * 3);
  }
  const blur = (src: Float64Array) => {
    if (radius === 0) return src;
    const out = new Float64Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let n = 0;
        let l = 0;
        let a = 0;
        let b = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            const o = (yy * width + xx) * 3;
            l += src[o];
            a += src[o + 1];
            b += src[o + 2];
            n++;
          }
        }
        const o = (y * width + x) * 3;
        out[o] = l / n;
        out[o + 1] = a / n;
        out[o + 2] = b / n;
      }
    }
    return out;
  };
  const w = blur(want);
  const g = blur(got);
  let total = 0;
  for (let i = 0; i < width * height; i++) {
    total += (w[i * 3] - g[i * 3]) ** 2 + (w[i * 3 + 1] - g[i * 3 + 1]) ** 2 + (w[i * 3 + 2] - g[i * 3 + 2]) ** 2;
  }
  return total / (width * height);
}

/** The share of stitches whose four neighbours are all a different colour: this project's confetti measure. */
function confettiRatio(pattern: StitchPattern): number {
  const { width, height, cellPalette } = pattern;
  let isolated = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const here = cellPalette[y * width + x];
      let same = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (cellPalette[ny * width + nx] === here) same++;
      }
      if (same === 0) isolated++;
    }
  }
  return isolated / (width * height);
}

const FIXTURES: Array<{ name: string; note: string; source: PixelBuffer; paletteMode?: PaletteMode }> = [
  {
    name: "gradient",
    note: "a smooth ramp in all three channels — the case dithering exists for",
    source: makeBuffer(240, 160, (x, y) => [40 + (x * 180) / 240, 60 + (y * 150) / 160, 200 - (x * 120) / 240]),
  },
  {
    name: "photo",
    note: "the project's photo-like fixture: regions, a shading ramp, a small disc and noise",
    source: makePhotoLikeBuffer(240, 160),
  },
  {
    name: "flat regions",
    note: "four flat colours with a little noise — nothing to dither, so this is where the cost shows with no gain",
    source: makeBuffer(240, 160, (x, y) => {
      const base: RGB = x < 120 ? (y < 80 ? [200, 60, 60] : [60, 140, 90]) : y < 80 ? [70, 100, 190] : [220, 190, 70];
      const n = pseudoNoise(x, y, 6);
      return [base[0] + n, base[1] + n, base[2] + n];
    }),
  },
  {
    name: "photo on DMC",
    note: "the same photo snapped to real threads, where the palette is at its least evenly spaced",
    source: makePhotoLikeBuffer(240, 160),
    paletteMode: "dmc",
  },
];

const COLOUR_COUNTS = [8, 16, 32];

it("measures every dither pattern against the same chart undithered", () => {
  const lines: string[] = [
    "# What each dither pattern costs and buys",
    "",
    `Measured ${new Date().toISOString().slice(0, 10)} by \`scripts/dither-comparison.ts\`, which regenerates this file.`,
    "",
    "Two numbers per pattern, both against the same chart undithered:",
    "",
    "- **Error ×** — mean squared OKLab error with the photo and the chart each averaged over a 3×3 of stitches, as a",
    "  multiple of the undithered chart's. Below 1 is better. This is the measure dithering is for: a stitched piece is",
    "  read with neighbouring stitches together, not one at a time.",
    "- **Confetti** — the share of stitches with no neighbour of their own colour, in percentage points added to the",
    "  undithered chart's. This is what dithering costs a stitcher.",
    "",
    "Per-stitch error is reported separately at the end, because it moves for two reasons at once.",
    "",
  ];

  const perStitch: Array<{ fixture: string; mode: string; ratio: number }> = [];
  const verdict: Array<{ fixture: string; colorCount: number; mode: string; ratio: number; addedConfetti: number }> = [];

  for (const fixture of FIXTURES) {
    lines.push(`## ${fixture.name}`, "", `${fixture.note[0].toUpperCase()}${fixture.note.slice(1)}.`, "");
    for (const colorCount of COLOUR_COUNTS) {
      const options = { longerSideStitches: 80, colorCount, paletteMode: fixture.paletteMode };
      const plain = buildPattern(fixture.source, options);
      const plainError = meanError(fixture.source, plain, 1);
      const plainConfetti = confettiRatio(plain);
      const plainPerStitch = meanError(fixture.source, plain, 0);

      lines.push(`### ${colorCount} colours`, "", "| Pattern | Error × | Confetti |", "|---|---|---|");
      lines.push(`| none | 1.00 | ${(100 * plainConfetti).toFixed(1)} % |`);
      for (const ditherMode of DITHER_MODES.filter((m) => m !== "off") as DitherMode[]) {
        const dithered = buildPattern(fixture.source, { ...options, ditherMode });
        const ratio = meanError(fixture.source, dithered, 1) / plainError;
        const confetti = confettiRatio(dithered);
          lines.push(`| ${ditherMode} | ${ratio.toFixed(2)} | ${(100 * confetti).toFixed(1)} % (+${(100 * (confetti - plainConfetti)).toFixed(1)}) |`);
      verdict.push({ fixture: fixture.name, colorCount, mode: ditherMode, ratio, addedConfetti: confetti - plainConfetti });
        if (colorCount === 16) {
          perStitch.push({ fixture: fixture.name, mode: ditherMode, ratio: meanError(fixture.source, dithered, 0) / plainPerStitch });
        }
      }
      lines.push("");
    }
  }

  // Stated from the numbers rather than asserted: an earlier draft of this file claimed dithering is always worse per
  // stitch, and its own photo rows disagreed.
  const worse = perStitch.filter((r) => r.ratio > 1);
  const better = perStitch.filter((r) => r.ratio <= 1);
  const summarise = (rows: typeof perStitch) => {
    const byFixture = new Map<string, number[]>();
    for (const row of rows) byFixture.set(row.fixture, [...(byFixture.get(row.fixture) ?? []), row.ratio]);
    return [...byFixture]
      .map(([fixture, ratios]) => `${fixture} ${Math.min(...ratios).toFixed(2)}–${Math.max(...ratios).toFixed(2)}×`)
      .join(", ");
  };
  // Which pattern to reach for, summarised from the rows above rather than from taste. Medians, not extremes: on a
  // fixture the undithered chart already fits almost exactly (flat regions at 32 colours) the ratio swings both ways
  // on a difference too small to see, and a best-case column would be that case every time.
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  };
  const modes = [...new Set(verdict.map((v) => v.mode))];
  const summary = modes.map((mode) => {
    const rows = verdict.filter((v) => v.mode === mode);
    return {
      mode,
      error: median(rows.map((r) => r.ratio)),
      confetti: median(rows.map((r) => 100 * r.addedConfetti)),
      worst: Math.max(...rows.map((r) => r.ratio)),
      losses: rows.filter((r) => r.ratio >= 1).map((r) => `${r.fixture} at ${r.colorCount}`),
    };
  });
  lines.push("## Where each pattern wins", "", "| Pattern | Median error × | Median added confetti | Worst error × | Loses to plain |", "|---|---|---|---|---|");
  for (const row of summary) {
    lines.push(
      `| ${row.mode} | ${row.error.toFixed(2)} | +${row.confetti.toFixed(1)} pts | ${row.worst.toFixed(2)} | ${row.losses.length > 0 ? row.losses.join(", ") : "never"} |`
    );
  }

  // Stated from the medians: an earlier version of this file asserted a two-group split that its own rows stopped
  // supporting the moment a pattern arrived that is cheap and accurate at once.
  const byConfetti = [...summary].sort((a, b) => a.confetti - b.confetti);
  const byError = [...summary].sort((a, b) => a.error - b.error);
  const cheapest = byConfetti.slice(0, 3).map((r) => r.mode);
  const mostAccurate = byError.slice(0, 3).map((r) => r.mode);
  const both = mostAccurate.filter((mode) => cheapest.includes(mode));
  const reliable = summary.filter((r) => r.losses.length === 0).map((r) => r.mode);
  lines.push(
    "",
    `Cheapest in confetti: ${cheapest.join(", ")}. Closest to the photo: ${mostAccurate.join(", ")}.`,
    both.length > 0
      ? `**${both.join(", ")}** ${both.length === 1 ? "is in both lists" : "are in both lists"}, which makes ${both.length === 1 ? "it" : "them"} the first thing to reach for.`
      : "No pattern is in both lists, so the choice is a trade every time.",
    `Never worse than the undithered chart on any fixture: ${reliable.length > 0 ? reliable.join(", ") : "none"}.`,
    "",
    "The threshold matrices trade along one line: those that scatter their stitches (Bayer, blue noise, the diagonal",
    "screen) fit the photo closest and leave the most stitches standing alone, while those that cluster them (the dot,",
    "ring and line screens) cost a stitcher least and help least — and on a noisy photo at few colours can lose",
    "outright. The two error-diffusion kernels are off that line: they adapt to the photo rather than repeating a tile,",
    "so they reach the lowest error of all while sitting mid-table on confetti, and neither ever loses.",
    "",
    ...(() => {
      const drawn = summary.find((row) => row.mode === "hand-drawn");
      if (!drawn) return [];
      return [
        `The drawn marks (\`hand-drawn\`) are a third thing again: placed across the chart rather than tiled or diffused,`,
        `they cost about what a screen costs (+${drawn.confetti.toFixed(1)} points) and fit about as closely`,
        `(${drawn.error.toFixed(2)}×), because a mark is a cluster wherever it lands. What they buy is not accuracy but`,
        "how the chart reads — the reason to reach for them is the look, and the table above is only there to show what",
        "that look costs.",
      ];
    })(),
    "",
  );
  lines.push(
    "## Per-stitch error, and why it moves both ways",
    "",
    "At 16 colours, each pattern's per-stitch error against the same chart undithered:",
    "",
    `- **Worse** (dithering costs accuracy stitch by stitch, which is the trade it makes): ${worse.length > 0 ? summarise(worse) : "none"}.`,
    `- **Better**: ${better.length > 0 ? summarise(better) : "none"}.`,
    "",
    "Both directions are expected, for different reasons. Dithering gives a stitch the wrong thread on purpose, which",
    "costs per-stitch accuracy on a smooth ramp where the undithered chart was already close. But an undithered chart",
    "also runs the optimizer, which trades colour accuracy for smoothness — so on a photo the dithered chart, which",
    "skips it, can be closer stitch by stitch as well. The 3×3 tables above are the measure that does not mix the two.",
    "",
  );
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(`wrote ${OUT}`);
});
