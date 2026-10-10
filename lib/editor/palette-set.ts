import type { PaletteMode } from "../pipeline/generation-modes";
import type { ColorPrediction } from "../pipeline/prediction";
import { findThread, formatThreadName, THREAD_BRAND_IDS, threadIdentity, type ThreadBrand } from "../threads/thread-brands";
import { MAX_COLORS, type GenerationPalette, type PaletteSetColor, type RGB, type StitchPattern, type ThreadSwatchRef } from "../types";

export type { GenerationPalette, PaletteSetColor };

/**
 * A palette: a set of colours the user chose for a generation (G-087), saved, or loaded into a chart (G-131).
 *
 * Each colour is its own thread of any system, listed or typed, or no thread (D397). The set's mode is the palette mode it was
 * made in: the catalogue its picker offers and the system a generation from it records, never a limit on its colours.
 */

export interface PaletteSet {
  mode: PaletteMode;
  colors: PaletteSetColor[];
}

export const EMPTY_SET: PaletteSet = { mode: "full", colors: [] };

const sameRgb = (a: RGB, b: RGB) => a.every((v, i) => v === b[i]);

/** The same thread (system and number, the number's case aside), or for two colours with none, the same colour. */
export function sameThread(a: Pick<PaletteSetColor, "rgb" | "source">, b: Pick<PaletteSetColor, "rgb" | "source">): boolean {
  if (a.source || b.source) {
    return a.source?.brand === b.source?.brand && a.source?.code.toLowerCase() === b.source?.code.toLowerCase();
  }
  return sameRgb(a.rgb, b.rgb);
}

