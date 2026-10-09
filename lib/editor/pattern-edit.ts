import { nameNewColor } from "../color/color-names";
import { clipLines, shiftLines, withColorRemovedFromLines } from "./backstitch";
import { resizePlane, wrapShift, type CanvasResizeDelta } from "../document/plane-geometry";
import { floodFillDiagonal, labelRegions } from "../pipeline/regions";
import { SYMBOL_SET } from "../color/symbols";
import { kindBuffer, kindsAfterWholePainting, STITCH_WHOLE, tidyKinds } from "./stitch-kind";
import { formatThreadName, THREAD_BRANDS, type ThreadBrand } from "../threads/thread-brands";
import { type ChartFabric, EMPTY_CELL, MAX_COLORS, MAX_STITCHES, type PaletteColor, type RGB, type StitchPattern } from "../types";

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

/**
 * `cellKind`, when a caller knows it, is the new kinds buffer; left out, the call is a whole-stitch repaint, so a cell whose
 * value changed becomes a whole stitch and the rest keep their kind (G-082). An empty cell is always whole, and a chart with
 * no half stitch left carries no kinds at all.
 */
export function withCounts(
  pattern: StitchPattern,
  cellPalette: Uint8Array,
  palette: PaletteColor[],
  cellKind: Uint8Array | undefined = kindsAfterWholePainting(pattern, cellPalette)
): StitchPattern {
  const counts = recomputeCounts(cellPalette, palette.length);
  return {
    ...pattern,
    cellPalette,
    cellKind: tidyKinds(cellPalette, cellKind),
    palette: palette.map((color, i) => ({ ...color, index: i, count: counts[i] })),
  };
}

/**
 * Merges `sourceIndex` into `targetIndex` at any distance -- an explicit user action, unlike the generation-time
 * near-duplicate merge -- and removes the source from the palette. `targetIndex` may be `EMPTY_CELL`, which turns the
 * source's stitches into empty cells (Owner request, 2026-09-12).
 *
 * The source's **backstitch goes with it** (G-073 M4): its lines take the target's thread, or are deleted
 * when the target is the empty thread, since a line cannot be “no colour”. Every surviving line is
 * renumbered with the palette, which is the part that would corrupt a chart if it were missed.
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

  const backstitch = withColorRemovedFromLines(pattern.backstitch ?? [], sourceIndex, targetIndex === EMPTY_CELL ? null : targetIndex);
  return {
    // Merging recolours stitches; it does not change what kind they are.
    ...withCounts(pattern, remappedCellPalette, survivingPalette, pattern.cellKind),
    backstitch: backstitch.length ? backstitch : undefined,
  };
}

/**
 * Fills the entire connected region ("cluster") containing `cellIndex` with
 * `paletteIndex` — the same 4-connected-component concept
 * `lib/regions.ts` already uses internally (Owner's spec: "diagonal
 * touching alone doesn't count"), not just the single clicked cell.
 */
