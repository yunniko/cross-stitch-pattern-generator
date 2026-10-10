import { tidyKinds } from "./stitch-kind";
import { generationPaletteData, parseGenerationPalette } from "./palette-set";
import { dedupeLines } from "./backstitch";
import { DITHER_MODES, type DitherMode } from "../pipeline/dither";
import { isValidDitherTexture, type DitherTexture } from "../pipeline/dither-hand-drawn";
import { isEnhancementModeId, type EnhancementModeId } from "./legacy-enhancement";
import { readSavedAdjust, type PhotoAdjust } from "../pipeline/photo-adjust";
import { storedSystem, threadIdentity, type ThreadBrand } from "../threads/thread-brands";
import { FLAT_FORMAT_VERSION, FORMAT_VERSION, migrateToCurrent } from "../document/migrate";
import { asDocument, flatten, isFlatDocument, newRevision, type ChartInput } from "../document/convert";
import { isLayerKind, layerKind } from "../document/layer-kinds";
import { MAX_LAYER_NAME, MAX_LAYERS, type ChartDocument, type ChartProperties, type Layer } from "../document/types";
import { effectiveSymmetryAxes, NO_SYMMETRY, SYMMETRY_AXES, type SymmetryAxes, type SymmetryAxis } from "./symmetry-axes";
import {
  MAX_COLORS,
  type BackstitchLine,
  type ChartFabric,
  MAX_STITCHES,
  type PaletteColor,
  type RGB,
  type SourceImageRef,
  type StitchPattern,
  type ThreadSwatchRef,
} from "../types";

// Plain JSON, not a PNG with embedded data (Owner decision, 2026-09-09, HANDOVER.md D21): the simplest reliable format, at
// the cost of not being previewable as an image on its own. The format's version, what each version changed and how an
// older file is brought up to date are in `lib/document/migrate.ts` (G-094).
export { FLAT_FORMAT_VERSION, FORMAT_VERSION };

export interface SerializedPattern {
  formatVersion: number;
  width: number;
  height: number;
  isLandscape: boolean;
  /** Row-major, one index per cell -- a plain array, since Uint8Array doesn't round-trip through JSON.stringify usefully. */
  cellPalette: number[];
  /** `source` is absent for a custom color, and on files saved before version 7. */
  palette: Array<{ rgb: RGB; symbol: string; name: string; source?: { brand: string; code: string } }>;
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
  /** Absent on files saved before G-024 M5, or for a Standard pattern. "crisp-plus" is written from G-038 on; older builds read it as Standard. */
  edgeMode?: "crisp" | "crisp-plus";
  /** The photo enhancement the chart was generated with, for files saved before G-074 M4 removed the modes. */
  enhancementMode?: Exclude<EnhancementModeId, "off">;
  /**
   * The four photo sliders the chart was generated with (G-074); absent when they were all centred and
   * on files saved before it. Additive, like `ditherMode` above, so the format version stays where it is
   * and an older build simply ignores it (D138).
   */
  photoAdjust?: PhotoAdjust;
  /**
   * The dither pattern the chart was generated with (G-052); absent for Off and on files saved before it. Optional,
   * like `symmetry`, so the format version stays where it is and an older build simply ignores it (D138).
   */
  ditherMode?: Exclude<DitherMode, "off">;
  /**
   * What the drawn marks were made of (G-055), embedded rather than referenced: a chart must reopen as it was made,
   * and a named texture the reader later edits would not do that. Absent for the default and for every other pattern.
   */
  ditherTexture?: DitherTexture;
  /**
   * Generated with Vivid (G-061); absent for a chart whose stitches are plain area means, and on files saved
   * before it. Recorded so a reopened chart says how it was made, the way `ditherMode` does.
   */
  vivid?: true;
  /**
   * The set of colours the Owner chose for this chart's generation, kept with it (G-087, D277): the palette mode it belongs to, its
   * colours (a thread by code in a brand, an RGB otherwise) and whether the chart was made from it. Additive and optional like
   * `photoAdjust`, so the format version stays where it is, an older build ignores it and an older file opens without one.
   */
  generationPalette?: unknown;
  /**
   * The symmetry axes that were on when the file was saved (G-037); absent when none were. An optional field that
   * older builds ignore, so the format version stays the same (D138).
   */
  symmetry?: SerializedSymmetry;
  /**
   * Backstitch lines (G-073), absent for a chart with none. Additive and optional like `symmetry`, so the format
   * version stays where it is and a build that predates backstitch opens the file as the crosses alone.
   */
  backstitch?: BackstitchLine[];
  /**
   * The stitch kind of each cell (G-082): 0 whole, 1 half "/", 2 half "\\". Absent for a chart with no half stitch and on
   * files saved before it. Additive like `backstitch`, so the format version stays where it is and a build that predates
   * half stitches opens the file with every stitch whole.
   */
  cellKind?: number[];
  /**
   * The chart's fabric (G-094, D290): its count and the unit its size is shown in. Absent on a file saved before it, and on a
   * chart that was never given one. Additive, so the format version stays where it is and an older build ignores it.
   */
  fabric?: ChartFabric;
}