/** The set with `color` added, unless the set holds it already or is full. */
export function withColor(set: PaletteSet, color: PaletteSetColor): PaletteSet {
  if (set.colors.length >= MAX_COLORS || set.colors.some((c) => sameThread(c, color))) return set;
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

/** A thread of a brand's catalogue as a set colour, named as a chart names it. */
export function threadColor(brand: ThreadBrand, code: string): PaletteSetColor | null {
  const thread = findThread(brand, code);
  return thread ? { rgb: thread.rgb, name: formatThreadName(thread), source: { brand, code: thread.code } } : null;
}

/** A thread's name when nobody named it: the catalogue's "code - name", or the number alone. */
function threadName(source: ThreadSwatchRef): string {
  const thread = findThread(source.brand, source.code);
  return thread ? formatThreadName(thread) : source.code;
}

const hex = (rgb: RGB) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** What a set colour is called on screen. */
export function colorLabel(color: PaletteSetColor): string {
  return color.name || (color.source ? threadName(color.source) : hex(color.rgb));
}

/** The set with the colour at `index` renamed; an empty name goes back to the thread's own. */
export function withColorName(set: PaletteSet, index: number, name: string): PaletteSet {
  const trimmed = name.trim().slice(0, 60);
  return {
    ...set,
    colors: set.colors.map((c, i) => {
      if (i !== index) return c;
      return { rgb: c.rgb, ...(trimmed ? { name: trimmed } : {}), ...(c.source ? { source: c.source } : {}) };
    }),
  };
}

/**
 * The set with the colour at `index` made `thread`, typed or chosen, or no thread (null). The colour never changes (Owner,
 * 2026-10-10); a name that begins with the old number follows the new one, as `setColorThread` does in a chart. The set itself
 * when another of its colours is that thread already.
 */
export function withColorThread(set: PaletteSet, index: number, thread: ThreadSwatchRef | null): PaletteSet {
  const color = set.colors[index];
  if (!color) return set;
  if (thread && set.colors.some((c, i) => i !== index && sameThread(c, { rgb: c.rgb, source: thread }))) return set;
  const old = color.source?.code;
  const name = color.name;
  const followed =
    thread && old !== undefined && name !== undefined && (name === old || name.startsWith(`${old} - `))
      ? thread.code + name.slice(old.length)
      : name;
  const next: PaletteSetColor = { rgb: color.rgb, ...(followed ? { name: followed } : {}), ...(thread ? { source: thread } : {}) };
  return { ...set, colors: set.colors.map((c, i) => (i === index ? next : c)) };
}

/** A set colour as the generation request and the files write it: the colour, its name and its thread. */
function colorData(c: PaletteSetColor): { rgb: RGB; name?: string; system?: ThreadBrand; number?: string } {
  return {
    rgb: c.rgb,
    ...(c.name ? { name: c.name } : {}),
    ...(c.source ? { system: c.source.brand, number: c.source.code } : {}),
  };
}

/** The set as a generation request names it: each colour with its thread, so typed and mixed threads come through (D397). */
export function setRequest(set: PaletteSet): { mode: PaletteMode; colors: Array<ReturnType<typeof colorData>> } {
  return { mode: set.mode, colors: set.colors.map(colorData) };
}

/**
 * The colours of a prediction as a set in `mode`: in a brand, the threads nearest them (one thread once, however many colours
 * map to it); in the full colour mode, the colours themselves.
 */
export function setFromPrediction(prediction: ColorPrediction, mode: PaletteMode): PaletteSet {
  let result: PaletteSet = { mode, colors: [] };
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

/** A chart's colours as a set, each with its colour, name and thread as the chart has them: what Save palette writes. */
export function setFromPattern(pattern: StitchPattern): PaletteSet {
  const colors = pattern.palette.map((c): PaletteSetColor => ({
    rgb: c.rgb,
    ...(c.name ? { name: c.name } : {}),
    ...(c.source ? { source: c.source } : {}),
  }));
  return { mode: pattern.threadBrand ?? "full", colors };
}

// ---------------------------------------------------------------------------------------------------------------------
// The palette file

export const PALETTE_FILE_FORMAT = "cross-stitch-palette";
const PALETTE_FILE_VERSION = 2;

/** The text of a palette file (version 2, D397): each colour's colour, name, system and number. */
export function paletteFileText(set: PaletteSet, name?: string): string {
  return JSON.stringify(
    {
      format: PALETTE_FILE_FORMAT,
      version: PALETTE_FILE_VERSION,
      ...(name ? { name } : {}),
      mode: set.mode,
      colors: set.colors.map(colorData),
    },
    null,
    2
  );
}

/**
 * The name a palette is downloaded under. Only what a file name cannot hold is replaced, so a name in any script stays readable
 * (`[^\\w-]` turned "нитки" into "__", QA 2026-10-04); a name with nothing left is "palette".
 */
export function paletteFileName(name: string): string {
  const safe = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[ ._]+|[ ._]+$/g, "");
  return `${safe || "palette"}_palette.json`;
}

const MODES: readonly string[] = ["full", ...THREAD_BRAND_IDS];

function isRgb(value: unknown): value is RGB {
  return Array.isArray(value) && value.length === 3 && value.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
}

/**
 * One colour of stored data, or why it is not one. Two shapes are read (D397): `system` and `number` with the colour and name
 * (version 2, any thread, typed ones too); and `code` in a brand's set (version 1, written before G-131), which must be a
 * listed thread and takes the catalogue's colour and name.
 */
function parseColor(e: Record<string, unknown>, mode: PaletteMode): PaletteSetColor | { error: string } {
  const name = typeof e.name === "string" && e.name.trim() ? e.name.trim().slice(0, 60) : undefined;
  if (e.system !== undefined || e.number !== undefined) {
    if (typeof e.system !== "string" || typeof e.number !== "string") return { error: "A thread needs both its system and its number." };
    const source = threadIdentity(e.system, e.number);
    if (!source) return { error: `${e.system} ${e.number} is not a thread system and number.` };
    if (!isRgb(e.rgb)) return { error: "A colour needs its RGB, three whole numbers from 0 to 255." };
    return { rgb: e.rgb, ...(name ? { name } : {}), source };
  }
  if (mode !== "full" && e.code !== undefined) {
    if (typeof e.code !== "string") return { error: "A thread needs its code." };
    return threadColor(mode, e.code) ?? { error: `${e.code} is not a ${mode.toUpperCase()} thread.` };
  }
  if (!isRgb(e.rgb)) return { error: "A colour needs its RGB, three whole numbers from 0 to 255." };
  return { rgb: e.rgb, ...(name ? { name } : {}) };
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
    const color = parseColor(entry as Record<string, unknown>, mode);
    if ("error" in color) return color;
    // A colour named twice is one colour, as it is when added by hand.
    if (!colors.some((c) => sameThread(c, color))) colors.push(color);
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

/** A palette file's set, or why the file is not one. Version 1 files load as they always did. */
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
  const version = (data as Record<string, unknown>).version;
  if (typeof version === "number" && version > PALETTE_FILE_VERSION) {
    return { error: "That palette file was written by a newer version of this app." };
  }
  const parsed = parseSet(data);
  if ("error" in parsed) return parsed;
  const name = (data as Record<string, unknown>).name;
  return { set: parsed.set, ...(typeof name === "string" && name ? { name } : {}) };
}

/** The data a saved palette is kept as: its name, mode and colours, as the file writes them. */
export function setData(set: PaletteSet): { mode: PaletteMode; colors: Array<ReturnType<typeof colorData>> } {
  return { mode: set.mode, colors: set.colors.map(colorData) };
}

// ---------------------------------------------------------------------------------------------------------------------
// What a chart carries

/** The set a chart records, as data to write into its file. */
export function generationPaletteData(g: GenerationPalette): unknown {
  return { mode: g.mode, active: g.active, colors: g.colors.map(colorData) };
}

/** The set a chart's file records, or `undefined` when it has none or it is not one (an old or damaged file opens without it). */
export function parseGenerationPalette(data: unknown): GenerationPalette | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const parsed = parseSet(data);
  if ("error" in parsed) return undefined;
  return { ...parsed.set, active: (data as Record<string, unknown>).active === true };
}
