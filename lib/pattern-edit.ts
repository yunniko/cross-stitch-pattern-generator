import { nameNewColor } from "./color-names";
import { labelRegions } from "./regions";
import { SYMBOL_SET } from "./symbols";
import { MAX_COLORS, type PaletteColor, type RGB, type StitchPattern } from "./types";

function recomputeCounts(cellPalette: Uint8Array, paletteLength: number): number[] {
  const counts = new Array(paletteLength).fill(0);
  for (const index of cellPalette) counts[index]++;
  return counts;
}

function withCounts(pattern: StitchPattern, cellPalette: Uint8Array, palette: PaletteColor[]): StitchPattern {
  const counts = recomputeCounts(cellPalette, palette.length);
  return {
    ...pattern,
    cellPalette,
    palette: palette.map((color, i) => ({ ...color, index: i, count: counts[i] })),
  };
}

/**
 * Merges `sourceIndex` into `targetIndex`: every stitch that had the source
 * color now has the target color, and the source color disappears from the
 * palette entirely (not just zeroed out — this is a deliberate, permanent
 * merge the user asked for, unlike the generation-time near-duplicate
 * dedup in `palette-optimizer.ts`, which only merges colors *close enough*
 * to be near-indistinguishable; here any two colors can be merged
 * regardless of distance, since it's an explicit user action).
 */
export function mergeColors(pattern: StitchPattern, sourceIndex: number, targetIndex: number): StitchPattern {
  if (sourceIndex === targetIndex) return pattern;

  const cellPalette = new Uint8Array(pattern.cellPalette.length);
  for (let i = 0; i < pattern.cellPalette.length; i++) {
    const value = pattern.cellPalette[i];
    cellPalette[i] = value === sourceIndex ? targetIndex : value;
  }

  const survivingPalette = pattern.palette.filter((_, i) => i !== sourceIndex);
  const remap = new Int16Array(pattern.palette.length).fill(-1);
  survivingPalette.forEach((color, newIndex) => {
    remap[color.index] = newIndex;
  });
  const remappedCellPalette = new Uint8Array(cellPalette.length);
  for (let i = 0; i < cellPalette.length; i++) remappedCellPalette[i] = remap[cellPalette[i]];

  return withCounts(pattern, remappedCellPalette, survivingPalette);
}

/**
 * Fills the entire connected region ("cluster") containing `cellIndex` with
 * `paletteIndex` — the same 4-connected-component concept
 * `lib/regions.ts` already uses internally (Owner's spec: "diagonal
 * touching alone doesn't count"), not just the single clicked cell.
 */
export function fillCluster(pattern: StitchPattern, cellIndex: number, paletteIndex: number): StitchPattern {
  const regions = labelRegions(pattern.cellPalette, pattern.width, pattern.height);
  const targetLabel = regions.labels[cellIndex];

  const cellPalette = pattern.cellPalette.slice();
  for (let i = 0; i < cellPalette.length; i++) {
    if (regions.labels[i] === targetLabel) cellPalette[i] = paletteIndex;
  }

  return withCounts(pattern, cellPalette, pattern.palette);
}

/** Repaints exactly one stitch — no region/cluster involved. */
export function paintStitch(pattern: StitchPattern, cellIndex: number, paletteIndex: number): StitchPattern {
  const cellPalette = pattern.cellPalette.slice();
  cellPalette[cellIndex] = paletteIndex;
  return withCounts(pattern, cellPalette, pattern.palette);
}

/** Changes an existing palette color's actual RGB. Symbol and name are left as-is -- a manual recolor shouldn't silently rename the swatch out from under the user. */
export function editColorRgb(pattern: StitchPattern, paletteIndex: number, rgb: RGB): StitchPattern {
  const palette = pattern.palette.map((color, i) => (i === paletteIndex ? { ...color, rgb } : color));
  return { ...pattern, palette };
}

/**
 * Adds a brand-new color not derived from the source photo at all, starting
 * with zero stitches (nothing uses it until the user paints or cluster-
 * fills with it) -- unlike generation, where a zero-count color would be a
 * bug (HANDOVER.md D9), it's the normal, expected state here right after
 * adding one.
 */
export function addColor(pattern: StitchPattern, rgb: RGB): StitchPattern {
  if (pattern.palette.length >= MAX_COLORS) {
    throw new Error(`Cannot add another color -- already at the maximum of ${MAX_COLORS}.`);
  }

  const usedSymbols = new Set(pattern.palette.map((c) => c.symbol));
  const symbol = SYMBOL_SET.find((s) => !usedSymbols.has(s));
  if (!symbol) throw new Error("No unused symbol available.");

  const name = nameNewColor(rgb, pattern.palette.map((c) => c.name));
  const newColor: PaletteColor = { index: pattern.palette.length, rgb, symbol, name, count: 0 };

  return { ...pattern, palette: [...pattern.palette, newColor] };
}

/**
 * Drops any palette color with zero stitches -- run before a final PNG
 * export from the editor (not during editing itself, where a just-added,
 * not-yet-used color is expected and should stay visible/selectable).
 */
export function compactUnusedColors(pattern: StitchPattern): StitchPattern {
  const usedIndices = pattern.palette.filter((c) => c.count > 0).map((c) => c.index);
  if (usedIndices.length === pattern.palette.length) return pattern;

  const remap = new Int16Array(pattern.palette.length).fill(-1);
  usedIndices.forEach((oldIndex, newIndex) => {
    remap[oldIndex] = newIndex;
  });

  const cellPalette = new Uint8Array(pattern.cellPalette.length);
  for (let i = 0; i < cellPalette.length; i++) cellPalette[i] = remap[pattern.cellPalette[i]];

  const palette = usedIndices.map((oldIndex, newIndex) => ({ ...pattern.palette[oldIndex], index: newIndex }));
  return { ...pattern, cellPalette, palette };
}
