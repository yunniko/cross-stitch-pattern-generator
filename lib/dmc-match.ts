import { luminance, oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import { DMC_COLORS, type DmcColor } from "./dmc-colors";
import { symbolsFor } from "./symbols";
import type { PaletteColor, RGB, StitchPattern } from "./types";

// Precomputed once at module load -- 454 entries, trivial either way, but
// no reason to re-derive OKLab for the same fixed reference list on every
// call.
const DMC_OKLAB: readonly { color: DmcColor; oklab: Oklab }[] = DMC_COLORS.map((color) => ({
  color,
  oklab: rgbToOklab(color.rgb),
}));

/**
 * The closest real DMC thread color to `rgb`, by squared OKLab distance --
 * the same perceptual metric every other assignment/distance decision in
 * this pipeline already uses (HANDOVER.md D6/D7), not a linear-RGB nearest
 * match.
 */
export function nearestDmcColor(rgb: RGB): DmcColor {
  const target = rgbToOklab(rgb);
  let best = DMC_OKLAB[0];
  let bestDistance = Infinity;
  for (const entry of DMC_OKLAB) {
    const distance = oklabDistanceSquared(target, entry.oklab);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best.color;
}

/**
 * The DMC palette mode (G-013): snaps every color in an already-fully-
 * generated pattern to its nearest real DMC thread color, merging any two
 * clusters that land on the same DMC code. Applied as a pure post-process
 * on a finished `StitchPattern` (same k-means/ICM/contour-cleanup pipeline
 * "Latest" mode already uses for spatial quality) rather than a different
 * clustering algorithm -- DMC is a constraint on which colors the final
 * palette may use, not a different way of choosing where color boundaries
 * fall. Merging is expected, not a bug: DMC's 454-color line is coarser
 * than a free-form k-means palette (up to MAX_COLORS), so some of the generator's
 * finer distinctions collapse onto the same real thread -- which is the
 * whole point (fewer, actually-buyable colors).
 */
export function applyDmcPalette(pattern: StitchPattern): StitchPattern {
  if (pattern.palette.length === 0) return pattern;

  const dmcByOldIndex = pattern.palette.map((color) => nearestDmcColor(color.rgb));

  const mergedIndexByDmcCode = new Map<string, number>();
  const groups: Array<{ dmc: DmcColor; count: number }> = [];
  const oldToMergedIndex = new Uint8Array(pattern.palette.length);
  pattern.palette.forEach((color, oldIndex) => {
    const dmc = dmcByOldIndex[oldIndex];
    let mergedIndex = mergedIndexByDmcCode.get(dmc.code);
    if (mergedIndex === undefined) {
      mergedIndex = groups.length;
      mergedIndexByDmcCode.set(dmc.code, mergedIndex);
      groups.push({ dmc, count: 0 });
    }
    groups[mergedIndex].count += color.count;
    oldToMergedIndex[oldIndex] = mergedIndex;
  });

  // Dark-to-light, matching every other mode's own legend convention.
  const order = groups
    .map((group, mergedIndex) => ({ ...group, mergedIndex }))
    .sort((a, b) => luminance(a.dmc.rgb) - luminance(b.dmc.rgb));
  const finalIndexByMergedIndex = new Uint8Array(groups.length);
  order.forEach((entry, finalIndex) => {
    finalIndexByMergedIndex[entry.mergedIndex] = finalIndex;
  });

  const symbols = symbolsFor(order.length);
  const palette: PaletteColor[] = order.map((entry, finalIndex) => ({
    index: finalIndex,
    rgb: entry.dmc.rgb,
    symbol: symbols[finalIndex],
    // Owner-specified format (2026-09-10): "XXX - name".
    name: `${entry.dmc.code} - ${entry.dmc.name}`,
    count: entry.count,
  }));

  const cellPalette = new Uint8Array(pattern.cellPalette.length);
  for (let i = 0; i < cellPalette.length; i++) {
    cellPalette[i] = finalIndexByMergedIndex[oldToMergedIndex[pattern.cellPalette[i]]];
  }

  return { ...pattern, cellPalette, palette };
}
