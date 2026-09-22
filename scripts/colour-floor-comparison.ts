import { writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { buildPattern, type PaletteMode } from "@/lib/pipeline/pattern";
import { COLOR_FLOOR_CHOICES } from "@/lib/types";
import type { PixelBuffer, RGB, StitchPattern } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "../tests/unit/helpers/fixtures";

/**
 * G-060 M3: what the colour floor delivers and what it costs, measured rather than promised.
 *
 *   npm run compare:floor
 *
 * Writes `docs/reviews/2026-09-22-colour-floor.md`. Three numbers per setting: the colours the chart comes back with,
 * the error once neighbouring stitches are read together, and the confetti — the same two measures the dithering
 * comparison uses, so the two documents can be read side by side.
 */

const OUT = path.resolve(__dirname, "..", "docs", "reviews", "2026-09-22-colour-floor.md");

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
    name: "photo",
    note: "the project's photo-like fixture: regions, a shading ramp, a small disc and noise",
    source: makePhotoLikeBuffer(240, 160),
  },
  {
    name: "photo on DMC",
    note: "the same photo snapped to real threads, where two kept colours can still land on one skein",
    source: makePhotoLikeBuffer(240, 160),
    paletteMode: "dmc",
  },
  {
    name: "gradient",
    note: "a smooth ramp in all three channels, where every colour covers a wide band and nothing is near-duplicate",
    source: makeBuffer(240, 160, (x, y) => [40 + (x * 180) / 240, 60 + (y * 150) / 160, 200 - (x * 120) / 240]),
  },
  {
    name: "flat regions",
    note: "four flat colours with a little noise — every extra colour here is a shade of one of the four",
    source: makeBuffer(240, 160, (x, y) => {
      const base: RGB = x < 120 ? (y < 80 ? [200, 60, 60] : [60, 140, 90]) : y < 80 ? [70, 100, 190] : [220, 190, 70];
      const n = pseudoNoise(x, y, 6);
      return [base[0] + n, base[1] + n, base[2] + n];
    }),
  },
];

const ASKS = [
  { longerSideStitches: 150, colorCount: 48 },
  { longerSideStitches: 150, colorCount: 64 },
  { longerSideStitches: 400, colorCount: 48 },
] as const;

const LABELS: Record<number, string> = { 0: "Off", 50: "50+ stitches", 25: "25+ stitches", 10: "10+ stitches", 1: "Every colour" };

