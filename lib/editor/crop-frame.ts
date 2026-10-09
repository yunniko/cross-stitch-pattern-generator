import { MAX_STITCHES } from "../types";
import type { CanvasResizeDelta } from "../document/plane-geometry";

/**
 * The Crop tool's frame as data (G-089): how far each edge of the chart moves **in**, in whole stitches. 3 on the left cuts three
 * stitches off the left edge; a negative number moves the edge out and adds that many empty stitches (D278).
 *
 * The frame and the four numbers beside it are this one value. Dragging an edge and typing a number both produce a new
 * `CropInsets`; neither is a copy of the other. Applying it is `resizeCanvas` with the same amounts the other way round, so the
 * arithmetic, the limits and the messages stay in one place (D109).
 */
export interface CropInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_CROP: CropInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export type CropEdge = keyof CropInsets;

/** A handle on the frame: one of the four edges, or one of the four corners (two edges at once). */
export type CropHandle = CropEdge | "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** The edges a handle moves. */
export function edgesOf(handle: CropHandle): CropEdge[] {
  switch (handle) {
    case "top-left":
      return ["top", "left"];
    case "top-right":
      return ["top", "right"];
    case "bottom-left":
      return ["bottom", "left"];
    case "bottom-right":
      return ["bottom", "right"];
    default:
      return [handle];
  }
}

export function isNoCrop(insets: CropInsets): boolean {
  return insets.top === 0 && insets.right === 0 && insets.bottom === 0 && insets.left === 0;
}

/** The chart's size once the frame is applied. May be zero or negative for a frame that would leave nothing. */
export function cropSize(width: number, height: number, insets: CropInsets): { width: number; height: number } {
  return { width: width - insets.left - insets.right, height: height - insets.top - insets.bottom };
}

/** `resizeCanvas`'s amounts for a frame: the same edges, with the sign turned round (positive adds there). */
export function insetsToDelta(insets: CropInsets): CanvasResizeDelta {
  return { top: -insets.top, right: -insets.right, bottom: -insets.bottom, left: -insets.left };
}

/** The frame a `resizeCanvas` delta describes. */
export function deltaToInsets(delta: CanvasResizeDelta): CropInsets {
  return { top: -delta.top, right: -delta.right, bottom: -delta.bottom, left: -delta.left };
}

/** Why a frame cannot be applied, in `resizeCanvas`'s own words, or null when it can. */
export function cropError(width: number, height: number, insets: CropInsets): string | null {
  const size = cropSize(width, height, insets);
  if (size.width < 1 || size.height < 1) return "Can't crop away the entire pattern.";
  if (size.width > MAX_STITCHES || size.height > MAX_STITCHES) {
    return `The resized pattern (${size.width}×${size.height}) would exceed the maximum supported size of ${MAX_STITCHES} stitches per side.`;
  }
  return null;
}

/** A typed number: a whole number, with an optional minus sign, or null. */
export function parseInset(raw: string): number | null {
  const text = raw.trim();
  if (!/^-?\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

/** The value an edge may take along one axis: at least one stitch is left, and no more than the chart's limit. */
function clampAxis(moving: number, other: number, length: number): number {
  const low = length - MAX_STITCHES - other;
  const high = length - 1 - other;
  return Math.max(low, Math.min(high, moving));
}

/**
 * The frame after dragging `handle` from `start` by `dx`, `dy` stitches (right and down are positive). Each edge a handle moves
 * is kept where the chart still has a stitch and stays within the size limit, so a drag can never produce a frame that cannot
 * be applied. A number typed by hand is not clamped: it is shown, and refused with a message (`cropError`).
 */
export function dragInsets(start: CropInsets, handle: CropHandle, dx: number, dy: number, width: number, height: number): CropInsets {
  const next = { ...start };
  for (const edge of edgesOf(handle)) {
    if (edge === "left") next.left = clampAxis(start.left + dx, next.right, width);
    else if (edge === "right") next.right = clampAxis(start.right - dx, next.left, width);
    else if (edge === "top") next.top = clampAxis(start.top + dy, next.bottom, height);
    else next.bottom = clampAxis(start.bottom - dy, next.top, height);
  }
  return next;
}

/** One edge set to `value`, the others kept: a number typed in its field. */
export function withInset(insets: CropInsets, edge: CropEdge, value: number): CropInsets {
  return { ...insets, [edge]: value };
}

/** The frame in stitch coordinates of the chart: where its edges are, which may lie outside the chart when it grows. */
export function frameRect(width: number, height: number, insets: CropInsets): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: insets.left, y0: insets.top, x1: width - insets.right, y1: height - insets.bottom };
}
