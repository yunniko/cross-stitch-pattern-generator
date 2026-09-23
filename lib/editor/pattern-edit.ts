import { nameNewColor } from "../color/color-names";
import { floodFillDiagonal, labelRegions } from "../pipeline/regions";
import { SYMBOL_SET } from "../color/symbols";
import { formatThreadName, THREAD_BRANDS, type ThreadBrand } from "../threads/thread-brands";
import { EMPTY_CELL, MAX_COLORS, MAX_STITCHES, type CellRect, type FloatingSelection, type PaletteColor, type RGB, type StitchPattern } from "../types";

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
 * Merges `sourceIndex` into `targetIndex` at any distance -- an explicit user action, unlike the generation-time
 * near-duplicate merge -- and removes the source from the palette. `targetIndex` may be `EMPTY_CELL`, which turns the
 * source's stitches into empty cells (Owner request, 2026-09-12).
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

/**
 * The dedicated Fill tool's fill (G-018) -- fills every cell 8-connected
 * to `cellIndex` (diagonal touching *does* count) that shares its current
 * color with `paletteIndex`. Deliberately more permissive than
 * `fillCluster` above, which stays 4-connected for its own drag-and-drop
 * use case per the original spec; this is a separate, newer tool with its
 * own connectivity rule (Owner request, 2026-09-10), not a change to that
 * one.
 */
export function fillClusterDiagonal(pattern: StitchPattern, cellIndex: number, paletteIndex: number): StitchPattern {
  const matches = floodFillDiagonal(pattern.cellPalette, pattern.width, pattern.height, cellIndex);
  const cellPalette = pattern.cellPalette.slice();
  for (const cell of matches) cellPalette[cell] = paletteIndex;
  return withCounts(pattern, cellPalette, pattern.palette);
}

/** Repaints exactly one stitch — no region/cluster involved. */
export function paintStitch(pattern: StitchPattern, cellIndex: number, paletteIndex: number): StitchPattern {
  const cellPalette = pattern.cellPalette.slice();
  cellPalette[cellIndex] = paletteIndex;
  return withCounts(pattern, cellPalette, pattern.palette);
}

/**
 * Commits a gesture's working cell buffer (a brush stroke painted cell by
 * cell into one `Uint8Array`) as a new pattern, recounting once at the end
 * rather than per pointer event (D104). `cellPalette` must be the same
 * length as the pattern's and is used as-is, not copied.
 */
export function withCellPalette(pattern: StitchPattern, cellPalette: Uint8Array): StitchPattern {
  if (cellPalette.length !== pattern.cellPalette.length) throw new Error("Working buffer doesn't match the pattern's size.");
  return withCounts(pattern, cellPalette, pattern.palette);
}

/**
 * The Move tool (G-012): shifts the stitches by whole cells within the same canvas and moves the photo offset by the
 * same amount. The shift wraps around, so no stitched content is ever destroyed; counts don't change, so it skips
 * `withCounts`.
 */