export function fillCluster(pattern: StitchPattern, cellIndex: number, paletteIndex: number, kind: number = STITCH_WHOLE): StitchPattern {
  const regions = labelRegions(pattern.cellPalette, pattern.width, pattern.height);
  const targetLabel = regions.labels[cellIndex];

  const cellPalette = pattern.cellPalette.slice();
  const kinds = kindBuffer(pattern);
  for (let i = 0; i < cellPalette.length; i++) {
    if (regions.labels[i] !== targetLabel) continue;
    cellPalette[i] = paletteIndex;
    kinds[i] = kind;
  }

  return withCounts(pattern, cellPalette, pattern.palette, kinds);
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
export function fillClusterDiagonal(
  pattern: StitchPattern,
  cellIndex: number,
  paletteIndex: number,
  kind: number = STITCH_WHOLE
): StitchPattern {
  const matches = floodFillDiagonal(pattern.cellPalette, pattern.width, pattern.height, cellIndex);
  const cellPalette = pattern.cellPalette.slice();
  const kinds = kindBuffer(pattern);
  for (const cell of matches) {
    cellPalette[cell] = paletteIndex;
    kinds[cell] = kind;
  }
  return withCounts(pattern, cellPalette, pattern.palette, kinds);
}

/** Repaints exactly one stitch — no region/cluster involved. */
export function paintStitch(pattern: StitchPattern, cellIndex: number, paletteIndex: number, kind: number = STITCH_WHOLE): StitchPattern {
  const cellPalette = pattern.cellPalette.slice();
  cellPalette[cellIndex] = paletteIndex;
  const kinds = kindBuffer(pattern);
  kinds[cellIndex] = kind;
  return withCounts(pattern, cellPalette, pattern.palette, kinds);
}

/**
 * Commits a gesture's working cell buffer (a brush stroke painted cell by
 * cell into one `Uint8Array`) as a new pattern, recounting once at the end
 * rather than per pointer event (D104). `cellPalette` must be the same
 * length as the pattern's and is used as-is, not copied. `cellKind` is the matching working buffer of stitch kinds (G-082);
 * a caller that paints whole stitches only leaves it out, and the cells it changed become whole.
 */
export function withCellPalette(pattern: StitchPattern, cellPalette: Uint8Array, cellKind?: Uint8Array): StitchPattern {
  if (cellPalette.length !== pattern.cellPalette.length) throw new Error("Working buffer doesn't match the pattern's size.");
  return cellKind ? withCounts(pattern, cellPalette, pattern.palette, cellKind) : withCounts(pattern, cellPalette, pattern.palette);
}

/**
 * The Move tool (G-012): shifts the stitches by whole cells within the same canvas and moves the photo offset by the
 * same amount. The shift wraps around, so no stitched content is ever destroyed; counts don't change, so it skips
 * `withCounts`.
 */
export function shiftPattern(pattern: StitchPattern, dx: number, dy: number): StitchPattern {
  const { width, height, cellPalette, sourceImage } = pattern;
  if (dx === 0 && dy === 0) return pattern;

  const shifted = wrapShift(cellPalette, width, height, dx, dy);

  return {
    ...pattern,
    cellPalette: shifted,
    cellKind: pattern.cellKind ? wrapShift(pattern.cellKind, width, height, dx, dy) : undefined,
    // Stitches wrap around the edges; a backstitch cannot, because half a straight line on each side of the
    // chart is not the line anyone drew. Lines move with the design and a line pushed off it goes (G-073).
    backstitch: movedLines(pattern, dx, dy, pattern.width, pattern.height),
    sourceImage: sourceImage ? { ...sourceImage, offsetX: sourceImage.offsetX + dx, offsetY: sourceImage.offsetY + dy } : undefined,
  };
}

/** Lines shifted by whole cells and clipped to a chart of the given size; `undefined` when none survive. */
function movedLines(pattern: StitchPattern, dx: number, dy: number, width: number, height: number) {
  if (!pattern.backstitch?.length) return undefined;
  const kept = clipLines(shiftLines(pattern.backstitch, dx, dy), width, height);
  return kept.length ? kept : undefined;
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
    throw new Error(
      `The resized pattern (${newWidth}×${newHeight}) would exceed the maximum supported size of ${MAX_STITCHES} stitches per side.`
    );
  }

  const cellPalette = resizePlane(pattern.cellPalette, pattern.width, pattern.height, delta, EMPTY_CELL);
  const cellKind = pattern.cellKind ? resizePlane(pattern.cellKind, pattern.width, pattern.height, delta, STITCH_WHOLE) : undefined;

  const resized = withCounts(pattern, cellPalette, pattern.palette, cellKind);
  return {
    ...resized,
    width: newWidth,
    height: newHeight,
    isLandscape: newWidth >= newHeight,
    // The grid moved by (left, top); lines move with it, and one the new canvas no longer holds goes.
    backstitch: movedLines(pattern, left, top, newWidth, newHeight),
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
  throw new Error(
    brand
      ? `This pattern uses only ${lockedLabel} threads, so a ${THREAD_BRANDS[brand].label} thread can't be used.`
      : `This pattern uses only ${lockedLabel} threads, so a custom color can't be used.`
  );
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
export function restoreColor(
  pattern: StitchPattern,
  paletteIndex: number,
  snapshot: Pick<PaletteColor, "rgb" | "name" | "source">
): StitchPattern {
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

  const name = nameNewColor(
    rgb,
    pattern.palette.map((c) => c.name)
  );
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
/**
 * The chart on another fabric (G-094, D290): its count, or the unit its size is shown in. The stitches do not change, only
 * what size they come to. The same chart when nothing differs, so choosing the value already chosen is not an undo step.
 */
export function setFabric(pattern: StitchPattern, fabric: ChartFabric): StitchPattern {
  if (pattern.fabric?.count === fabric.count && pattern.fabric?.unit === fabric.unit) return pattern;
  return { ...pattern, fabric: { count: fabric.count, unit: fabric.unit } };
}

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
/**
 * The transparency lock (G-079): a change that would turn an empty stitch into a colour, or a colour into an empty stitch,
 * is one the lock refuses. Changing one colour to another is not.
 */
export function flipsTransparency(before: number, after: number): boolean {
  return (before === EMPTY_CELL) !== (after === EMPTY_CELL);
}

/**
 * `next` (changed in place) with every change `flipsTransparency` refuses put back to what `base` held. A half stitch is
 * still a stitch, so changing its kind is not a flip; but a cell put back takes its kind back too (G-082), which is what
 * `baseKinds` and `nextKinds` are for.
 */
export function lockTransparency(
  base: ArrayLike<number>,
  next: Uint8Array,
  baseKinds?: ArrayLike<number>,
  nextKinds?: Uint8Array
): Uint8Array {
  for (let i = 0; i < next.length; i++) {
    if (!flipsTransparency(base[i], next[i])) continue;
    next[i] = base[i];
    if (nextKinds) nextKinds[i] = baseKinds?.[i] ?? STITCH_WHOLE;
  }
  return next;
}

/** Whether two chart buffers hold the same stitches. */
export function sameCells(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
