import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { oklabDistanceSquared, rgbToOklab } from "@/lib/color/color";
import { DEFAULT_BOUNDARY_EVIDENCE_OPTIONS, extractBoundaryEvidence, SourceOklabRows } from "@/lib/crisp/crisp-edge-evidence";
import { buildPattern } from "@/lib/pipeline/pattern";
import { EMPTY_CELL, type PixelBuffer, type RGB } from "@/lib/types";
import { pseudoNoise } from "@/tests/unit/helpers/fixtures";

// Same fixture as blend.spec.ts, duplicated so each scratch spec stands alone.
const COLORS: RGB[] = [
  [40, 70, 160],
  [200, 40, 40],
  [60, 160, 80],
  [230, 200, 60],
];
function labelAt(x: number, y: number, W: number, H: number): number {
  let l = 0;
  if ((x - 0.33 * W) ** 2 + (y - 0.5 * H) ** 2 < (0.3 * H) ** 2) l = 1;
  if (x > 0.6 * W && x < 0.9 * W && y > 0.15 * H && y < 0.55 * H) l = 2;
  if (Math.abs(x - 0.45 * W - (y - 0.5 * H) * 0.8) < 0.05 * W) l = 3;
  return l;
}
function blur(rgb: Float32Array, W: number, H: number, sigma: number): Float32Array {
  if (sigma <= 0) return rgb;
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(rgb.length);
  const out = new Float32Array(rgb.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let i = -r; i <= r; i++) v += k[i + r] * rgb[(y * W + Math.min(W - 1, Math.max(0, x + i))) * 3 + c];
        tmp[(y * W + x) * 3 + c] = v;
      }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let i = -r; i <= r; i++) v += k[i + r] * tmp[(Math.min(H - 1, Math.max(0, y + i)) * W + x) * 3 + c];
        out[(y * W + x) * 3 + c] = v;
      }
  return out;
}
function toBuffer(rgb: Float32Array, W: number, H: number, noise: number): PixelBuffer {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const n = noise ? pseudoNoise(i % W, Math.floor(i / W), noise) : 0;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(rgb[i * 3 + c] + n);
    data[i * 4 + 3] = 255;
  }
  return { data, width: W, height: H };
}
function renderRegions(W: number, H: number, sigma: number) {
  const labels = new Uint8Array(W * H);
  const rgb = new Float32Array(W * H * 3);
  const SS = 4;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const counts = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) counts[labelAt(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, W, H)]++;
      labels[y * W + x] = labelAt(x + 0.5, y + 0.5, W, H);
      for (let c = 0; c < 3; c++) for (let l = 0; l < 4; l++) rgb[(y * W + x) * 3 + c] += (counts[l] / (SS * SS)) * COLORS[l][c];
    }
  return { img: toBuffer(blur(rgb, W, H, sigma), W, H, 6), labels };
}
/** A smooth two-colour ramp plus a sky-like vertical gradient: every in-between colour here is legitimate. */
function renderRamp(W: number, H: number): PixelBuffer {
  const rgb = new Float32Array(W * H * 3);
  const a: RGB = [40, 70, 160];
  const b: RGB = [230, 200, 60];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = y < H / 2 ? x / (W - 1) : (y - H / 2) / (H / 2 - 1);
      for (let c = 0; c < 3; c++) rgb[(y * W + x) * 3 + c] = a[c] + (b[c] - a[c]) * t;
    }
  return toBuffer(rgb, W, H, 6);
}

const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/**
 * Candidate post-pass ("transition-strip snapping", colour-line / linear-unmixing test): a cell whose colour c lies close
 * to the segment between two other colours a and b found in its 5x5 window (linear RGB, 0.1 < t < 0.9, perpendicular
 * residual < 15% of |b-a|), where c forms a thin strip (few same-colour cells in the window) and a and b are both
 * well represented, is reassigned to a or b by t. Two passes, each reading the previous pass.
 */
function snapTransitions(cells: Uint8Array, W: number, H: number, paletteRgb: RGB[]): { cells: Uint8Array; changed: number } {
  const L = paletteRgb.map((c) => c.map(lin));
  const labs = paletteRgb.map((c) => rgbToOklab(c));
  let cur = cells;
  let changed = 0;
  for (let pass = 0; pass < 2; pass++) {
    const next = cur.slice();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const c = cur[i];
        if (c === EMPTY_CELL) continue;
        const counts = new Map<number, number>();
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const v = cur[yy * W + xx];
            if (v !== EMPTY_CELL) counts.set(v, (counts.get(v) ?? 0) + 1);
          }
        if ((counts.get(c) ?? 0) > 10) continue;
        const sides = [...counts].filter(([v, n]) => v !== c && n >= 6).map(([v]) => v);
        let best: { v: number; r: number } | null = null;
        for (let p = 0; p < sides.length; p++)
          for (let q = p + 1; q < sides.length; q++) {
            const a = sides[p];
            const b = sides[q];
            if (oklabDistanceSquared(labs[a], labs[b]) < 0.1 ** 2) continue;
            const ab = [0, 1, 2].map((k) => L[b][k] - L[a][k]);
            const ac = [0, 1, 2].map((k) => L[c][k] - L[a][k]);
            const len2 = ab.reduce((s, v) => s + v * v, 0);
            const t = ab.reduce((s, v, k) => s + v * ac[k], 0) / len2;
            if (t <= 0.1 || t >= 0.9) continue;
            const res2 = ac.reduce((s, v, k) => s + (v - t * ab[k]) ** 2, 0);
            const r = Math.sqrt(res2 / len2);
            if (r < 0.15 && (!best || r < best.r)) best = { v: t < 0.5 ? a : b, r };
          }
        if (best) {
          next[i] = best.v;
          changed++;
        }
      }
    cur = next;
  }
  return { cells: cur, changed };
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
const median = (xs: number[]) => (xs.length ? [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)] : NaN);

