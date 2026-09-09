import { colornames as bestOfColorNames } from "color-name-list/bestof";
import { oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
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

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

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
