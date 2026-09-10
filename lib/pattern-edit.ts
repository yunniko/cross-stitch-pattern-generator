import { nameNewColor } from "./color-names";
import { DMC_COLORS } from "./dmc-colors";
import { labelRegions } from "./regions";
import { SYMBOL_SET } from "./symbols";
import { EMPTY_CELL, MAX_COLORS, MAX_STITCHES, type PaletteColor, type RGB, type StitchPattern } from "./types";

// `EMPTY_CELL` (255) is never counted against any real palette color and
// must never be run through a palette-index remap (an out-of-bounds typed-
// array read returns `undefined`, which would silently corrupt it to 0 when
// stored back into a `Uint8Array`) -- every function below that touches
// `cellPalette` values needs to pass it through untouched instead.
function recomputeCounts(cellPalette: Uint8Array, paletteLength: number): number[] {
  const counts = new Array(paletteLength).fill(0);
  for (const index of cellPalette) {
    if (index === EMPTY_CELL) continue;
    counts[index]++;
  }
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
  for (let i = 0; i < cellPalette.length; i++) {
    const value = cellPalette[i];
    remappedCellPalette[i] = value === EMPTY_CELL ? EMPTY_CELL : remap[value];
  }

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

/**
 * The Move tool (G-012): repositions the grid's stitch content by
 * `(dx, dy)` whole stitch cells within the *same* fixed canvas size, and
 * moves the photo underlay's stored alignment offset by the identical
 * amount so the two stay locked together. A cyclic (wrap-around) shift,
 * not a fill-with-empty one -- deliberately chosen over needing an
 * "empty cell" concept that doesn't exist until G-012's own M5, and
 * because wrapping never destroys already-stitched content (a user who
 * doesn't want the wrapped-around part can crop it away once M4's canvas
 * resize exists). Every color's stitch count is unaffected by relocating
 * cells, so — unlike every other edit in this file — this deliberately
 * does *not* go through `withCounts`.
 */
export function shiftPattern(pattern: StitchPattern, dx: number, dy: number): StitchPattern {
  const { width, height, cellPalette, sourceImage } = pattern;
  if (dx === 0 && dy === 0) return pattern;

  const shifted = new Uint8Array(cellPalette.length);
  for (let y = 0; y < height; y++) {
    const srcY = ((((y - dy) % height) + height) % height) * width;
    const destY = y * width;
    for (let x = 0; x < width; x++) {
      const srcX = (((x - dx) % width) + width) % width;
      shifted[destY + x] = cellPalette[srcY + srcX];
    }
  }

  return {
    ...pattern,
    cellPalette: shifted,
    sourceImage: sourceImage ? { ...sourceImage, offsetX: sourceImage.offsetX + dx, offsetY: sourceImage.offsetY + dy } : undefined,
  };
}

/** Signed per-edge cell counts for `resizeCanvas` -- positive expands that edge, negative crops it, 0 leaves it alone. */
export interface CanvasResizeDelta {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Canvas resize (G-012 M4): crops and/or expands any combination of edges
 * in one operation, since a crop on one side and an expand on another
 * (e.g. squaring up a portrait photo) is a completely ordinary thing to
 * want in one step. Expansion fills newly-exposed cells with `fillRgb`
 * (Owner decision, 2026-09-10: a real color the user picks, not the
 * empty/no-stitch pseudo-color) -- reusing an existing palette entry with
 * that exact RGB if one exists, otherwise adding a new one via the same
 * `addColor` path the Colors dock's own "+ Add" button uses (so it's
 * capped at `MAX_COLORS` the same way). The photo underlay's stored
 * offset shifts by exactly the left/top deltas so it stays visually
 * anchored in place rather than jumping when the canvas's own origin
 * moves (only left/top affect the origin -- expanding/cropping the
 * right or bottom edge never does).
 */
export function resizeCanvas(pattern: StitchPattern, delta: CanvasResizeDelta, fillRgb: RGB): StitchPattern {
  const { left, right, top, bottom } = delta;
  const newWidth = pattern.width + left + right;
  const newHeight = pattern.height + top + bottom;
  if (newWidth < 1 || newHeight < 1) {
    throw new Error("Can't crop away the entire pattern.");
  }
  if (newWidth > MAX_STITCHES || newHeight > MAX_STITCHES) {
    throw new Error(`The resized pattern (${newWidth}×${newHeight}) would exceed the maximum supported size of ${MAX_STITCHES} stitches per side.`);
  }

  const isExpanding = left > 0 || right > 0 || top > 0 || bottom > 0;
  let withFillColor = pattern;
  let fillIndex = -1;
  if (isExpanding) {
    fillIndex = pattern.palette.findIndex((c) => c.rgb[0] === fillRgb[0] && c.rgb[1] === fillRgb[1] && c.rgb[2] === fillRgb[2]);
    if (fillIndex === -1) {
      withFillColor = addColor(pattern, fillRgb); // throws at MAX_COLORS, same cap as "+ Add"
      fillIndex = withFillColor.palette.length - 1;
    }
  }

  const cellPalette = new Uint8Array(newWidth * newHeight);
  for (let ny = 0; ny < newHeight; ny++) {
    const oy = ny - top;
    const inRowBounds = oy >= 0 && oy < pattern.height;
    for (let nx = 0; nx < newWidth; nx++) {
      const ox = nx - left;
      cellPalette[ny * newWidth + nx] =
        inRowBounds && ox >= 0 && ox < pattern.width ? pattern.cellPalette[oy * pattern.width + ox] : fillIndex;
    }
  }

  const resized = withCounts(withFillColor, cellPalette, withFillColor.palette);
  return {
    ...resized,
    width: newWidth,
    height: newHeight,
    isLandscape: newWidth >= newHeight,
    sourceImage: pattern.sourceImage
      ? { ...pattern.sourceImage, offsetX: pattern.sourceImage.offsetX + left, offsetY: pattern.sourceImage.offsetY + top }
      : undefined,
  };
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
 * Adds a brand-new color from the real DMC line, by code (G-016) -- the
 * "+ Add" counterpart to `addColor` for a `dmcMode` pattern, where every
 * color must stay a real, buyable thread rather than an arbitrary RGB.
 * Named `"CODE - Name"` like every other color `applyDmcPalette` produces,
 * so the two stay indistinguishable in the legend. Starts at zero stitches,
 * same as `addColor`.
 */
export function addDmcColor(pattern: StitchPattern, dmcCode: string): StitchPattern {
  if (pattern.palette.length >= MAX_COLORS) {
    throw new Error(`Cannot add another color -- already at the maximum of ${MAX_COLORS}.`);
  }

  const dmc = DMC_COLORS.find((c) => c.code === dmcCode);
  if (!dmc) throw new Error(`"${dmcCode}" isn't a recognized DMC color code.`);

  const usedSymbols = new Set(pattern.palette.map((c) => c.symbol));
  const symbol = SYMBOL_SET.find((s) => !usedSymbols.has(s));
  if (!symbol) throw new Error("No unused symbol available.");

  const newColor: PaletteColor = {
    index: pattern.palette.length,
    rgb: dmc.rgb,
    symbol,
    name: `${dmc.code} - ${dmc.name}`,
    count: 0,
  };

  return { ...pattern, palette: [...pattern.palette, newColor] };
}

/**
 * Assigns `symbol` to the palette entry at `paletteIndex` (G-014). If
 * another color already has that symbol, the two colors trade symbols
 * (Owner decision, 2026-09-10: always succeeds, matching how renaming and
 * recoloring never dead-end) -- this never produces a duplicate symbol in
 * the palette, so callers don't need to pre-filter already-used symbols.
 */
export function setColorSymbol(pattern: StitchPattern, paletteIndex: number, symbol: string): StitchPattern {
  const currentHolderIndex = pattern.palette.findIndex((c) => c.symbol === symbol);
  if (currentHolderIndex === paletteIndex) return pattern;

  const previousSymbol = pattern.palette[paletteIndex].symbol;
  const palette = pattern.palette.map((color, i) => {
    if (i === paletteIndex) return { ...color, symbol };
    if (i === currentHolderIndex) return { ...color, symbol: previousSymbol };
    return color;
  });
  return { ...pattern, palette };
}

/** Renames an existing palette color. No validation beyond non-empty -- duplicate/blank names are the user's own call. */
export function renameColor(pattern: StitchPattern, paletteIndex: number, name: string): StitchPattern {
  const trimmed = name.trim();
  if (trimmed === "") return pattern;
  const palette = pattern.palette.map((color, i) => (i === paletteIndex ? { ...color, name: trimmed } : color));
  return { ...pattern, palette };
}

/** Renames the pattern itself -- distinct from `renameColor`, which renames one palette entry. Drives every downloadable's filename. */
export function renamePattern(pattern: StitchPattern, name: string): StitchPattern {
  const trimmed = name.trim();
  if (trimmed === "") return pattern;
  return { ...pattern, name: trimmed };
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
  for (let i = 0; i < cellPalette.length; i++) {
    const value = pattern.cellPalette[i];
    cellPalette[i] = value === EMPTY_CELL ? EMPTY_CELL : remap[value];
  }

  const palette = usedIndices.map((oldIndex, newIndex) => ({ ...pattern.palette[oldIndex], index: newIndex }));
  return { ...pattern, cellPalette, palette };
}
