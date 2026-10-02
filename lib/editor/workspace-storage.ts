import { DEFAULT_EXPORT_CELL_MM, normalCellMm } from "../export/export-cell-size";
import { isStitchKind } from "./stitch-kind";
import type { OverlapCells } from "../export/a4-layout";
import type { LegacyProjectSlot } from "./project-store";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT, type SizeUnit } from "../export/finished-size";
import { CANVAS_TEXTURE_OFF, isCanvasTextureChoice, type CanvasTextureChoice } from "../export/canvas-texture-catalog";
import { DEFAULT_STITCH_TEXTURE, isStitchTextureId, type StitchTextureId } from "../export/stitch-texture-catalog";
import { DITHER_MODES, isDithered, type DitherMode } from "../pipeline/dither";
import { BRUSH_SIZES, DEFAULT_BRUSH_SHAPE, DEFAULT_BRUSH_SIZE, type BrushShape, type BrushSize } from "./brush-stamp";
import type { ShapeFill } from "./shape-raster";
import { DEFAULT_DITHER_TEXTURE, isValidDitherTexture, type DitherTexture } from "../pipeline/dither-hand-drawn";
import { NEUTRAL_ADJUST, readAdjust, type PhotoAdjust } from "../pipeline/photo-adjust";
import type { EdgeMode, GenerationMode, PaletteMode } from "../pipeline/generation-modes";
import { THREAD_BRAND_IDS } from "../threads/thread-brands";
import { MAX_COLORS, MAX_STITCHES, MIN_COLORS, MIN_STITCHES, type SizePresetId } from "../types";

// Workspace-level preferences, persisted to localStorage (G-015). Per-
// browser and best-effort: every access -- reads included, since some
// browsers throw on the `localStorage` getter itself when site data is
// blocked -- is wrapped so a disabled/full/unavailable store degrades to
// "nothing persists" rather than throwing (D100). The in-progress project
// itself lives in IndexedDB (lib/editor/project-store.ts); only the legacy
// slot below remains here, for a one-time migration.
export const OPTIONS_KEY = "cross-stitch-pattern-generator:options:v1";
export const LEGACY_PROJECT_KEY = "cross-stitch-pattern-generator:project:v1";