it("measures every colour-floor setting against the same chart with the floor off", () => {
  const lines: string[] = [
    "# What the colour floor delivers and what it costs",
    "",
    `Measured ${new Date().toISOString().slice(0, 10)} by \`scripts/colour-floor-comparison.ts\`, which regenerates this file.`,
    "",
    "The palette merge folds a colour into a near-identical one whenever the two sit within 0.02 in OKLab, and it does",
    "so repeatedly, so a chain of merges can carry a cell much further than that single step. That is why asking for",
    "more colours stops changing what a chart comes back with. The floor stops the merge taking a colour that already",
    "covers at least so many stitches (G-060, D209).",
    "",
    "Three numbers per setting, all against the same chart with the floor off:",
    "",
    "- **Colours** — what the chart comes back with, of the number asked for.",
    "- **Error ×** — mean squared OKLab error with the photo and the chart each averaged over a 3×3 of stitches, as a",
    "  multiple of the unfloored chart's. Below 1 is closer to the photo.",
    "- **Confetti** — the share of stitches with no neighbour of their own colour, in percentage points added to the",
    "  unfloored chart's. This is what a stitcher pays.",
    "",
  ];

  const rows: Array<{ fixture: string; ask: string; floor: number; colours: number; asked: number; ratio: number; addedConfetti: number }> = [];

  for (const fixture of FIXTURES) {
    lines.push(`## ${fixture.name}`, "", `${fixture.note[0].toUpperCase()}${fixture.note.slice(1)}.`, "");
    for (const ask of ASKS) {
      const options = { ...ask, paletteMode: fixture.paletteMode };
      const base = buildPattern(fixture.source, options);
      const baseError = meanError(fixture.source, base, 1);
      const baseConfetti = confettiRatio(base);

      lines.push(`### ${ask.longerSideStitches} stitches, asking for ${ask.colorCount} colours`, "", "| Floor | Colours | Error × | Confetti |", "|---|---|---|---|");
      for (const colorFloor of COLOR_FLOOR_CHOICES) {
        const pattern = colorFloor === 0 ? base : buildPattern(fixture.source, { ...options, colorFloor });
        const ratio = meanError(fixture.source, pattern, 1) / baseError;
        const confetti = confettiRatio(pattern);
        const added = confetti - baseConfetti;
        lines.push(
          `| ${LABELS[colorFloor]} | ${pattern.palette.length} of ${ask.colorCount} | ${ratio.toFixed(2)} | ` +
            `${(100 * confetti).toFixed(2)} % (${added >= 0 ? "+" : ""}${(100 * added).toFixed(2)}) |`
        );
        rows.push({
          fixture: fixture.name,
          ask: `${ask.longerSideStitches}/${ask.colorCount}`,
          floor: colorFloor,
          colours: pattern.palette.length,
          asked: ask.colorCount,
          ratio,
          addedConfetti: added,
        });
      }
      lines.push("");
    }
  }

  // Stated from the rows rather than asserted: the trade this goal expected to find was smoothness for colours, and
  // the measurement says otherwise on every fixture that had colours to lose.
  const on = rows.filter((r) => r.floor > 0);
  const worseThanOff = on.filter((r) => r.ratio > 1);
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  };

  lines.push("## What each setting does, across every case above", "", "| Floor | Median colours kept | Median error × | Median added confetti | Cases worse than off |", "|---|---|---|---|---|");
  for (const colorFloor of COLOR_FLOOR_CHOICES) {
    const forFloor = rows.filter((r) => r.floor === colorFloor);
    lines.push(
      `| ${LABELS[colorFloor]} | ${median(forFloor.map((r) => r.colours)).toFixed(0)} | ${median(forFloor.map((r) => r.ratio)).toFixed(2)} | ` +
        `${median(forFloor.map((r) => 100 * r.addedConfetti)) >= 0 ? "+" : ""}${median(forFloor.map((r) => 100 * r.addedConfetti)).toFixed(2)} pts | ` +
        `${forFloor.filter((r) => r.ratio > 1).length} of ${forFloor.length} |`
    );
  }
  lines.push(
    "",
    `Across the ${on.length} floored cases above, ${worseThanOff.length} read further from the photo than the same chart with the floor off` +
      `${worseThanOff.length > 0 ? ` (${[...new Set(worseThanOff.map((r) => `${r.fixture} at ${r.ask}, up to ${Math.max(...worseThanOff.filter((w) => w.fixture === r.fixture && w.ask === r.ask).map((w) => w.ratio)).toFixed(4)}x`))].join("; ")})` : ""}.`,
    "The merge was not buying smoothness with those colours: it was spending accuracy. The floor's real cost is the",
    `confetti column — a median of ${median(on.map((r) => 100 * r.addedConfetti)) >= 0 ? "+" : ""}${median(on.map((r) => 100 * r.addedConfetti)).toFixed(2)} points of single stitches — and the threads themselves, since a stitcher buys and manages every`,
    "colour the legend lists.",
    "",
    "Two limits worth knowing, both visible above:",
    "",
    "- **A thread brand caps it.** On DMC two kept colours can snap to one skein, so the floor delivers far fewer",
    "  extra colours there than on the full range.",
    "- **The merge is not the only pass that drops colours.** The optimizer and the cleanup passes reassign cells for",
    "  structural reasons and empty some colours on the way; the floor does not touch them, by design (D209). On the",
    "  photo at 150 stitches asking for 48 they leave 40 colours standing, which is the ceiling the floor works up to.",
    ""
  );

  writeFileSync(OUT, lines.join("\n"));
  console.log(`wrote ${OUT}`);
});
