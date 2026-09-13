import { isEnhancementModeId, type EnhancementModeId } from "../pipeline/enhance";
import { findThread, formatThreadName, THREAD_BRANDS, THREAD_BRAND_IDS, type ThreadBrand } from "../threads/thread-brands";
import { EMPTY_CELL, MAX_COLORS, MAX_STITCHES, type PaletteColor, type RGB, type SourceImageRef, type StitchPattern, type ThreadSwatchRef } from "../types";

// Plain JSON, not a PNG with embedded data (Owner decision, 2026-09-09,
// HANDOVER.md D21) -- simplest reliable format, at the cost of not being
// previewable as an image on its own. Bumped to 2 for G-012's embedded
// sourceImage, to 3 for G-016's dmcMode flag (Owner decision,
// 2026-09-10), to 4 for G-024's edgeMode flag, to 5 for G-029's
// generalized threadBrand field (HANDOVER.md D92), to 6 for G-032's
// enhancementMode, and to 7 for G-033's per-color thread `source` (D122) --
// old files still open fine either way, they just parse with that field
// absent/legacy-shaped (see deserializePattern).
export const FORMAT_VERSION = 7;

/** Files and autosave records from this version on store `source` explicitly, so an absent source means a custom color. */
const FIRST_VERSION_WITH_SOURCES = 7;

export interface SerializedPattern {
  formatVersion: number;
  width: number;
  height: number;
  isLandscape: boolean;
  /** Row-major, one index per cell -- a plain array, since Uint8Array doesn't round-trip through JSON.stringify usefully. */
  cellPalette: number[];
  /** `source` is absent for a custom color, and on files saved before version 7. */
  palette: Array<{ rgb: RGB; symbol: string; name: string; source?: { brand: ThreadBrand; code: string } }>;
  /** Optional so files saved before this field existed still parse (see deserializePattern's fallback). */
  name?: string;
  /** Absent on files saved before G-012, or when the pattern has no associated photo. */
  sourceImage?: SourceImageRef;
  /**
   * Legacy field, only ever present on a file saved before G-029 M1
   * (HANDOVER.md D92) -- `deserializePattern` reads it as a fallback for
   * `threadBrand` below, but `serializePattern` never writes it again.
   * Every other file in this codebase should read/write `threadBrand`,
   * never this field.
   */
  dmcMode?: boolean;
  /** Absent on files saved before G-029 M1, or when the pattern isn't matched to a thread brand. Replaces the legacy `dmcMode: boolean` above (G-016 originally only ever had one brand to be true/false about). */
  threadBrand?: ThreadBrand;
  /** Absent on files saved before G-024 M5, or when the pattern wasn't generated with `edgeMode: "crisp"`. */
  edgeMode?: "crisp";
  /** The photo enhancement the pattern was generated with; absent for Off and on files saved before G-032. */
  enhancementMode?: Exclude<EnhancementModeId, "off">;
}

/** `count`/`index` are left out -- both are derived from `cellPalette` and recomputed on load, not stored. */
export function serializePattern(pattern: StitchPattern): string {
  const data: SerializedPattern = {
    formatVersion: FORMAT_VERSION,
    width: pattern.width,
    height: pattern.height,
    isLandscape: pattern.isLandscape,
    cellPalette: Array.from(pattern.cellPalette),
    palette: pattern.palette.map((c) =>
      c.source ? { rgb: c.rgb, symbol: c.symbol, name: c.name, source: { brand: c.source.brand, code: c.source.code } } : { rgb: c.rgb, symbol: c.symbol, name: c.name }
    ),
    name: pattern.name,
    sourceImage: pattern.sourceImage,
    threadBrand: pattern.threadBrand,
    edgeMode: pattern.edgeMode,
    enhancementMode: pattern.enhancementMode,
  };
  return JSON.stringify(data);
}

/** Throws a descriptive error on malformed/tampered input rather than producing a silently-broken pattern. */
export function deserializePattern(json: string): StitchPattern {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  return deserializePatternData(data);
}

