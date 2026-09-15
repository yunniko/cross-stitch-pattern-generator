import { oklabDistanceSquared, rgbToOklab } from "@/lib/color/color";
import { EMPTY_CELL, type RGB } from "@/lib/types";

const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Same prototype as diagnose.spec.ts: colour-line snapping of thin transition strips (2 passes, 5x5 window). */
export function snapTransitions(cells: Uint8Array, W: number, H: number, paletteRgb: RGB[]): { cells: Uint8Array; changed: number } {
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
