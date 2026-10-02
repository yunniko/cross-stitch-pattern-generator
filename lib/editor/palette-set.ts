import type { PaletteMode } from "../pipeline/generation-modes";
import type { ColorPrediction } from "../pipeline/prediction";
import { findThread, formatThreadName, THREAD_BRAND_IDS, type ThreadBrand } from "../threads/thread-brands";
import { MAX_COLORS, type GenerationPalette, type PaletteSetColor, type RGB, type StitchPattern } from "../types";

export type { GenerationPalette, PaletteSetColor };

/**
 * A set of colours the user chose for a generation (G-087): the chart is made from these threads and no others.
 *
 * A set belongs to one palette mode, the one in force when it was made. In a thread brand a colour is a thread, known by its code
 * (so a saved set survives changes to the thread tables); in the full colour mode it is a custom colour, known by its RGB.
 */

export interface PaletteSet {
  mode: PaletteMode;
  colors: PaletteSetColor[];
}

export const EMPTY_SET: PaletteSet = { mode: "full", colors: [] };

const sameColor = (a: PaletteSetColor, b: PaletteSetColor) =>
  a.code !== undefined || b.code !== undefined ? a.code === b.code : a.rgb.every((v, i) => v === b.rgb[i]);

/** The set with `color` added, unless the set holds it already or is full. */
export function withColor(set: PaletteSet, color: PaletteSetColor): PaletteSet {
  if (set.colors.length >= MAX_COLORS || set.colors.some((c) => sameColor(c, color))) return set;
  return { ...set, colors: [...set.colors, color] };
}

/** The set with the colour at `from` moved to `to` (both clamped to the set), or the set itself when nothing moves. */
export function movedColor(set: PaletteSet, from: number, to: number): PaletteSet {
  const last = set.colors.length - 1;
  if (from < 0 || from > last) return set;
  const target = Math.max(0, Math.min(last, to));
  if (target === from) return set;
  const colors = [...set.colors];
  const [moved] = colors.splice(from, 1);
  colors.splice(target, 0, moved);
  return { ...set, colors };
}

export function withoutColor(set: PaletteSet, index: number): PaletteSet {
  return { ...set, colors: set.colors.filter((_, i) => i !== index) };
}

/** A thread of a brand as a set colour. */
export function threadColor(brand: ThreadBrand, code: string): PaletteSetColor | null {
  const thread = findThread(brand, code);
  return thread ? { code: thread.code, rgb: thread.rgb, name: thread.name } : null;
}