export interface WorkspaceOptions {
  aidaCount: number;
  sizeUnit: SizeUnit;
  authorName: string;
  /** The Standard/Crisp/Crisp+ choice for the *next* Generate -- a remembered UI preference, unlike `edgeMode` on a `StitchPattern`, which records how that pattern was built. */
  edgeMode: EdgeMode;
  /** A4/PDF export overlap; defaults to 5 like `calculateA4Layout` itself. */
  overlapCells: OverlapCells;
  /** How big one stitch is printed on the A4 pages, in millimetres (G-083); the full-size picture does not use it. */
  exportCellMm: number;
  /** On-screen canvas background behind empty cells and the realistic preview. Display only, never threaded into any export. */
  canvasColor: string;
  /** Which stitch texture the realistic view and the exported realistic preview draw with (D249). */
  stitchTexture: StitchTextureId;
  /** The cloth the realistic view sits on, or "off" for the plain canvas colour (G-077). */
  canvasTexture: CanvasTextureChoice;
  /** Whether the exported realistic preview carries the canvas (colour and texture) instead of a transparent ground. */
  exportCanvas: boolean;
  /** Generate settings remembered across reloads (Owner request, 2026-09-12); nothing on a `StitchPattern` records these. */
  sizePreset: SizePresetId;
  /** Kept even when a named preset is selected, so switching back to Custom restores the last custom value. */
  customSize: number;
  colorCount: number;
  generationMode: GenerationMode;
  paletteMode: PaletteMode;
  /** The four photo sliders (G-074): what the reader asked for, neutral at 0. Shown live, and read by the next Generate. */
  photoAdjust: PhotoAdjust;
  /** The dither pattern for the *next* Generate; "off" is the pipeline as it was. Never dithered while `edgeMode` is Crisp (D199). */
  ditherMode: DitherMode;
  /** What the drawn marks are made of for the next Generate (G-055); only read when a drawn pattern is chosen. */
  ditherTexture: DitherTexture;
  /** Vivid for the *next* Generate (G-061): a stitch keeps the chroma of its most colourful part instead of averaging it away. */
  vivid: boolean;
  /** Backstitch traced from the lines of the picture on the *next* Generate (G-084); off unless asked for. */
  backstitchLines: boolean;
  /** How readily it takes a faint line for one, 0 to 1 in steps of 0.1 (G-084). */
  backstitchSensitivity: number;
  /** Also trace the strongest long lines of a photograph (G-084, D270); a drawing is traced either way. */
  backstitchPhotos: boolean;
  /** Texture strokes over the stitches on the *next* Generate (G-085); off unless asked for. */
  textureStrokes: boolean;
  /** How many of them, 0 to 1 in steps of 0.1: a few accents at the default (G-085). */
  textureDensity: number;
  /** How many stitches across one press of the brush covers (G-064); odd only, so every stamp has a centre. */
  brushSize: BrushSize;
  /** The shape of that press: a block, or the disc that fits it. */
  brushShape: BrushShape;
  /** Whether Rectangle and Oval draw their outline or a solid block of stitches (G-064). */
  shapeFill: ShapeFill;
  /** What the painting and filling tools lay down (G-082): 0 a whole stitch, 1 a half stitch "/", 2 a half stitch "\\". */
  stitchKind: 0 | 1 | 2;
  /** The transparency lock (G-079): drawing and filling cannot turn empty stitches into colour or the reverse. */
  lockTransparency: boolean;
  /** The Text tab's last settings (G-081): the font family and face by name, the size in stitches and the weight. Not the text. */
  textFamily: string;
  textStyle: string;
  textSize: number;
  textWeight: number;
  /** Whether a Brush double-click floods the region under it as one undo step (D138); off leaves the two clicks as themselves. */
  doubleClickFill: boolean;
}

export const DEFAULT_OPTIONS: WorkspaceOptions = {
  aidaCount: DEFAULT_AIDA_COUNT,
  sizeUnit: DEFAULT_SIZE_UNIT,
  authorName: "",
  edgeMode: "standard",
  overlapCells: 5,
  exportCellMm: DEFAULT_EXPORT_CELL_MM,
  canvasColor: "#ffffff",
  stitchTexture: DEFAULT_STITCH_TEXTURE,
  canvasTexture: CANVAS_TEXTURE_OFF,
  exportCanvas: false,
  sizePreset: "medium",
  customSize: 100,
  colorCount: 16,
  generationMode: "latest",
  paletteMode: "full",
  photoAdjust: NEUTRAL_ADJUST,
  ditherMode: "off",
  ditherTexture: DEFAULT_DITHER_TEXTURE,
  vivid: false,
  backstitchLines: false,
  backstitchSensitivity: 0.5,
  backstitchPhotos: false,
  textureStrokes: false,
  textureDensity: 0.3,
  brushSize: DEFAULT_BRUSH_SIZE,
  brushShape: DEFAULT_BRUSH_SHAPE,
  shapeFill: "outline",
  stitchKind: 0,
  doubleClickFill: true,
  lockTransparency: false,
  textFamily: "sans-serif",
  textStyle: "Regular",
  textSize: 12,
  textWeight: 50,
};

/** The overlaps the A4 layout can actually paginate with; shared so the processor validates against the same list. */
export const VALID_OVERLAP_CELLS: readonly OverlapCells[] = [0, 3, 5, 10];
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const VALID_SIZE_PRESETS: readonly SizePresetId[] = ["small", "medium", "large", "xl", "xxl", "custom"];

/** A stored name (a font family or face): a short non-empty string, else the default. */
function shortName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" && value.length <= 100 ? value : fallback;
}

