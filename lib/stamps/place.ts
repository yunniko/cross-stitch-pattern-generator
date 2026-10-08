import { addBrandColor, addColor, renameColor } from "@/lib/editor/pattern-edit";
import { letteringStart } from "@/lib/editor/text-selection";
import { THREAD_BRANDS } from "@/lib/threads/thread-brands";
import { EMPTY_CELL, MAX_COLORS, type FloatingSelection, type PaletteColor, type StitchPattern } from "@/lib/types";
import type { StampContents } from "./stamp";

/**
 * Placing a stamp in a chart (G-119 M4): its threads found in the chart's palette, the ones the chart lacks added to it,
 * and the stamp made a piece in hand at the corner of the part of the chart in view, as lettering arrives. Pure.
 *
 * A thread is the same thread when it is the same brand's same code, or, for a custom colour, the same colour. A chart
 * matched to one brand takes no other brand's thread and no custom colour, as its "+ Add" refuses them; a palette with no
 * room for the threads it lacks refuses the stamp whole, so nothing is added for a stamp that is not placed.
 */

export type StampPlacement = { pattern: StitchPattern; piece: FloatingSelection } | { error: string };

function sameThread(stamp: PaletteColor, chart: PaletteColor): boolean {
  if (stamp.source) return chart.source?.brand === stamp.source.brand && chart.source.code === stamp.source.code;
  return !chart.source && chart.rgb.every((value, i) => value === stamp.rgb[i]);
}

/** Why a chart matched to one brand cannot take a thread, or null when it can. */
function brandRefusal(chart: StitchPattern, color: PaletteColor): string | null {
  const locked = chart.threadBrand;
  if (!locked || color.source?.brand === locked) return null;
  const label = THREAD_BRANDS[locked].label;
  return color.source
    ? `This chart uses only ${label} threads, and the stamp has ${THREAD_BRANDS[color.source.brand].label} “${color.name}”, so it was not placed.`
    : `This chart uses only ${label} threads, and the stamp has the custom colour “${color.name}”, so it was not placed.`;
}

export function placeStamp(chart: StitchPattern, stamp: StampContents, viewCorner: { x: number; y: number }): StampPlacement {
  const { pattern: piece } = stamp;
  if (piece.width > chart.width || piece.height > chart.height)
    return {
      error: `The stamp is ${piece.width} × ${piece.height} stitches, larger than this chart (${chart.width} × ${chart.height}), so it was not placed.`,
    };

  const found = piece.palette.map((color) => chart.palette.findIndex((other) => sameThread(color, other)));
  const lacking = piece.palette.filter((_, i) => found[i] === -1);
  for (const color of lacking) {
    const refusal = brandRefusal(chart, color);
    if (refusal) return { error: refusal };
  }
  const room = MAX_COLORS - chart.palette.length;
  if (lacking.length > room)
    return {
      error: `The stamp needs ${lacking.length} threads this chart does not have, and its palette has room for ${room} more (of ${MAX_COLORS}), so it was not placed.`,
    };

  // Each thread the chart lacks is added at the end of its palette, so every index already in use stays as it is.
  let pattern = chart;
  const index = found.slice();
  for (let i = 0; i < piece.palette.length; i++) {
    if (index[i] !== -1) continue;
    const color = piece.palette[i];
    pattern = color.source ? addBrandColor(pattern, color.source.code, color.source.brand) : addColor(pattern, color.rgb);
    index[i] = pattern.palette.length - 1;
    // A custom colour keeps the stamp's name for it, unless the chart already has a colour of that name.
    if (!color.source && !pattern.palette.some((other) => other.name === color.name)) pattern = renameColor(pattern, index[i], color.name);
  }

  const cells = piece.cellPalette.map((value) => (value === EMPTY_CELL ? EMPTY_CELL : index[value]));
  const at = letteringStart(null, viewCorner, piece, chart);
  return {
    pattern,
    piece: {
      x: at.x,
      y: at.y,
      width: piece.width,
      height: piece.height,
      cells,
      ...(piece.cellKind ? { kinds: Uint8Array.from(piece.cellKind) } : {}),
      ...(stamp.mask ? { mask: Uint8Array.from(stamp.mask) } : {}),
      ...(piece.backstitch?.length
        ? { backstitch: piece.backstitch.map((line) => ({ ...line, paletteIndex: index[line.paletteIndex] })) }
        : {}),
    },
  };
}
