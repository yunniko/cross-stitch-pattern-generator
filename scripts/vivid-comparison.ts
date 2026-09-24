import { writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { rgbToOklab } from "@/lib/color/color";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { buildPattern, type PaletteMode } from "@/lib/pipeline/pattern";
import { plainKMeansQuantizer } from "@/lib/pipeline/quantize";
import type { PixelBuffer, RGB, StitchPattern } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "../tests/unit/helpers/fixtures";

/**
 * G-061 M2: what Vivid delivers and what it costs, and which share of a cell it should keep.
 *
 *   npm run compare:vivid
 *
 * Writes `docs/reviews/2026-09-22-vivid.md`. The Owner's own two photos are measured but not committed — they are
 * personal photographs, and this repository is public. Point `VIVID_PHOTOS` at them to reproduce those rows; the
 * fixtures alone reproduce everything else.
 */

const OUT = path.resolve(__dirname, "..", "docs", "reviews", "2026-09-22-vivid.md");
const PHOTO_DIR = process.env.VIVID_PHOTOS;

const chromaOf = (rgb: RGB) => {
  const [, a, b] = rgbToOklab(rgb);
  return Math.sqrt(a * a + b * b);
};
const hueOf = (rgb: RGB) => {
  const [, a, b] = rgbToOklab(rgb);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};
function familyOf(rgb: RGB): string {
  if (chromaOf(rgb) < 0.03) return "neutral";
  const h = hueOf(rgb);
  if (h < 20 || h >= 340) return "red/pink";
  if (h < 60) return "orange/brown";
  if (h < 110) return "yellow";
  if (h < 170) return "green";
  if (h < 250) return "cyan/blue";
  if (h < 300) return "blue/violet";
  return "violet/magenta";
}

async function load(file: string): Promise<PixelBuffer> {
  const image = await loadImage(file);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height);
  return { data: new Uint8ClampedArray(data.data), width: image.width, height: image.height };
}

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