/** One layer as a file or the autosave holds it: its header, and its kind's own fields (`LayerKindDefinition.write`). */
export interface SerializedLayer {
  id: string;
  kind: string;
  name: string;
  visible: boolean;
  [field: string]: unknown;
}

/**
 * A chart of more than one plain layer (format 8, G-130, D390): every field of a flat chart but its stitches, which are in
 * its layers, bottom first.
 */
export type SerializedLayeredChart = Omit<SerializedPattern, "cellPalette" | "cellKind"> & { layers: SerializedLayer[] };

/** Only the axes that are on, each `true`. */
export type SerializedSymmetry = Partial<Record<SymmetryAxis, true>>;

/** The on axes as stored in a file or autosave record, or undefined when none are on. */
export function serializeSymmetry(symmetry: SymmetryAxes): SerializedSymmetry | undefined {
  const on = SYMMETRY_AXES.filter((axis) => symmetry[axis]);
  return on.length === 0 ? undefined : Object.fromEntries(on.map((axis) => [axis, true]));
}

/**
 * Reads a stored symmetry value leniently: only axes stored as `true` are on, anything unreadable is off, and the
 * diagonals are off on a non-square canvas (G-037 criteria 1 and 3). Nothing is reported for a missing or bad field.
 */
export function readSymmetry(value: unknown, width: number, height: number): SymmetryAxes {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return NO_SYMMETRY;
  const stored = value as Record<string, unknown>;
  const axes = Object.fromEntries(SYMMETRY_AXES.map((axis) => [axis, stored[axis] === true])) as Record<SymmetryAxis, boolean>;
  if (!SYMMETRY_AXES.some((axis) => axes[axis])) return NO_SYMMETRY;
  return effectiveSymmetryAxes(axes, width, height);
}

/**
 * A flat chart as a file: the visible stitches as one grid, in the format a build from before layers reads, and the one
 * the exporters read (the Rust sidecar among them). What the editor saves is `serializeChart`, which keeps the layers.
 *
 * `count`/`index` are left out -- both are derived from `cellPalette` and recomputed on load, not stored. `symmetry` is
 * written only when an axis is on, so a file saved with symmetry off is byte-identical to one saved before G-037.
 */
export function serializePattern(pattern: StitchPattern, symmetry: SymmetryAxes = NO_SYMMETRY): string {
  return JSON.stringify(flatFields(pattern, symmetry));
}

/**
 * The open chart as its editable file: a chart that is one plain layer exactly as `serializePattern` writes it (format 7,
 * byte for byte as before layers), and any other with its layers, their order, names and visibility (format 8).
 */