/** Reads persisted options, falling back to defaults on first visit or any corrupt/missing data, field by field. */
export function loadWorkspaceOptions(): WorkspaceOptions {
  if (typeof window === "undefined") return DEFAULT_OPTIONS;
  try {
    const raw = window.localStorage.getItem(OPTIONS_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    const parsed = JSON.parse(raw) as Partial<WorkspaceOptions>;
    const edgeMode = parsed.edgeMode === "crisp" || parsed.edgeMode === "crisp-plus" ? parsed.edgeMode : DEFAULT_OPTIONS.edgeMode;
    // A stored dither pattern only survives if it can still run: an unknown value, or one stored alongside Crisp
    // (which the pipeline refuses, D199), reads as off rather than as a request the next Generate would fail on.
    const storedDither = (DITHER_MODES as readonly string[]).includes(parsed.ditherMode as string)
      ? (parsed.ditherMode as DitherMode)
      : DEFAULT_OPTIONS.ditherMode;
    return {
      aidaCount: typeof parsed.aidaCount === "number" && parsed.aidaCount > 0 ? parsed.aidaCount : DEFAULT_OPTIONS.aidaCount,
      sizeUnit: parsed.sizeUnit === "in" || parsed.sizeUnit === "cm" ? parsed.sizeUnit : DEFAULT_OPTIONS.sizeUnit,
      authorName: typeof parsed.authorName === "string" ? parsed.authorName : DEFAULT_OPTIONS.authorName,
      edgeMode,
      exportCellMm: normalCellMm(parsed.exportCellMm) ?? DEFAULT_OPTIONS.exportCellMm,
      overlapCells: VALID_OVERLAP_CELLS.includes(parsed.overlapCells as OverlapCells)
        ? (parsed.overlapCells as OverlapCells)
        : DEFAULT_OPTIONS.overlapCells,
      canvasColor:
        typeof parsed.canvasColor === "string" && HEX_COLOR_PATTERN.test(parsed.canvasColor)
          ? parsed.canvasColor
          : DEFAULT_OPTIONS.canvasColor,
      stitchTexture: isStitchTextureId(parsed.stitchTexture) ? parsed.stitchTexture : DEFAULT_OPTIONS.stitchTexture,
      canvasTexture: isCanvasTextureChoice(parsed.canvasTexture) ? parsed.canvasTexture : DEFAULT_OPTIONS.canvasTexture,
      exportCanvas: typeof parsed.exportCanvas === "boolean" ? parsed.exportCanvas : DEFAULT_OPTIONS.exportCanvas,
      sizePreset: VALID_SIZE_PRESETS.includes(parsed.sizePreset as SizePresetId)
        ? (parsed.sizePreset as SizePresetId)
        : DEFAULT_OPTIONS.sizePreset,
      customSize:
        typeof parsed.customSize === "number" &&
        Number.isInteger(parsed.customSize) &&
        parsed.customSize >= MIN_STITCHES &&
        parsed.customSize <= MAX_STITCHES
          ? parsed.customSize
          : DEFAULT_OPTIONS.customSize,
      colorCount:
        typeof parsed.colorCount === "number" &&
        Number.isInteger(parsed.colorCount) &&
        parsed.colorCount >= MIN_COLORS &&
        parsed.colorCount <= MAX_COLORS
          ? parsed.colorCount
          : DEFAULT_OPTIONS.colorCount,
      generationMode: parsed.generationMode === "original" ? "original" : DEFAULT_OPTIONS.generationMode,
      // Validated against the live brand registry, not a hardcoded "dmc", so a new brand needs no change here.
      paletteMode:
        parsed.paletteMode === "full" || (THREAD_BRAND_IDS as string[]).includes(parsed.paletteMode as string)
          ? (parsed.paletteMode as PaletteMode)
          : DEFAULT_OPTIONS.paletteMode,
      // Absent before G-074, and every field of it is clamped, so a hand-edited or corrupt value reads as neutral
      // rather than as an adjustment no slider could have asked for.
      photoAdjust: readAdjust(parsed.photoAdjust),
      ditherMode: isDithered(storedDither) && edgeMode !== "standard" ? "off" : storedDither,
      // A stored texture that is out of range reads as the default rather than as a request Generate would refuse.
      ditherTexture: isValidDitherTexture(parsed.ditherTexture) ? parsed.ditherTexture : DEFAULT_DITHER_TEXTURE,
      // Absent in options stored before G-061, so anything that is not a boolean falls back to off.
      vivid: typeof parsed.vivid === "boolean" ? parsed.vivid : DEFAULT_OPTIONS.vivid,
      // Absent in options stored before G-084; a value outside 0 to 1 reads as the default.
      backstitchLines: typeof parsed.backstitchLines === "boolean" ? parsed.backstitchLines : DEFAULT_OPTIONS.backstitchLines,
      // Absent in options stored before G-085; a value outside 0 to 1 reads as the default.
      textureStrokes: typeof parsed.textureStrokes === "boolean" ? parsed.textureStrokes : DEFAULT_OPTIONS.textureStrokes,
      textureDensity:
        typeof parsed.textureDensity === "number" && parsed.textureDensity >= 0 && parsed.textureDensity <= 1
          ? Math.round(parsed.textureDensity * 10) / 10
          : DEFAULT_OPTIONS.textureDensity,
      backstitchPhotos: typeof parsed.backstitchPhotos === "boolean" ? parsed.backstitchPhotos : DEFAULT_OPTIONS.backstitchPhotos,
      backstitchSensitivity:
        typeof parsed.backstitchSensitivity === "number" && parsed.backstitchSensitivity >= 0 && parsed.backstitchSensitivity <= 1
          ? Math.round(parsed.backstitchSensitivity * 10) / 10
          : DEFAULT_OPTIONS.backstitchSensitivity,
      // A size the pane no longer offers, or one stored before G-064, reads as the default rather than as a
      // stamp nothing can draw.
      brushSize: (BRUSH_SIZES as readonly number[]).includes(parsed.brushSize as number)
        ? (parsed.brushSize as BrushSize)
        : DEFAULT_OPTIONS.brushSize,
      brushShape: parsed.brushShape === "square" || parsed.brushShape === "round" ? parsed.brushShape : DEFAULT_OPTIONS.brushShape,
      shapeFill: parsed.shapeFill === "filled" || parsed.shapeFill === "outline" ? parsed.shapeFill : DEFAULT_OPTIONS.shapeFill,
      stitchKind: isStitchKind(parsed.stitchKind) ? parsed.stitchKind : DEFAULT_OPTIONS.stitchKind,
      // Absent in options stored before G-041, so anything that is not a boolean falls back to the default.
      doubleClickFill: typeof parsed.doubleClickFill === "boolean" ? parsed.doubleClickFill : DEFAULT_OPTIONS.doubleClickFill,
      lockTransparency: typeof parsed.lockTransparency === "boolean" ? parsed.lockTransparency : DEFAULT_OPTIONS.lockTransparency,
      textFamily: shortName(parsed.textFamily, DEFAULT_OPTIONS.textFamily),
      textStyle: shortName(parsed.textStyle, DEFAULT_OPTIONS.textStyle),
      textSize:
        typeof parsed.textSize === "number" && Number.isInteger(parsed.textSize) && parsed.textSize >= 7 && parsed.textSize <= 200
          ? parsed.textSize
          : DEFAULT_OPTIONS.textSize,
      textWeight:
        typeof parsed.textWeight === "number" && parsed.textWeight >= 0 && parsed.textWeight <= 100
          ? parsed.textWeight
          : DEFAULT_OPTIONS.textWeight,
    };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

export function saveWorkspaceOptions(options: WorkspaceOptions): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // Best-effort -- losing a persisted preference isn't worth surfacing an error for.
  }
}

/** The pre-D100 localStorage project slot, read once by `restoreProject` to migrate an earlier build's autosave into IndexedDB. Never written to. */
export const legacyProjectSlot: LegacyProjectSlot = {
  read() {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(LEGACY_PROJECT_KEY);
    } catch {
      return null;
    }
  },
  clear() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(LEGACY_PROJECT_KEY);
    } catch {
      // Best-effort, matching every other write in this module.
    }
  },
};