function confettiRatio(pattern: StitchPattern): number {
  const { width, height, cellPalette } = pattern;
  let isolated = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const here = cellPalette[y * width + x];
      let same = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
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

/** The colour count at which a hue family first gets a thread, or null if it never does in the range searched. */
function firstAppearance(source: PixelBuffer, family: string, vivid: boolean, stitches: number, paletteMode?: PaletteMode): number | null {
  for (const colorCount of [8, 12, 16, 20, 24, 32, 40, 48, 64]) {
    const pattern = buildPattern(source, { longerSideStitches: stitches, colorCount, vivid, paletteMode });
    if (pattern.palette.some((c) => familyOf(c.rgb) === family)) return colorCount;
  }
  return null;
}

/** Families the photo's own full-resolution pixels hold in a quantity worth a thread. */
function sourceFamilies(source: PixelBuffer): string[] {
  const counts = new Map<string, number>();
  const total = source.width * source.height;
  for (let i = 0; i < total; i++) {
    const rgb: RGB = [source.data[i * 4], source.data[i * 4 + 1], source.data[i * 4 + 2]];
    counts.set(familyOf(rgb), (counts.get(familyOf(rgb)) ?? 0) + 1);
  }
  return [...counts]
    .filter(([f, n]) => f !== "neutral" && n / total >= 0.002)
    .sort((a, b) => b[1] - a[1])
    .map(([f]) => f);
}

it("measures Vivid against the same chart with it off", async () => {
  const fixtures: Array<{ name: string; note: string; source: PixelBuffer; paletteMode?: PaletteMode }> = [
    {
      name: "photo fixture",
      note: "the project's photo-like fixture: regions, a shading ramp, a small disc and noise",
      source: makePhotoLikeBuffer(240, 160),
    },
    {
      name: "photo fixture on DMC",
      note: "the same fixture snapped to real threads",
      source: makePhotoLikeBuffer(240, 160),
      paletteMode: "dmc",
    },
    {
      name: "gradient",
      note: "a smooth ramp in all three channels, where every cell is already its own colour",
      source: makeBuffer(240, 160, (x, y) => [40 + (x * 180) / 240, 60 + (y * 150) / 160, 200 - (x * 120) / 240]),
    },
    {
      name: "flat regions",
      note: "four flat colours with a little noise — nothing inside a cell to disagree about, so Vivid should do almost nothing",
      source: makeBuffer(240, 160, (x, y) => {
        const base: RGB = x < 120 ? (y < 80 ? [200, 60, 60] : [60, 140, 90]) : y < 80 ? [70, 100, 190] : [220, 190, 70];
        const n = pseudoNoise(x, y, 6);
        return [base[0] + n, base[1] + n, base[2] + n];
      }),
    },
  ];

  if (PHOTO_DIR) {
    fixtures.unshift(
      {
        name: "lattice portrait",
        note: "the Owner's photo: a subject under a wooden lattice, with small red and blue on a dark shirt (not committed)",
        source: await load(path.join(PHOTO_DIR, "6.jpg")),
      },
      {
        name: "cat with flowers",
        note: "the Owner's photo: a grey cat on cream with pale pink and violet flowers (not committed)",
        source: await load(path.join(PHOTO_DIR, "7.png")),
      }
    );
  }

  const lines: string[] = [
    "# What Vivid delivers and what it costs",
    "",
    `Measured ${new Date().toISOString().slice(0, 10)} by \`scripts/vivid-comparison.ts\`, which regenerates this file.`,
    "",
    "A stitch covers many pixels, and today it is their average. When a small saturated thing sits inside one stitch —",
    "a red print on a dark shirt, a pink petal against cream — the average is a neutral, and the colour is gone before",
    "any palette is chosen. Vivid keeps the area mean's **lightness** and takes the **chroma** of the cell's most",
    "colourful quarter, so the colour is still on the grid when the quantizer looks (G-061, D211). It then reserves a",
    "thread for each hue the cells hold that the palette does not speak for, paid for by merging the closest pair of",
    "threads, because a colour covering half a percent of a chart never wins a slot by squared error (G-062, D212).",
    "",
    "- **First thread** — the colour count at which a hue family first gets a thread of its own. Lower is better;",
    "  `never` means not by 64 colours.",
    "- **Error ×** — mean squared OKLab error against the photo, both averaged over a 3×3 of stitches, as a multiple",
    "  of the same chart with Vivid off. Measured against the *unmodified* photo, so Vivid is not graded on its own",
    "  terms.",
    "- **Coloured threads** — how many of the chart's threads carry chroma 0.06 or more, which is where a colour stops",
    "  reading as a tinted grey.",
    "- **Confetti** — the share of stitches with no neighbour of their own colour, in points added.",
    "",
  ];

  // The share is the one number this goal has to choose. Off is 0.
  const SHARES = [0, 0.5, 0.25, 0.1];
  const shareLabel = (s: number) => (s === 0 ? "off" : `top ${(100 * s).toFixed(0)}%`);
  const rows: Array<{ fixture: string; share: number; ratio: number; addedConfetti: number }> = [];

  for (const fixture of fixtures) {
    lines.push(`## ${fixture.name}`, "", `${fixture.note[0].toUpperCase()}${fixture.note.slice(1)}.`, "");

    const families = sourceFamilies(fixture.source);
    if (families.length > 0) {
      lines.push(
        `Hue families in the photo itself: ${families.join(", ")}.`,
        "",
        "| Hue | First thread, off | First thread, Vivid |",
        "|---|---|---|"
      );
      for (const family of families) {
        const off = firstAppearance(fixture.source, family, false, 100, fixture.paletteMode);
        const on = firstAppearance(fixture.source, family, true, 100, fixture.paletteMode);
        lines.push(`| ${family} | ${off ?? "never"} | ${on ?? "never"} |`);
      }
      lines.push("");
    }

    lines.push("| Share kept | Colours at 24 | Hue families | Coloured threads | Error × | Confetti |", "|---|---|---|---|---|---|");
    let base = { error: 0, confetti: 0 };
    for (const share of SHARES) {
      const pattern = buildPattern(fixture.source, {
        longerSideStitches: 100,
        colorCount: 24,
        vividTopShare: share > 0 ? share : undefined,
        paletteMode: fixture.paletteMode,
      });
      const error = meanError(fixture.source, pattern, 1);
      const confetti = confettiRatio(pattern);
      if (share === 0) base = { error, confetti };
      rows.push({ fixture: fixture.name, share, ratio: error / base.error, addedConfetti: confetti - base.confetti });
      lines.push(
        `| ${shareLabel(share)} | ${pattern.palette.length} | ${new Set(pattern.palette.map((c) => familyOf(c.rgb))).size} | ` +
          `${pattern.palette.filter((c) => chromaOf(c.rgb) >= 0.06).length} | ` +
          `${(error / base.error).toFixed(2)} | ` +
          `${(100 * confetti).toFixed(2)} % (${confetti - base.confetti >= 0 ? "+" : ""}${(100 * (confetti - base.confetti)).toFixed(2)}) |`
      );
    }
    lines.push("");

    // Classic as well as Refined, since the switch is independent of the algorithm (criterion 4, D040).
    const classicOff = buildPattern(fixture.source, {
      longerSideStitches: 100,
      colorCount: 24,
      quantizer: plainKMeansQuantizer,
      paletteMode: fixture.paletteMode,
    });
    const classicOn = buildPattern(fixture.source, {
      longerSideStitches: 100,
      colorCount: 24,
      quantizer: plainKMeansQuantizer,
      vivid: true,
      paletteMode: fixture.paletteMode,
    });
    const hues = (p: StitchPattern) => new Set(p.palette.map((c) => familyOf(c.rgb))).size;
    lines.push(
      `With Classic clustering instead of Refined, at 24 colours: ${hues(classicOff)} hue families off, ${hues(classicOn)} with Vivid ` +
        `(Refined: ${hues(buildPattern(fixture.source, { longerSideStitches: 100, colorCount: 24, paletteMode: fixture.paletteMode }))} and ` +
        `${hues(buildPattern(fixture.source, { longerSideStitches: 100, colorCount: 24, vivid: true, paletteMode: fixture.paletteMode }))}).`,
      ""
    );
  }

  const on = rows.filter((r) => r.share === 0.25);
  const worse = on.filter((r) => r.ratio > 1.05);
  lines.push(
    "## What it costs, across every case above",
    "",
    `Of ${on.length} fixtures with Vivid on, ${worse.length} read more than 5% further from the photo than with it off` +
      `${worse.length > 0 ? ` (${worse.map((r) => `${r.fixture} ${r.ratio.toFixed(2)}×`).join(", ")})` : ""}.`,
    `Added confetti ranges from ${Math.min(...on.map((r) => 100 * r.addedConfetti)).toFixed(2)} to ${Math.max(...on.map((r) => 100 * r.addedConfetti)).toFixed(2)} points.`,
    ""
  );

  writeFileSync(OUT, lines.join("\n"));
  console.log(`wrote ${OUT}`);
  for (const r of rows)
    console.log(`  ${r.fixture} ${shareLabel(r.share)}: error ${r.ratio.toFixed(3)}x, confetti ${(100 * r.addedConfetti).toFixed(2)}pt`);
});