it("which Crisp confidence component fails on soft edges, and what snapping recovers", () => {
  const CELL = 8;
  const W = 480;
  const H = 320;
  const gw = W / CELL;
  const gh = H / CELL;
  const evidenceRows: Record<string, unknown>[] = [];
  const snapRows: Record<string, unknown>[] = [];
  for (const blurCells of [0, 0.1, 0.25, 0.5, 1]) {
    const { img, labels } = renderRegions(W, H, blurCells * CELL);
    const present: number[][] = [];
    for (let cy = 0; cy < gh; cy++)
      for (let cx = 0; cx < gw; cx++) {
        const set = new Set<number>();
        for (let y = cy * CELL; y < (cy + 1) * CELL; y++) for (let x = cx * CELL; x < (cx + 1) * CELL; x++) set.add(labels[y * W + x]);
        present.push([...set]);
      }
    // Evidence components on two-label boundary cells.
    const rows = new SourceOklabRows(img);
    const sharp: number[] = [];
    const spatial: number[] = [];
    const sep: number[] = [];
    const conf: number[] = [];
    for (let i = 0; i < present.length; i++) {
      if (present[i].length !== 2) continue;
      const e = extractBoundaryEvidence(img, gw, gh, i % gw, Math.floor(i / gw), DEFAULT_BOUNDARY_EVIDENCE_OPTIONS, rows);
      sharp.push(e.edgeSharpness);
      spatial.push(e.spatialSeparation);
      sep.push(e.modes.length === 2 ? Math.sqrt(oklabDistanceSquared(e.modes[0], e.modes[1])) : 0);
      conf.push(e.confidence);
    }
    evidenceRows.push({
      blurCells,
      twoLabelCells: sharp.length,
      medianEdgeSharpness: median(sharp).toFixed(3),
      medianSpatialSeparation: median(spatial).toFixed(3),
      medianModeDistance: median(sep).toFixed(3),
      medianConfidence: median(conf).toFixed(3),
      shareConfidence70: (conf.filter((c) => c >= 0.7).length / conf.length).toFixed(3),
    });

    for (const colorCount of [8, 16]) {
      const p = buildPattern(img, { longerSideStitches: gw, colorCount, edgeMode: "crisp" });
      const score = (cells: Uint8Array) => {
        const pt = p.palette.map((c) => nearestTruth(c.rgb));
        let offBoundary = 0;
        let offInterior = 0;
        let wrong = 0;
        const used = new Set<number>();
        for (let i = 0; i < cells.length; i++) {
          const v = cells[i];
          used.add(v);
          const t = pt[v];
          if (t === -1) {
            if (present[i].length > 1) offBoundary++;
            else offInterior++;
          } else if (!present[i].includes(t)) wrong++;
        }
        return { offBoundary, offInterior, wrong, offColoursUsed: [...used].filter((v) => pt[v] === -1).length };
      };
      const before = score(p.cellPalette);
      const snapped = snapTransitions(
        p.cellPalette,
        gw,
        gh,
        p.palette.map((c) => c.rgb)
      );
      const after = score(snapped.cells);
      snapRows.push({ blurCells, colorCount, before, after, changed: snapped.changed });
    }
  }
  // Legitimate gradients: how many cells would snapping change?
  const ramp = renderRamp(W, H);
  const gradientRows: Record<string, unknown>[] = [];
  for (const colorCount of [8, 16, 32]) {
    const p = buildPattern(ramp, { longerSideStitches: gw, colorCount, edgeMode: "crisp" });
    const snapped = snapTransitions(
      p.cellPalette,
      gw,
      gh,
      p.palette.map((c) => c.rgb)
    );
    gradientRows.push({ colorCount, palette: p.palette.length, changedOnGradient: snapped.changed, cells: gw * gh });
  }
  const result = { evidenceRows, snapRows, gradientRows };
  writeFileSync(new URL("./diagnose-results.json", import.meta.url), JSON.stringify(result, null, 2));
});