export function shiftPattern(pattern: StitchPattern, dx: number, dy: number): StitchPattern {
  const { width, height, cellPalette, sourceImage } = pattern;
  if (dx === 0 && dy === 0) return pattern;

  const shifted = new Uint8Array(cellPalette.length);
  // Two whole-row copies per row rather than a modulo per cell: the tail of the source row wraps to the front
  // (G-039 M2, same bytes as the per-cell form).
  const offsetX = (((dx % width) + width) % width);
  for (let y = 0; y < height; y++) {
    const srcY = ((((y - dy) % height) + height) % height) * width;
    const destY = y * width;
    shifted.set(cellPalette.subarray(srcY + width - offsetX, srcY + width), destY);
    shifted.set(cellPalette.subarray(srcY, srcY + width - offsetX), destY + offsetX);
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
 * Crops and/or expands any combination of edges in one step. Newly exposed cells are EMPTY_CELL, so a resize never adds
 * a palette color (a thread-brand palette stays pure). The photo underlay's offset shifts by the left/top deltas only,
 * since only those move the canvas origin. See D109.
 */
export function resizeCanvas(pattern: StitchPattern, delta: CanvasResizeDelta): StitchPattern {
  const { left, right, top, bottom } = delta;
  const newWidth = pattern.width + left + right;
  const newHeight = pattern.height + top + bottom;
  if (newWidth < 1 || newHeight < 1) {
    throw new Error("Can't crop away the entire pattern.");
  }
  if (newWidth > MAX_STITCHES || newHeight > MAX_STITCHES) {
    throw new Error(`The resized pattern (${newWidth}×${newHeight}) would exceed the maximum supported size of ${MAX_STITCHES} stitches per side.`);
  }

  const cellPalette = new Uint8Array(newWidth * newHeight);
  for (let ny = 0; ny < newHeight; ny++) {
    const oy = ny - top;
    const inRowBounds = oy >= 0 && oy < pattern.height;
    for (let nx = 0; nx < newWidth; nx++) {
      const ox = nx - left;
      cellPalette[ny * newWidth + nx] =
        inRowBounds && ox >= 0 && ox < pattern.width ? pattern.cellPalette[oy * pattern.width + ox] : EMPTY_CELL;
    }
  }

  const resized = withCounts(pattern, cellPalette, pattern.palette);
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

/**
 * A brand-locked pattern holds only that brand's threads (D122): a custom color (`brand` null) or another brand's thread
 * is refused here, whatever the UI offers.
 */
function assertBrandAllowed(pattern: StitchPattern, brand: ThreadBrand | null): void {
  const locked = pattern.threadBrand;
  if (!locked || brand === locked) return;
  const lockedLabel = THREAD_BRANDS[locked].label;
  throw new Error(brand ? `This pattern uses only ${lockedLabel} threads, so a ${THREAD_BRANDS[brand].label} thread can't be used.` : `This pattern uses only ${lockedLabel} threads, so a custom color can't be used.`);
}

/** The palette entry without its thread identity: a manual RGB makes it a custom color. */
function withoutSource(color: PaletteColor): PaletteColor {
  const { source: _source, ...rest } = color;
  void _source;
  return rest;
}

/**
 * Changes an existing palette color's actual RGB. Symbol and name are left as-is -- a manual recolor shouldn't silently
 * rename the swatch out from under the user -- but the thread identity is dropped: it is now a custom color (D122).
 */
export function editColorRgb(pattern: StitchPattern, paletteIndex: number, rgb: RGB): StitchPattern {
  assertBrandAllowed(pattern, null);
  const palette = pattern.palette.map((color, i) => (i === paletteIndex ? { ...withoutSource(color), rgb } : color));
  return { ...pattern, palette };
}

/**
 * Puts back a color's RGB, name and thread identity exactly as captured earlier -- the color editor's Cancel (G-033).
 * The snapshot's `source` object is reused as is, since sources are never mutated.
 */
export function restoreColor(pattern: StitchPattern, paletteIndex: number, snapshot: Pick<PaletteColor, "rgb" | "name" | "source">): StitchPattern {
  assertBrandAllowed(pattern, snapshot.source?.brand ?? null);
  const palette = pattern.palette.map((color, i) => {
    if (i !== paletteIndex) return color;
    const restored = { ...withoutSource(color), rgb: snapshot.rgb, name: snapshot.name };
    return snapshot.source ? { ...restored, source: snapshot.source } : restored;
  });
  return { ...pattern, palette };
}

/**
 * Changes an existing palette color to a specific real thread from `brand`'s
 * line by code (G-017, generalized from DMC-only in G-029 M1, HANDOVER.md
 * D92), renaming it `"CODE - Name"` to match -- unlike `editColorRgb`,
 * which deliberately leaves the name alone for an arbitrary hex edit,
 * picking a named thread is picking a specific identity, so the name
 * should follow it. Does not touch `threadBrand`: that field means "every
 * color in this palette is matched to this brand" (set only by
 * `applyBrandPalette` at generation time) -- converting a single color in
 * an otherwise free-form palette doesn't make the whole pattern a brand-
 * matched one.
 */
export function editColorToBrandColor(pattern: StitchPattern, paletteIndex: number, code: string, brand: ThreadBrand): StitchPattern {
  assertBrandAllowed(pattern, brand);
  const thread = THREAD_BRANDS[brand].colors.find((c) => c.code === code);
  if (!thread) throw new Error(`"${code}" isn't a recognized ${THREAD_BRANDS[brand].label} color code.`);
  const palette = pattern.palette.map((color, i) =>
    i === paletteIndex ? { ...color, rgb: thread.rgb, name: formatThreadName(thread), source: { brand, code: thread.code } } : color
  );
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
  assertBrandAllowed(pattern, null);
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
 * Adds a brand-new color from a real thread brand's line, by code (G-016,
 * generalized from DMC-only in G-029 M1, HANDOVER.md D92) -- the "+ Add"
 * counterpart to `addColor` for a `threadBrand`-matched pattern, where
 * every color must stay a real, buyable thread rather than an arbitrary
 * RGB. Named `"CODE - Name"` like every other color `applyBrandPalette`
 * produces, so the two stay indistinguishable in the legend. Starts at
 * zero stitches, same as `addColor`.
 */
export function addBrandColor(pattern: StitchPattern, code: string, brand: ThreadBrand): StitchPattern {
  assertBrandAllowed(pattern, brand);
  if (pattern.palette.length >= MAX_COLORS) {
    throw new Error(`Cannot add another color -- already at the maximum of ${MAX_COLORS}.`);
  }

  const thread = THREAD_BRANDS[brand].colors.find((c) => c.code === code);
  if (!thread) throw new Error(`"${code}" isn't a recognized ${THREAD_BRANDS[brand].label} color code.`);

  const usedSymbols = new Set(pattern.palette.map((c) => c.symbol));
  const symbol = SYMBOL_SET.find((s) => !usedSymbols.has(s));
  if (!symbol) throw new Error("No unused symbol available.");

  const newColor: PaletteColor = {
    index: pattern.palette.length,
    rgb: thread.rgb,
    symbol,
    name: formatThreadName(thread),
    count: 0,
    source: { brand, code: thread.code },
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

// --- Rectangle Select tool (G-018) ---
//
// A `FloatingSelection` is a lifted snapshot of cells that can be moved and
// flipped independently of the pattern before being written back
// permanently on deselect ("merge"). Nothing here touches `history`/undo
// directly -- the workspace only pushes the *final* merged pattern, so an
// entire select/move/flip session collapses into one undo step, matching
// how the existing Move tool already only commits on pointer-up.

function clampRectToBounds(rect: CellRect, width: number, height: number): CellRect {
  const x0 = Math.max(0, Math.min(rect.x, width));
  const y0 = Math.max(0, Math.min(rect.y, height));
  const x1 = Math.max(0, Math.min(rect.x + rect.width, width));
  const y1 = Math.max(0, Math.min(rect.y + rect.height, height));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** Snapshots `rect`'s cells (clamped to the pattern's own bounds) into a new floating selection, with `originRect` set so a later merge vacates this spot -- the "lift" step of a fresh drag-select. */
export function liftSelection(pattern: StitchPattern, rect: CellRect): FloatingSelection {
  const clamped = clampRectToBounds(rect, pattern.width, pattern.height);
  const cells = new Uint8Array(clamped.width * clamped.height);
  for (let ly = 0; ly < clamped.height; ly++) {
    const srcRowStart = (clamped.y + ly) * pattern.width + clamped.x;
    cells.set(pattern.cellPalette.subarray(srcRowStart, srcRowStart + clamped.width), ly * clamped.width);
  }
  return { x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height, cells, originRect: clamped };
}

/** Repositions a floating selection by `(dx, dy)` -- pure data, no pattern involved (used for both the live drag preview and the final commit once a move finishes). */
export function moveSelection(selection: FloatingSelection, dx: number, dy: number): FloatingSelection {
  return { ...selection, x: selection.x + dx, y: selection.y + dy };
}

/**
 * Paints every cell of a floating selection in one colour (G-063). The piece stays floating, so it can still be
 * moved, applied or cancelled, and a cell that was empty becomes a stitch like any other -- the Owner asked for the
 * selected *area*, not the stitches inside it.
 */
export function fillSelection(selection: FloatingSelection, paletteIndex: number): FloatingSelection {
  return { ...selection, cells: new Uint8Array(selection.cells.length).fill(paletteIndex) };
}

/**
 * The copy a Duplicate leaves in hand (G-063): the same cells, offset so it reads as a second piece, and with no
 * `originRect`, since nothing was lifted for it -- the original stays where it is and is merged by the caller.
 * `DUPLICATE_OFFSET` matches Paste's, so the two land in the same place relative to what they came from.
 */
export const DUPLICATE_OFFSET = 3;

export function duplicateSelection(selection: FloatingSelection): FloatingSelection {
  return moveSelection({ ...selection, originRect: undefined }, DUPLICATE_OFFSET, DUPLICATE_OFFSET);
}

function flipCells(cells: Uint8Array, width: number, height: number, axis: "horizontal" | "vertical"): Uint8Array {
  const flipped = new Uint8Array(cells.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = axis === "horizontal" ? width - 1 - x : x;
      const srcY = axis === "vertical" ? height - 1 - y : y;
      flipped[y * width + x] = cells[srcY * width + srcX];
    }
  }
  return flipped;
}

/** Mirrors a floating selection's cells left-right, in place -- position/size/originRect are untouched. */
export function flipSelectionHorizontal(selection: FloatingSelection): FloatingSelection {
  return { ...selection, cells: flipCells(selection.cells, selection.width, selection.height, "horizontal") };
}

/** Mirrors a floating selection's cells top-bottom, in place -- position/size/originRect are untouched. */
export function flipSelectionVertical(selection: FloatingSelection): FloatingSelection {
  return { ...selection, cells: flipCells(selection.cells, selection.width, selection.height, "vertical") };
}

/**
 * Turns a floating selection a quarter turn (G-042). Width and height swap; the piece keeps its top-left corner, so a
 * rotation grows it down and to the right rather than around its centre. `originRect` is untouched: a lifted piece
 * still vacates where it came from when it merges.
 */
function rotateCells(cells: Uint8Array, width: number, height: number, clockwise: boolean): Uint8Array {
  const rotated = new Uint8Array(cells.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Clockwise sends (x, y) to (height - 1 - y, x) in a height x width grid; anticlockwise sends it to (y, width - 1 - x).
      const nx = clockwise ? height - 1 - y : y;
      const ny = clockwise ? x : width - 1 - x;
      rotated[ny * height + nx] = cells[y * width + x];
    }
  }
  return rotated;
}

export function rotateSelectionClockwise(selection: FloatingSelection): FloatingSelection {
  return { ...selection, width: selection.height, height: selection.width, cells: rotateCells(selection.cells, selection.width, selection.height, true) };
}

export function rotateSelectionAnticlockwise(selection: FloatingSelection): FloatingSelection {
  return { ...selection, width: selection.height, height: selection.width, cells: rotateCells(selection.cells, selection.width, selection.height, false) };
}

/**
 * Crops the chart to a floating selection (G-042): the piece is merged where it sits, then everything outside its
 * rectangle is discarded. Delegates the arithmetic to `resizeCanvas`, so counts, the size guards and the photo
 * underlay's alignment behave exactly as the Resize canvas panel does (D109).
 */
export function cropToSelection(pattern: StitchPattern, selection: FloatingSelection): StitchPattern {
  const merged = mergeSelection(pattern, selection);
  const rect = clampRectToBounds({ x: selection.x, y: selection.y, width: selection.width, height: selection.height }, merged.width, merged.height);
  if (rect.width < 1 || rect.height < 1) throw new Error("Can't crop away the entire pattern.");
  return resizeCanvas(merged, {
    left: -rect.x,
    top: -rect.y,
    right: -(merged.width - rect.x - rect.width),
    bottom: -(merged.height - rect.y - rect.height),
  });
}

function stampSelection(cellPalette: Uint8Array, width: number, height: number, selection: FloatingSelection): void {
  for (let ly = 0; ly < selection.height; ly++) {
    const py = selection.y + ly;
    if (py < 0 || py >= height) continue;
    for (let lx = 0; lx < selection.width; lx++) {
      const px = selection.x + lx;
      if (px < 0 || px >= width) continue;
      cellPalette[py * width + px] = selection.cells[ly * selection.width + lx];
    }
  }
}

/**
 * Renders a floating selection composited onto `pattern` for *preview
 * only* -- palette `count`/`index` are left stale, since this is never
 * pushed to history, only drawn. Used while a selection exists/is being
 * dragged so the Image window shows where it would land.
 */
export function compositeSelectionPreview(pattern: StitchPattern, selection: FloatingSelection): StitchPattern {
  const cellPalette = pattern.cellPalette.slice();
  stampSelection(cellPalette, pattern.width, pattern.height, selection);
  return { ...pattern, cellPalette };
}

/**
 * Permanently applies a floating selection to `pattern` (the "deselect"
 * step, per the Owner's spec: "as soon as selection is reset, the
 * editable piece merges into picture") -- clears `originRect` to
 * `EMPTY_CELL` first (vacating wherever the piece was lifted from, if
 * anywhere), then stamps the selection's cells at its current position,
 * overwriting whatever is there. `EMPTY_CELL` values inside the selection
 * overwrite just like any real color ("empty cells rewrite color cells
 * the same way as other colors do") -- never treated as transparent.
 */
export function mergeSelection(pattern: StitchPattern, selection: FloatingSelection): StitchPattern {
  const cellPalette = pattern.cellPalette.slice();
  if (selection.originRect) {
    const { x, y, width, height } = selection.originRect;
    for (let ly = 0; ly < height; ly++) {
      const py = y + ly;
      if (py < 0 || py >= pattern.height) continue;
      const rowStart = py * pattern.width + x;
      cellPalette.fill(EMPTY_CELL, rowStart, rowStart + Math.min(width, pattern.width - x));
    }
  }
  stampSelection(cellPalette, pattern.width, pattern.height, selection);
  return withCounts(pattern, cellPalette, pattern.palette);
}
