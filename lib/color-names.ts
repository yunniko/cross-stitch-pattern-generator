import { colornames as bestOfColorNames } from "color-name-list/bestof";
import { hexToRgb, oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import type { RGB } from "./types";

interface NamedColorEntry {
  name: string;
  oklab: Oklab;
}

// Lazily built once per session (module-level cache): the curated ~5,000
// name "best of" list from color-name-list (MIT-licensed, brand-neutral --
// see HANDOVER.md D17 for why this and not a floss-brand dataset) converted
// to OKLab once, since every subsequent call reuses the same reference set.
let cachedEntries: NamedColorEntry[] | null = null;

function getEntries(): NamedColorEntry[] {
  if (!cachedEntries) {
    cachedEntries = bestOfColorNames.map((c) => ({ name: c.name, oklab: rgbToOklab(hexToRgb(c.hex)) }));
  }
  return cachedEntries;
}

/**
 * Assigns each color the nearest name from the reference list, using the
 * same OKLab perceptual distance the rest of the pipeline already relies on
 * (rather than introducing a second, less accurate metric). Matching is
 * greedy-global: every (color, name) pair is sorted by distance and claimed
 * closest-first, so two colors that would both naturally be "Cerulean" don't
 * collide -- the closer one gets it, the other falls through to its
 * next-nearest still-available name. Names are unique within one call, but
 * not guaranteed unique across separate calls/patterns.
 */
export function nameColors(colors: readonly RGB[]): string[] {
  const entries = getEntries();
  const queries = colors.map(rgbToOklab);

  const pairs: Array<{ colorIndex: number; nameIndex: number; distance: number }> = [];
  for (let ci = 0; ci < queries.length; ci++) {
    for (let ni = 0; ni < entries.length; ni++) {
      pairs.push({ colorIndex: ci, nameIndex: ni, distance: oklabDistanceSquared(queries[ci], entries[ni].oklab) });
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
 * Names a single color (e.g. one added by hand in the pattern editor)
 * without touching any existing palette color's name — `nameColors`'
 * greedy-global assignment recomputes across its *entire* input, which
 * would risk reshuffling every other color's name just because one more
 * was added. Simple nearest-first search, skipping any name already in
 * `existingNames` so the new color doesn't collide with the palette it's
 * joining (uniqueness across the same palette matters here the same way
 * it does for `nameColors`; uniqueness against a *different* pattern's
 * names still isn't guaranteed, same caveat as `nameColors`).
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
