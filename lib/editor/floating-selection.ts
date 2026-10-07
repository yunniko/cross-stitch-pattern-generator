import { clipLines, dedupeLines, flipLinesInBox, lineKey, lineWithinRect, rotateLinesInBox, shiftLines } from "./backstitch";
import { resizeCanvas, withCounts } from "./pattern-edit";
import { kindBuffer, STITCH_WHOLE, swapKind, tidyKinds } from "./stitch-kind";
import { EMPTY_CELL, type BackstitchLine, type CellRect, type FloatingSelection, type StitchPattern } from "../types";

/**
 * The piece in hand (G-018, G-072, G-073), split from `pattern-edit.ts` (G-116, D330): lifting cells off the chart, moving,
 * flipping, turning and filling them while they float, and putting them down again.
 */

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

/**
 * Snapshots `rect`'s cells (clamped to the pattern's own bounds) into a new floating selection, with `originRect`
 * set so a later merge vacates this spot -- the "lift" step of a fresh drag-select.
 *
 * `mask` (G-072) selects a shape inside that rectangle, in the *unclamped* rect's own coordinates so the caller
 * does not have to know how clamping went. Omit it and the piece is the whole rectangle, exactly as before.
 *
 * `lines` names the chart's backstitch lines the piece takes (G-116); omit it and it takes those with both ends inside.
 */
export function liftSelection(
  pattern: StitchPattern,
  rect: CellRect,
  mask?: Uint8Array,
  lines?: readonly BackstitchLine[]
): FloatingSelection {
  const clamped = clampRectToBounds(rect, pattern.width, pattern.height);
  const cells = new Uint8Array(clamped.width * clamped.height);
  const kinds = pattern.cellKind ? new Uint8Array(cells.length) : undefined;
  for (let ly = 0; ly < clamped.height; ly++) {
    const srcRowStart = (clamped.y + ly) * pattern.width + clamped.x;
    cells.set(pattern.cellPalette.subarray(srcRowStart, srcRowStart + clamped.width), ly * clamped.width);
    kinds?.set(pattern.cellKind!.subarray(srcRowStart, srcRowStart + clamped.width), ly * clamped.width);
  }
  const pieceKinds = tidyKinds(cells, kinds);
  const clampedMask = mask && cropMask(mask, rect, clamped);
  // The lines the piece takes. Copied, not cut: the chart keeps them until the merge clears exactly these, as it keeps
  // the cells underneath (G-073 M3, D330).
  const taken = lines ?? (pattern.backstitch ?? []).filter((line) => lineWithinRect(line, clamped, clampedMask));
  return {
    x: clamped.x,
    y: clamped.y,
    width: clamped.width,
    height: clamped.height,
    cells,
    ...(pieceKinds ? { kinds: pieceKinds } : {}),
    ...(clampedMask ? { mask: clampedMask, originMask: clampedMask } : {}),
    ...(taken.length ? { backstitch: shiftLines(taken, -clamped.x, -clamped.y), originLines: taken } : {}),
    originRect: clamped,
  };
}

/** Re-frames a mask given in `rect`'s coordinates into `clamped`'s, for when the drag ran off the chart. */
function cropMask(mask: Uint8Array, rect: CellRect, clamped: CellRect): Uint8Array {
  if (rect.x === clamped.x && rect.y === clamped.y && rect.width === clamped.width && rect.height === clamped.height) {
    return mask;
  }
  const out = new Uint8Array(clamped.width * clamped.height);
  for (let ly = 0; ly < clamped.height; ly++) {
    const sy = clamped.y + ly - rect.y;
    if (sy < 0 || sy >= rect.height) continue;
    for (let lx = 0; lx < clamped.width; lx++) {
      const sx = clamped.x + lx - rect.x;
      if (sx < 0 || sx >= rect.width) continue;
      out[ly * clamped.width + lx] = mask[sy * rect.width + sx];
    }
  }
  return out;
}

/** Repositions a floating selection by `(dx, dy)` -- pure data, no pattern involved (used for both the live drag preview and the final commit once a move finishes). */
export function moveSelection(selection: FloatingSelection, dx: number, dy: number): FloatingSelection {
  return { ...selection, x: selection.x + dx, y: selection.y + dy };
}