/**
 * The parsed-object half of `deserializePattern`, shared with the
 * IndexedDB project store (`lib/editor/project-store.ts`), whose records
 * are never JSON text. `cellPalette` may be a plain array or a typed array.
 *
 * Every field is validated, not just the grid geometry: a palette longer
 * than `MAX_COLORS` would otherwise be truncated by the `Uint8Array`
 * (index 260 silently becomes 4, index 255 becomes `EMPTY_CELL`), and a
 * malformed entry would reach the renderer as `rgb(undefined, ...)` /
 * a `NaN` luminance / a "null" legend row. See D099.
 */
export function deserializePatternData(data: unknown): StitchPattern {
  if (typeof data !== "object" || data === null) throw new Error("That file doesn't look like an editable pattern.");
  const d = data as Record<string, unknown>;

  const width = d.width;
  const height = d.height;
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    throw new Error("That file's dimensions are missing or invalid.");
  }
  // Generation enforces this range up front; a hand-edited or corrupted
  // file reaches this function without going through that check.
  if (width > MAX_STITCHES || height > MAX_STITCHES) {
    throw new Error(`That file's dimensions (${width}×${height}) exceed the maximum supported size of ${MAX_STITCHES} stitches per side.`);
  }

  const cellPalette = d.cellPalette;
  if (!isIndexList(cellPalette) || cellPalette.length !== width * height) {
    throw new Error("That file's stitch data doesn't match its stated dimensions.");
  }

  const rawPalette = d.palette;
  if (!Array.isArray(rawPalette) || rawPalette.length === 0) {
    throw new Error("That file has no color palette.");
  }
  if (rawPalette.length > MAX_COLORS) {
    throw new Error(`That file's palette has ${rawPalette.length} colors, more than the maximum of ${MAX_COLORS}.`);
  }
  const entries = rawPalette.map(validatePaletteEntry);
  const symbols = new Set(entries.map((c) => c.symbol));
  if (symbols.size !== entries.length) {
    throw new Error("That file's palette gives the same symbol to more than one color.");
  }

  for (let i = 0; i < cellPalette.length; i++) {
    const index = cellPalette[i];
    if (!Number.isInteger(index) || (index !== EMPTY_CELL && (index < 0 || index >= entries.length))) {
      throw new Error("That file references a color that isn't in its own palette.");
    }
  }

  const counts = new Array<number>(entries.length).fill(0);
  for (let i = 0; i < cellPalette.length; i++) {
    const index = cellPalette[i];
    if (index !== EMPTY_CELL) counts[index]++;
  }

  // Thread identity (D122). Version 7 on stores sources explicitly, so absence there means custom. Older data only ever
  // had thread names, so a locked pattern's colors are matched to its own brand by exact name: best effort, never proof.
  let threadBrand = resolveThreadBrand(d);
  const hasExplicitSources = typeof d.formatVersion === "number" && d.formatVersion >= FIRST_VERSION_WITH_SOURCES;
  if (!hasExplicitSources && threadBrand) {
    const byName = new Map(THREAD_BRANDS[threadBrand].colors.map((thread) => [formatThreadName(thread), thread]));
    for (const entry of entries) {
      const thread = byName.get(entry.name);
      if (thread) entry.source = { brand: threadBrand, code: thread.code };
    }
  }
  // A lock means every color is that brand's thread; when that can't be established, the lock goes and the sources stay.
  if (threadBrand && entries.some((entry) => entry.source?.brand !== threadBrand)) threadBrand = undefined;

  const palette: PaletteColor[] = entries.map((c, i) => {
    const color: PaletteColor = { index: i, rgb: c.rgb, symbol: c.symbol, name: c.name, count: counts[i] };
    return c.source ? { ...color, source: c.source } : color;
  });

  return {
    width,
    height,
    isLandscape: typeof d.isLandscape === "boolean" ? d.isLandscape : width >= height,
    cellPalette: Uint8Array.from(cellPalette),
    palette,
    name: typeof d.name === "string" && d.name.trim() !== "" ? d.name : undefined,
    sourceImage: isValidSourceImageRef(d.sourceImage) ? d.sourceImage : undefined,
    threadBrand,
    edgeMode: d.edgeMode === "crisp" ? "crisp" : undefined,
    // Any recognized mode is kept, released or not: the file records how it was built (D113).
    enhancementMode: isEnhancementModeId(d.enhancementMode) && d.enhancementMode !== "off" ? d.enhancementMode : undefined,
  };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isIndexList(value: unknown): value is ArrayLike<number> {
  return Array.isArray(value) || value instanceof Uint8Array;
}

