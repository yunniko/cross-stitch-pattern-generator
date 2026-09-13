import { colornames as bestOfColorNames } from "color-name-list/bestof";
import { hexToRgb, oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import type { RGB } from "../types";

interface NamedColorEntry {
  name: string;
  oklab: Oklab;
}

// The curated ~5,000-name "best of" list (MIT, brand-neutral -- D17),
// converted to OKLab once per session.
let cachedEntries: NamedColorEntry[] | null = null;

function getEntries(): NamedColorEntry[] {
  if (!cachedEntries) {
    cachedEntries = bestOfColorNames.map((c) => ({ name: c.name, oklab: rgbToOklab(hexToRgb(c.hex)) }));
  }
  return cachedEntries;
}

/**
 * Nearest name per color by OKLab distance, assigned greedy-globally:
 * every (color, name) pair is claimed closest-first, so two colors that
 * would both be "Cerulean" don't collide. Names are unique within one call.
 *
 * Only each color's `k + 1` nearest names (k = number of colors) enter the
 * sort: at most `k - 1` names can be claimed by other colors before a
 * color's turn, so its assigned name always lies within its `k` nearest.
 * Pairs are pushed in the same (color, name) order and stable-sorted by
 * distance, so ties resolve exactly as the full sort did (review E5).
 */
export function nameColors(colors: readonly RGB[]): string[] {
  const entries = getEntries();
  const queries = colors.map(rgbToOklab);
  const keep = Math.min(entries.length, colors.length + 1);

  const pairs: Array<{ colorIndex: number; nameIndex: number; distance: number }> = [];
  const distances = new Float64Array(entries.length);
  for (let ci = 0; ci < queries.length; ci++) {
    for (let ni = 0; ni < entries.length; ni++) distances[ni] = oklabDistanceSquared(queries[ci], entries[ni].oklab);
    const threshold = Float64Array.from(distances).sort()[keep - 1];
    // A NaN threshold (a non-finite input color) keeps every pair, as the full sort did.
    const keepAll = Number.isNaN(threshold);
    for (let ni = 0; ni < entries.length; ni++) {
      if (keepAll || distances[ni] <= threshold) pairs.push({ colorIndex: ci, nameIndex: ni, distance: distances[ni] });
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);

  const names = new Array<string>(colors.length);
  const usedNameIndices = new Set<number>();
  let assignedCount = 0;
  for (const pair of pairs) {
    if (assignedCount === colors.length) break;
    if (names[pair.colorIndex] !== undefined || usedNameIndices.has(pair.nameIndex)) continue;
    names[pair.colorIndex] = entries[pair.nameIndex].name;
    usedNameIndices.add(pair.nameIndex);
    assignedCount++;
  }
  return names;
}

/**
 * Names one color added by hand without touching existing names (which
 * `nameColors`' global assignment could reshuffle): nearest name not in
 * `existingNames`.
 */
export function nameNewColor(rgb: RGB, existingNames: readonly string[]): string {
  const entries = getEntries();
  const query = rgbToOklab(rgb);
  const excluded = new Set(existingNames);

  let best: string | null = null;
  let bestDist = Infinity;
  for (const entry of entries) {
    if (excluded.has(entry.name)) continue;
    const d = oklabDistanceSquared(query, entry.oklab);
    if (d < bestDist) {
      bestDist = d;
      best = entry.name;
    }
  }
  return best ?? "Custom";
}