/**
 * Paints every cell of a floating selection in one colour (G-063). The piece stays floating, so it can still be
 * moved, applied or cancelled, and a cell that was empty becomes a stitch like any other -- the Owner asked for the
 * selected *area*, not the stitches inside it. With the transparency lock on (`onlyFilled`), only the stitches that
 * are not empty are painted (G-079).
 */
export function fillSelection(
  selection: FloatingSelection,
  paletteIndex: number,
  onlyFilled = false,
  kind: number = STITCH_WHOLE
): FloatingSelection {
  const paintable = (i: number) => !onlyFilled || selection.cells[i] !== EMPTY_CELL;
  // A shaped piece fills its shape; the cells outside it keep what they held, since nothing ever stamps them.
  const cells = selection.cells.slice();
  const kinds = selection.kinds ? selection.kinds.slice() : new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    if ((selection.mask && !selection.mask[i]) || !paintable(i)) continue;
    cells[i] = paletteIndex;
    kinds[i] = kind;
  }
  const tidy = tidyKinds(cells, kinds);
  const { kinds: _before, ...rest } = selection;
  void _before;
  return { ...rest, cells, ...(tidy ? { kinds: tidy } : {}) };
}

/**
 * The copy a Duplicate leaves in hand (G-063): the same cells, offset so it reads as a second piece, and with no
 * `originRect`, since nothing was lifted for it -- the original stays where it is and is merged by the caller.
 * `DUPLICATE_OFFSET` matches Paste's, so the two land in the same place relative to what they came from.
 */
export const DUPLICATE_OFFSET = 3;

export function duplicateSelection(selection: FloatingSelection): FloatingSelection {
  // `originMask` and `originLines` go with `originRect`: a duplicate was lifted from nowhere, so it vacates nothing.
  return moveSelection(
    { ...selection, originRect: undefined, originMask: undefined, originLines: undefined },
    DUPLICATE_OFFSET,
    DUPLICATE_OFFSET
  );
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
  return withShape(
    selection,
    (cells) => flipCells(cells, selection.width, selection.height, "horizontal"),
    (lines) => flipLinesInBox(lines, selection.width, selection.height, "horizontal")
  );
}

/** Mirrors a floating selection's cells top-bottom, in place -- position/size/originRect are untouched. */
export function flipSelectionVertical(selection: FloatingSelection): FloatingSelection {
  return withShape(
    selection,
    (cells) => flipCells(cells, selection.width, selection.height, "vertical"),
    (lines) => flipLinesInBox(lines, selection.width, selection.height, "vertical")
  );
}

/**
 * Applies the same rearrangement to the cells and to the mask (G-072).
 *
 * The two are the same shape and must stay in step: a flip that moved the cells but left the mask would leave
 * the piece showing through its old outline. `originMask` is deliberately not transformed -- it describes the
 * hole left behind, which does not turn with the piece.
 *
 * The carried backstitch is rearranged by its own function (G-073 M3): it is stored in corners, not cells, so
 * it cannot share the cells' index arithmetic — `width - 1 - cx` for a cell, `width - x` for the corner
 * bounding it.
 */
function withShape(
  selection: FloatingSelection,
  rearrange: (cells: Uint8Array) => Uint8Array,
  rearrangeLines: (lines: readonly BackstitchLine[]) => BackstitchLine[]
): FloatingSelection {
  return {
    ...selection,
    cells: rearrange(selection.cells),
    // Every flip and quarter turn lays a half stitch across the other diagonal (G-082, D258).
    ...(selection.kinds ? { kinds: rearrange(selection.kinds).map(swapKind) } : {}),
    ...(selection.mask ? { mask: rearrange(selection.mask) } : {}),
    ...(selection.backstitch ? { backstitch: rearrangeLines(selection.backstitch) } : {}),
  };
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
  return {
    ...withShape(
      selection,
      (cells) => rotateCells(cells, selection.width, selection.height, true),
      (lines) => rotateLinesInBox(lines, selection.width, selection.height, true)
    ),
    width: selection.height,
    height: selection.width,
  };
}

export function rotateSelectionAnticlockwise(selection: FloatingSelection): FloatingSelection {
  return {
    ...withShape(
      selection,
      (cells) => rotateCells(cells, selection.width, selection.height, false),
      (lines) => rotateLinesInBox(lines, selection.width, selection.height, false)
    ),
    width: selection.height,
    height: selection.width,
  };
}

/**
 * Crops the chart to a floating selection (G-042): the piece is merged where it sits, then everything outside its
 * rectangle is discarded. Delegates the arithmetic to `resizeCanvas`, so counts, the size guards and the photo
 * underlay's alignment behave exactly as the Resize canvas panel does (D109).
 */