export function serializeChart(chart: ChartInput, symmetry: SymmetryAxes = NO_SYMMETRY): string {
  const document = asDocument(chart);
  if (isFlatDocument(document)) return serializePattern(flatten(document), symmetry);
  return JSON.stringify(layeredFields(document, symmetry), (_key, value: unknown) =>
    value instanceof Uint8Array ? Array.from(value) : value
  );
}

/** A layered document's fields, its planes left as the typed arrays they are (the autosave stores them so). */
export function layeredFields(document: ChartDocument, symmetry: SymmetryAxes): SerializedLayeredChart {
  const { cellPalette: _cells, cellKind: _kinds, ...fields } = flatFields(flatten(document), symmetry);
  void _cells;
  void _kinds;
  return { ...fields, formatVersion: FORMAT_VERSION, layers: document.layers.map(serializeLayer) };
}

export function serializeLayer(layer: Layer): SerializedLayer {
  return { id: layer.id, kind: layer.kind, name: layer.name, visible: layer.visible, ...layerKind(layer).write(layer) };
}

function flatFields(pattern: StitchPattern, symmetry: SymmetryAxes): SerializedPattern {
  const kinds = tidyKinds(pattern.cellPalette, pattern.cellKind);
  return {
    formatVersion: FLAT_FORMAT_VERSION,
    width: pattern.width,
    height: pattern.height,
    isLandscape: pattern.isLandscape,
    cellPalette: Array.from(pattern.cellPalette),
    palette: pattern.palette.map((c) =>
      c.source
        ? { rgb: c.rgb, symbol: c.symbol, name: c.name, source: { brand: c.source.brand, code: c.source.code } }
        : { rgb: c.rgb, symbol: c.symbol, name: c.name }
    ),
    name: pattern.name,
    sourceImage: pattern.sourceImage,
    threadBrand: pattern.threadBrand,
    edgeMode: pattern.edgeMode,
    enhancementMode: pattern.enhancementMode,
    photoAdjust: pattern.photoAdjust,
    ditherMode: pattern.ditherMode,
    ditherTexture: pattern.ditherTexture,
    vivid: pattern.vivid,
    generationPalette: pattern.generationPalette ? generationPaletteData(pattern.generationPalette) : undefined,
    symmetry: serializeSymmetry(effectiveSymmetryAxes(symmetry, pattern.width, pattern.height)),
    backstitch: pattern.backstitch?.length ? pattern.backstitch : undefined,
    cellKind: kinds ? Array.from(kinds) : undefined,
    fabric: pattern.fabric ? { count: pattern.fabric.count, unit: pattern.fabric.unit } : undefined,
  };
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
}

/**
 * A saved file: the chart as a document (every layer), the visible chart flattened from it (what a preview or an export
 * takes), and the symmetry axes stored with it (off when absent or unreadable).
 */
export function parsePatternDocument(json: string): { document: ChartDocument; pattern: StitchPattern; symmetry: SymmetryAxes } {
  const data = parseJson(json);
  const document = deserializeChartData(data);
  const symmetry = readSymmetry((data as { symmetry?: unknown }).symmetry, document.width, document.height);
  return { document, pattern: flatten(document), symmetry };
}

/** The visible chart of a file. Throws a descriptive error on malformed/tampered input rather than producing a silently-broken pattern. */
export function deserializePattern(json: string): StitchPattern {
  return deserializePatternData(parseJson(json));
}