function isByte(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

/**
 * A palette entry's thread identity, as a fresh object with the table's canonical code. Malformed or unknown values are
 * dropped rather than rejecting the file, like other optional metadata here -- the autosave loader deletes records it
 * can't read, so a stray source must not cost the whole project (D122).
 */
function parseSource(value: unknown): ThreadSwatchRef | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const { brand, code } = value as Record<string, unknown>;
  if (typeof brand !== "string" || !(THREAD_BRAND_IDS as string[]).includes(brand)) return undefined;
  if (typeof code !== "string" || code.trim() === "") return undefined;
  const thread = findThread(brand as ThreadBrand, code.trim());
  return thread ? { brand: brand as ThreadBrand, code: thread.code } : undefined;
}

function validatePaletteEntry(entry: unknown): { rgb: RGB; symbol: string; name: string; source?: ThreadSwatchRef } {
  if (typeof entry !== "object" || entry === null) throw new Error("That file's palette contains an entry that isn't a color.");
  const e = entry as Record<string, unknown>;
  const rgb = e.rgb;
  if (!Array.isArray(rgb) || rgb.length !== 3 || !rgb.every(isByte)) {
    throw new Error("That file's palette contains a color whose RGB value is invalid.");
  }
  if (typeof e.symbol !== "string" || e.symbol === "") {
    throw new Error("That file's palette contains a color with no symbol.");
  }
  if (typeof e.name !== "string") {
    throw new Error("That file's palette contains a color with no name.");
  }
  const source = parseSource(e.source);
  return source ? { rgb: [rgb[0], rgb[1], rgb[2]], symbol: e.symbol, name: e.name, source } : { rgb: [rgb[0], rgb[1], rgb[2]], symbol: e.symbol, name: e.name };
}

/**
 * Prefers the current `threadBrand` field, falling back to the legacy
 * `dmcMode: true` written before G-029 M1 (HANDOVER.md D92). An
 * unrecognized value falls back to "unmatched" rather than being stored
 * as an invalid `ThreadBrand` that would crash a later registry lookup.
 */
function resolveThreadBrand(d: Record<string, unknown>): ThreadBrand | undefined {
  if (typeof d.threadBrand === "string" && (THREAD_BRAND_IDS as string[]).includes(d.threadBrand)) {
    return d.threadBrand as ThreadBrand;
  }
  return d.dmcMode === true ? "dmc" : undefined;
}

// Loose validation rather than throwing: an absent/malformed sourceImage
// just means the photo-underlay mode and Move tool are unavailable for this
// pattern, not that the whole file is unopenable -- the grid/palette are
// still perfectly valid without it.
export function isValidSourceImageRef(value: unknown): value is SourceImageRef {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<SourceImageRef>;
  return (
    typeof v.dataUrl === "string" &&
    v.dataUrl.startsWith("data:") &&
    typeof v.naturalWidth === "number" &&
    v.naturalWidth > 0 &&
    typeof v.naturalHeight === "number" &&
    v.naturalHeight > 0 &&
    typeof v.cellSizePx === "number" &&
    v.cellSizePx > 0 &&
    typeof v.offsetX === "number" &&
    Number.isFinite(v.offsetX) &&
    typeof v.offsetY === "number" &&
    Number.isFinite(v.offsetY)
  );
}
