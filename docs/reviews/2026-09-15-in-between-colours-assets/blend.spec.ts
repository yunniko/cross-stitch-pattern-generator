import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { oklabDistanceSquared, rgbToOklab } from "@/lib/color/color";
import { allCellIndices, buildCrispEvidenceLayer } from "@/lib/crisp/crisp-evidence-layer";
import { buildPattern } from "@/lib/pipeline/pattern";
import { EMPTY_CELL, type PixelBuffer, type RGB } from "@/lib/types";
import { pseudoNoise } from "@/tests/unit/helpers/fixtures";

// Four flat regions with anti-aliased edges, then a Gaussian blur of sigma = k * cell size, plus mild noise.
const COLORS: RGB[] = [
  [40, 70, 160], // 0 background blue
  [200, 40, 40], // 1 red disk
  [60, 160, 80], // 2 green rectangle
  [230, 200, 60], // 3 yellow diagonal band
];

function labelAt(x: number, y: number, W: number, H: number): number {
  let l = 0;
  if ((x - 0.33 * W) ** 2 + (y - 0.5 * H) ** 2 < (0.3 * H) ** 2) l = 1;
  if (x > 0.6 * W && x < 0.9 * W && y > 0.15 * H && y < 0.55 * H) l = 2;
  if (Math.abs(x - 0.45 * W - (y - 0.5 * H) * 0.8) < 0.05 * W) l = 3;
  return l;
}

function render(W: number, H: number, sigma: number, noise: number): { img: PixelBuffer; labels: Uint8Array } {
  const labels = new Uint8Array(W * H);
  const rgb = new Float32Array(W * H * 3);
  const SS = 4;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const counts = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) counts[labelAt(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, W, H)]++;
      labels[y * W + x] = labelAt(x + 0.5, y + 0.5, W, H);
      for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let l = 0; l < 4; l++) v += (counts[l] / (SS * SS)) * COLORS[l][c];
        rgb[(y * W + x) * 3 + c] = v;
      }
    }
  let out = rgb;
  if (sigma > 0) {
    const r = Math.ceil(sigma * 3);
    const k = new Float32Array(2 * r + 1);
    let s = 0;
    for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
    for (let i = 0; i < k.length; i++) k[i] /= s;
    const tmp = new Float32Array(rgb.length);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        for (let c = 0; c < 3; c++) {
          let v = 0;
          for (let i = -r; i <= r; i++) v += k[i + r] * rgb[(y * W + Math.min(W - 1, Math.max(0, x + i))) * 3 + c];
          tmp[(y * W + x) * 3 + c] = v;
        }
    out = new Float32Array(rgb.length);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        for (let c = 0; c < 3; c++) {
          let v = 0;
          for (let i = -r; i <= r; i++) v += k[i + r] * tmp[(Math.min(H - 1, Math.max(0, y + i)) * W + x) * 3 + c];
          out[(y * W + x) * 3 + c] = v;
        }
  }
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const n = noise ? pseudoNoise(i % W, Math.floor(i / W), noise) : 0;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(out[i * 3 + c] + n);
    data[i * 4 + 3] = 255;
  }
  return { img: { data, width: W, height: H }, labels };
}

const TOL2 = 0.06 ** 2;
const truthLab = COLORS.map((c) => rgbToOklab(c));
const nearestTruth = (rgb: RGB) => {
  const lab = rgbToOklab(rgb);
  let best = -1;
  let bestD = Infinity;
  truthLab.forEach((t, i) => {
    const d = oklabDistanceSquared(lab, t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return bestD <= TOL2 ? best : -1;
};

it("in-between colours by blur width, colour budget and edge mode", () => {
  const rows: Record<string, unknown>[] = [];
  const CELL = 8;
  const W = 480;
  const H = 320;
  for (const blurCells of [0, 0.1, 0.25, 0.5, 1]) {
    const { img, labels } = render(W, H, blurCells * CELL, 6);
    const gw = W / CELL;
    const gh = H / CELL;
    // Truth per cell: the set of labels present in its footprint.
    const present: number[][] = [];
    for (let cy = 0; cy < gh; cy++)
      for (let cx = 0; cx < gw; cx++) {
        const set = new Set<number>();
        for (let y = cy * CELL; y < (cy + 1) * CELL; y++) for (let x = cx * CELL; x < (cx + 1) * CELL; x++) set.add(labels[y * W + x]);
        present.push([...set]);
      }
    const boundaryCells = present.filter((p) => p.length > 1).length;
    const layer = buildCrispEvidenceLayer(img, gw, gh, allCellIndices(gw, gh));
    let confidentBoundary = 0;
    for (const idx of layer.evidenceByCell.keys()) if (present[idx].length > 1) confidentBoundary++;

    for (const colorCount of [4, 8, 16]) {
      for (const edgeMode of ["standard", "crisp"] as const) {
        const p = buildPattern(img, { longerSideStitches: gw, colorCount, edgeMode });
        if (p.width !== gw || p.height !== gh) throw new Error(`grid ${p.width}x${p.height}`);
        const paletteTruth = p.palette.map((c) => nearestTruth(c.rgb));
        let offInterior = 0;
        let offBoundary = 0;
        let wrongInterior = 0;
        for (let i = 0; i < p.cellPalette.length; i++) {
          const v = p.cellPalette[i];
          if (v === EMPTY_CELL) continue;
          const t = paletteTruth[v];
          const isBoundary = present[i].length > 1;
          if (t === -1) {
            if (isBoundary) offBoundary++;
            else offInterior++;
          } else if (!present[i].includes(t)) wrongInterior++;
        }
        rows.push({
          blurCells,
          colorCount,
          edgeMode,
          palette: p.palette.length,
          offPalette: paletteTruth.filter((t) => t === -1).length,
          boundaryCells,
          offBoundary,
          offInterior,
          wrongRegion: wrongInterior,
          crispConfidentBoundary: edgeMode === "crisp" ? confidentBoundary : "",
        });
      }
    }
  }
  console.table(rows);
  writeFileSync(new URL("./blend-results.json", import.meta.url), JSON.stringify(rows, null, 2));
});