/** A file's chart as a document, every layer kept. */
export function deserializeChart(json: string): ChartDocument {
  return deserializeChartData(parseJson(json));
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
/**
 * Backstitch lines from a file (G-073), validated as strictly as the grid is (D099).
 *
 * A line names corners, so its coordinates run `0..width` and `0..height` **inclusive** — one past the last
 * cell index, which is the off-by-one worth being deliberate about. Anything malformed is refused rather than
 * silently dropped: a line pointing at a colour the palette does not have would reach the renderer as an
 * undefined thread, exactly the class of bug D099 exists to stop.
 */
function readBackstitch(raw: unknown, width: number, height: number, paletteLength: number): BackstitchLine[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new Error("That file's backstitch data isn't a list.");
  if (raw.length === 0) return undefined;
  const corner = (v: unknown, limit: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= limit;
  const lines = raw.map((entry) => {
    if (typeof entry !== "object" || entry === null) throw new Error("That file has a backstitch line that isn't an object.");
    const l = entry as Record<string, unknown>;
    if (!corner(l.x1, width) || !corner(l.x2, width) || !corner(l.y1, height) || !corner(l.y2, height)) {
      throw new Error("That file has a backstitch line outside its own grid.");
    }
    if (l.x1 === l.x2 && l.y1 === l.y2) throw new Error("That file has a backstitch line with no length.");
    const index = l.paletteIndex;
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= paletteLength) {
      throw new Error("That file has a backstitch line in a color that isn't in its own palette.");
    }
    return {
      x1: l.x1 as number,
      y1: l.y1 as number,
      x2: l.x2 as number,
      y2: l.y2 as number,
      paletteIndex: index as number,
    } satisfies BackstitchLine;
  });
  return dedupeLines(lines);
}

/** The visible chart of a file's parsed data: its layers flattened (`deserializeChartData`). */
export function deserializePatternData(data: unknown): StitchPattern {
  return flatten(deserializeChartData(data));
}

/**
 * A chart's layers from a file (G-130), each checked by its kind as strictly as the rest of the file (D099). A layer of a
 * kind this build does not know is refused by name rather than dropped: what it put on the chart would silently go.
 */
function readLayers(raw: unknown, width: number, height: number, paletteLength: number): Layer[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("That file has no layers.");
  if (raw.length > MAX_LAYERS) throw new Error(`That file has ${raw.length} layers, more than the maximum of ${MAX_LAYERS}.`);
  const ids = new Set<string>();
  return raw.map((entry: unknown, index) => {
    if (typeof entry !== "object" || entry === null) throw new Error("That file has a layer that isn't an object.");
    const fields = entry as Record<string, unknown>;
    const { id, kind } = fields;
    if (typeof id !== "string" || id === "" || ids.has(id)) throw new Error("That file's layers don't each have an id of their own.");
    ids.add(id);
    if (!isLayerKind(kind)) {
      throw new Error(
        `That file has a layer of a kind this version of the app doesn't know ("${String(kind)}"). Reload the page to get the latest version, then open it again.`
      );
    }
    // A name or visibility that cannot be read is not worth losing the chart over: the layer opens named by its place, and shown.
    const name = typeof fields.name === "string" ? fields.name.trim().slice(0, MAX_LAYER_NAME) : "";
    const header = { id, kind, name: name === "" ? `Layer ${index + 1}` : name, visible: fields.visible !== false };
    return layerKind(header).read(fields, header, { width, height }, paletteLength);
  });
}

/**
 * A file's parsed data as a document, shared with the IndexedDB project store (`lib/editor/project-store.ts`), whose
 * records are never JSON text: a plane may be a plain array or a typed array. A file of a version before layers is read as
 * one layer (`lib/document/migrate.ts`).
 */
export function deserializeChartData(data: unknown): ChartDocument {
  if (typeof data !== "object" || data === null) throw new Error("That file doesn't look like an editable pattern.");
  // Whatever version the file is, what is read below is the current one (`lib/document/migrate.ts`).
  const d = migrateToCurrent(data as Record<string, unknown>);

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

  const rawPalette = d.palette;
  // An empty palette is legal only for a chart with nothing stitched yet (G-040): the per-cell check in the layer's kind then accepts
  // `EMPTY_CELL` alone, so a file that names a colour it doesn't carry is still refused.
  if (!Array.isArray(rawPalette)) {
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

  const layers = readLayers(d.layers, width, height, entries.length);

  // Thread identity (D122): every colour names its thread, or is a custom one. A file from before that was given its
  // sources by the migration step.
  // The brand the chart was generated in, kept as it is: it no longer limits the colours (G-131).
  const threadBrand = resolveThreadBrand(d);

  // The counts are of the visible chart, which `flatten` makes; a document's own palette does not keep them.
  const palette: PaletteColor[] = entries.map((c, i) => {
    const color: PaletteColor = { index: i, rgb: c.rgb, symbol: c.symbol, name: c.name, count: 0 };
    return c.source ? { ...color, source: c.source } : color;
  });

  const backstitch = readBackstitch(d.backstitch, width, height, entries.length);

  const properties: ChartProperties = {
    isLandscape: typeof d.isLandscape === "boolean" ? d.isLandscape : width >= height,
    name: typeof d.name === "string" && d.name.trim() !== "" ? d.name : undefined,
    sourceImage: isValidSourceImageRef(d.sourceImage) ? d.sourceImage : undefined,
    threadBrand,
    edgeMode: d.edgeMode === "crisp" || d.edgeMode === "crisp-plus" ? d.edgeMode : undefined,
    // Any recognized mode is kept, released or not: the file records how it was built (D113).
    enhancementMode: isEnhancementModeId(d.enhancementMode) && d.enhancementMode !== "off" ? d.enhancementMode : undefined,
    // Every field clamped, and dropped entirely when it comes to neutral: a file cannot ask generation
    // for an adjustment no slider could have made.
    photoAdjust: readSavedAdjust(d.photoAdjust),
    ditherMode: isDitherModeId(d.ditherMode) && d.ditherMode !== "off" ? d.ditherMode : undefined,
    // A texture that is out of range or from a newer build falls back to the default, so the file still opens.
    ditherTexture: isValidDitherTexture(d.ditherTexture) ? d.ditherTexture : undefined,
    // Anything but a literal true, including its absence in a file saved before G-061, reads as off.
    vivid: d.vivid === true ? true : undefined,
    // A set that is not one (a newer build's, or damaged) is dropped, and the chart opens without it.
    generationPalette: parseGenerationPalette(d.generationPalette),
    ...fabricField(d.fabric),
  };
  return { revision: newRevision(), width, height, layers, palette, ...(backstitch ? { backstitch } : {}), properties };
}

/** A chart's fabric from a file. One that is not a count above zero with a unit is dropped, and the chart opens without it. */
export function readFabric(value: unknown): ChartFabric | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { count, unit } = value as { count?: unknown; unit?: unknown };
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return undefined;
  return unit === "in" || unit === "cm" ? { count, unit } : undefined;
}

/** Present only when the file has one, so a chart without a fabric stays without the key. */
function fabricField(value: unknown): { fabric?: ChartFabric } {
  const fabric = readFabric(value);
  return fabric ? { fabric } : {};
}

function isDitherModeId(value: unknown): value is DitherMode {
  return typeof value === "string" && (DITHER_MODES as readonly string[]).includes(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
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
  // A number no catalogue lists is kept (G-131), and so is a system not loaded here (G-132): the file's word for its thread.
  return typeof brand === "string" && typeof code === "string" ? (threadIdentity(brand, code) ?? undefined) : undefined;
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
  return source
    ? { rgb: [rgb[0], rgb[1], rgb[2]], symbol: e.symbol, name: e.name, source }
    : { rgb: [rgb[0], rgb[1], rgb[2]], symbol: e.symbol, name: e.name };
}

/**
 * Prefers the current `threadBrand` field, falling back to the legacy
 * `dmcMode: true` written before G-029 M1 (HANDOVER.md D92). Any
 * system string is kept, loaded here or not (G-132): it is what the picker opens on, and a system this page lacks opens
 * the common colour picker. A value no system could be is dropped.
 */
function resolveThreadBrand(d: Record<string, unknown>): ThreadBrand | undefined {
  return storedSystem(d.threadBrand);
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