export function cropToSelection(pattern: StitchPattern, selection: FloatingSelection): StitchPattern {
  const merged = mergeSelection(pattern, selection);
  const rect = clampRectToBounds(
    { x: selection.x, y: selection.y, width: selection.width, height: selection.height },
    merged.width,
    merged.height
  );
  if (rect.width < 1 || rect.height < 1) throw new Error("Can't crop away the entire pattern.");
  return resizeCanvas(merged, {
    left: -rect.x,
    top: -rect.y,
    right: -(merged.width - rect.x - rect.width),
    bottom: -(merged.height - rect.y - rect.height),
  });
}

function stampSelection(
  cellPalette: Uint8Array,
  cellKind: Uint8Array | undefined,
  width: number,
  height: number,
  selection: FloatingSelection
): void {
  for (let ly = 0; ly < selection.height; ly++) {
    const py = selection.y + ly;
    if (py < 0 || py >= height) continue;
    for (let lx = 0; lx < selection.width; lx++) {
      const px = selection.x + lx;
      if (px < 0 || px >= width) continue;
      const local = ly * selection.width + lx;
      // A cell the mask excludes is not part of the piece, so whatever is under it stays (G-072).
      if (selection.mask && !selection.mask[local]) continue;
      cellPalette[py * width + px] = selection.cells[local];
      if (cellKind) cellKind[py * width + px] = selection.kinds?.[local] ?? STITCH_WHOLE;
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
  const cellKind = pattern.cellKind || selection.kinds ? kindBuffer(pattern) : undefined;
  stampSelection(cellPalette, cellKind, pattern.width, pattern.height, selection);
  // The lines the piece carries are shown where the piece is. The originals stay visible where they were
  // drawn until the merge, which is what the cells under the piece do too.
  const backstitch = selection.backstitch?.length
    ? [...(pattern.backstitch ?? []), ...shiftLines(selection.backstitch, selection.x, selection.y)]
    : pattern.backstitch;
  return { ...pattern, cellPalette, cellKind: tidyKinds(cellPalette, cellKind), backstitch };
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
  const cellKind = pattern.cellKind || selection.kinds ? kindBuffer(pattern) : undefined;
  if (selection.originRect) {
    const { x, y, width, height } = selection.originRect;
    for (let ly = 0; ly < height; ly++) {
      const py = y + ly;
      if (py < 0 || py >= pattern.height) continue;
      const rowStart = py * pattern.width + x;
      if (!selection.originMask) {
        cellPalette.fill(EMPTY_CELL, rowStart, rowStart + Math.min(width, pattern.width - x));
        cellKind?.fill(STITCH_WHOLE, rowStart, rowStart + Math.min(width, pattern.width - x));
        continue;
      }
      // A shaped piece leaves a hole its own shape, not a rectangular one (G-072).
      for (let lx = 0; lx < width; lx++) {
        if (x + lx >= pattern.width) break;
        if (!selection.originMask[ly * width + lx]) continue;
        cellPalette[rowStart + lx] = EMPTY_CELL;
        if (cellKind) cellKind[rowStart + lx] = STITCH_WHOLE;
      }
    }
  }
  stampSelection(cellPalette, cellKind, pattern.width, pattern.height, selection);
  return { ...withCounts(pattern, cellPalette, pattern.palette, cellKind), backstitch: mergedLines(pattern, selection) };
}

/**
 * The chart's backstitch after a piece is put down: the lines the piece took (`originLines`) are dropped, and the ones
 * it carries are laid down where it now sits. The lift recorded both from one choice, so a line is never dropped from
 * the chart without the piece having a copy of it to put back (D330).
 */
function mergedLines(pattern: StitchPattern, selection: FloatingSelection): BackstitchLine[] | undefined {
  let lines: readonly BackstitchLine[] = pattern.backstitch ?? [];
  if (selection.originRect && selection.originLines?.length) {
    const taken = new Set(selection.originLines.map(lineKey));
    lines = lines.filter((line) => !taken.has(lineKey(line)));
  }
  if (selection.backstitch?.length) {
    lines = [...lines, ...shiftLines(selection.backstitch, selection.x, selection.y)];
  }
  const kept = dedupeLines(clipLines(lines, pattern.width, pattern.height));
  return kept.length ? kept : undefined;
}