/** What a set colour is called on screen. */
export function colorLabel(color: PaletteSetColor): string {
  if (color.code === undefined) return `#${color.rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return formatThreadName({ code: color.code, name: color.name ?? "", rgb: color.rgb });
}

/** The set as a generation request names it: a code each in a brand, an RGB each otherwise. */
export function setRequest(set: PaletteSet): { mode: PaletteMode; colors: Array<{ code: string } | { rgb: RGB }> } {
  return {
    mode: set.mode,
    colors: set.colors.map((c) => (set.mode !== "full" && c.code !== undefined ? { code: c.code } : { rgb: c.rgb })),
  };
}

/**
 * The colours of a prediction as a set in `mode`: in a brand, the threads nearest them (one thread once, however many colours
 * map to it); in the full colour mode, the colours themselves.
 */
export function setFromPrediction(prediction: ColorPrediction, mode: PaletteMode): PaletteSet {
  const set: PaletteSet = { mode, colors: [] };
  let result = set;
  for (const guess of prediction.colors) {
    if (mode === "full") {
      result = withColor(result, { rgb: guess.rgb });
    } else if (guess.thread) {
      const thread = threadColor(mode, guess.thread.code);
      if (thread) result = withColor(result, thread);
    }
  }
  return result;
}

/** The current chart's threads as a set, for the palette file the Export dropdown writes. */
export function setFromPattern(pattern: StitchPattern): PaletteSet {
  const mode: PaletteMode = pattern.threadBrand ?? "full";
  const colors = pattern.palette.map((c): PaletteSetColor => {
    if (c.source) {
      const thread = findThread(c.source.brand, c.source.code);
      return { code: c.source.code, rgb: thread?.rgb ?? c.rgb, name: thread?.name };
    }
    return { rgb: c.rgb };
  });
  return { mode, colors };
}

// ---------------------------------------------------------------------------------------------------------------------
// The palette file

export const PALETTE_FILE_FORMAT = "cross-stitch-palette";

/** The text of a palette file. */
export function paletteFileText(set: PaletteSet, name?: string): string {
  return JSON.stringify(
    {
      format: PALETTE_FILE_FORMAT,
      version: 1,
      ...(name ? { name } : {}),
      mode: set.mode,
      colors: set.colors.map((c) => ({
        ...(c.code !== undefined ? { code: c.code } : {}),
        rgb: c.rgb,
        ...(c.name ? { name: c.name } : {}),
      })),
    },
    null,
    2
  );
}

const MODES: readonly string[] = ["full", ...THREAD_BRAND_IDS];

function isRgb(value: unknown): value is RGB {
  return Array.isArray(value) && value.length === 3 && value.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
}

/** A set from validated data, or why it is not one. Used for files, saved sets and the set a chart carries. */
export function parseSet(data: unknown): { set: PaletteSet } | { error: string } {
  if (typeof data !== "object" || data === null) return { error: "That is not a palette." };
  const d = data as Record<string, unknown>;
  if (typeof d.mode !== "string" || !MODES.includes(d.mode)) return { error: `A palette's mode must be one of: ${MODES.join(", ")}.` };
  if (!Array.isArray(d.colors) || d.colors.length < 1 || d.colors.length > MAX_COLORS) {
    return { error: `A palette holds between 1 and ${MAX_COLORS} colours.` };
  }
  const mode = d.mode as PaletteMode;
  const colors: PaletteSetColor[] = [];
  for (const entry of d.colors) {
    if (typeof entry !== "object" || entry === null) return { error: "A colour of the palette is not an object." };
    const e = entry as Record<string, unknown>;
    if (mode === "full") {
      if (!isRgb(e.rgb)) return { error: "A custom colour needs its RGB, three whole numbers from 0 to 255." };
      colors.push({ rgb: e.rgb });
    } else {
      if (typeof e.code !== "string") return { error: "A thread needs its code." };
      const thread = threadColor(mode, e.code);
      if (!thread) return { error: `${e.code} is not a ${mode.toUpperCase()} thread.` };
      colors.push(thread);
    }
  }
  return { set: { mode, colors } };
}

/** The set kept in the browser between visits: any valid set, or an empty one (nothing added yet) in a valid mode, or the empty default. */
export function parseStoredSet(data: unknown): PaletteSet {
  if (typeof data !== "object" || data === null) return EMPTY_SET;
  const d = data as Record<string, unknown>;
  if (typeof d.mode !== "string" || !MODES.includes(d.mode)) return EMPTY_SET;
  if (Array.isArray(d.colors) && d.colors.length === 0) return { mode: d.mode as PaletteMode, colors: [] };
  const parsed = parseSet(data);
  return "set" in parsed ? parsed.set : EMPTY_SET;
}

/** A palette file's set, or why the file is not one. */
export function parsePaletteFile(text: string): { set: PaletteSet; name?: string } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "That file is not a palette: it is not JSON." };
  }
  if (typeof data !== "object" || data === null || (data as Record<string, unknown>).format !== PALETTE_FILE_FORMAT) {
    return { error: "That file is not a palette file of this app." };
  }
  const parsed = parseSet(data);
  if ("error" in parsed) return parsed;
  const name = (data as Record<string, unknown>).name;
  return { set: parsed.set, ...(typeof name === "string" && name ? { name } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------------
// What a chart carries

/** The set a chart records, as data to write into its file. */
export function generationPaletteData(g: GenerationPalette): unknown {
  return {
    mode: g.mode,
    active: g.active,
    colors: g.colors.map((c) => ({ ...(c.code !== undefined ? { code: c.code } : {}), rgb: c.rgb })),
  };
}

/** The set a chart's file records, or `undefined` when it has none or it is not one (an old or damaged file opens without it). */
export function parseGenerationPalette(data: unknown): GenerationPalette | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const parsed = parseSet(data);
  if ("error" in parsed) return undefined;
  return { ...parsed.set, active: (data as Record<string, unknown>).active === true };
}
