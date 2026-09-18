import type { OverlapCells } from "../export/a4-layout";
import type { LegacyProjectSlot } from "./project-store";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT, type SizeUnit } from "../export/finished-size";
import { isReleasedEnhancementMode, type EnhancementModeId } from "../pipeline/enhance";
import type { EdgeMode, GenerationMode, PaletteMode } from "../pipeline/pattern";
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
  /** On-screen canvas background behind empty cells and the realistic preview. Display only, never threaded into any export. */
  canvasColor: string;
  /** Generate settings remembered across reloads (Owner request, 2026-09-12); nothing on a `StitchPattern` records these. */
  sizePreset: SizePresetId;
  /** Kept even when a named preset is selected, so switching back to Custom restores the last custom value. */
  customSize: number;
  colorCount: number;
  generationMode: GenerationMode;
  paletteMode: PaletteMode;
  /** Photo enhancement for the next Generate. Only released modes survive a reload (D113). */
  enhancementMode: EnhancementModeId;
  /** Whether a Brush double-click floods the region under it as one undo step (D138); off leaves the two clicks as themselves. */
  doubleClickFill: boolean;
}

export const DEFAULT_OPTIONS: WorkspaceOptions = {
  aidaCount: DEFAULT_AIDA_COUNT,
  sizeUnit: DEFAULT_SIZE_UNIT,
  authorName: "",
  edgeMode: "standard",
  overlapCells: 5,
  canvasColor: "#ffffff",
  sizePreset: "medium",
  customSize: 100,
  colorCount: 16,
  generationMode: "latest",
  paletteMode: "full",
  enhancementMode: "off",
  doubleClickFill: true,
};

/** The overlaps the A4 layout can actually paginate with; shared so the processor validates against the same list. */
export const VALID_OVERLAP_CELLS: readonly OverlapCells[] = [0, 5, 10];
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const VALID_SIZE_PRESETS: readonly SizePresetId[] = ["small", "medium", "large", "xl", "xxl", "custom"];

/** Reads persisted options, falling back to defaults on first visit or any corrupt/missing data, field by field. */
export function loadWorkspaceOptions(): WorkspaceOptions {
  if (typeof window === "undefined") return DEFAULT_OPTIONS;
  try {
    const raw = window.localStorage.getItem(OPTIONS_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    const parsed = JSON.parse(raw) as Partial<WorkspaceOptions>;
    return {
      aidaCount: typeof parsed.aidaCount === "number" && parsed.aidaCount > 0 ? parsed.aidaCount : DEFAULT_OPTIONS.aidaCount,
      sizeUnit: parsed.sizeUnit === "in" || parsed.sizeUnit === "cm" ? parsed.sizeUnit : DEFAULT_OPTIONS.sizeUnit,
      authorName: typeof parsed.authorName === "string" ? parsed.authorName : DEFAULT_OPTIONS.authorName,
      edgeMode: parsed.edgeMode === "crisp" || parsed.edgeMode === "crisp-plus" ? parsed.edgeMode : DEFAULT_OPTIONS.edgeMode,
      overlapCells: VALID_OVERLAP_CELLS.includes(parsed.overlapCells as OverlapCells) ? (parsed.overlapCells as OverlapCells) : DEFAULT_OPTIONS.overlapCells,
      canvasColor: typeof parsed.canvasColor === "string" && HEX_COLOR_PATTERN.test(parsed.canvasColor) ? parsed.canvasColor : DEFAULT_OPTIONS.canvasColor,
      sizePreset: VALID_SIZE_PRESETS.includes(parsed.sizePreset as SizePresetId) ? (parsed.sizePreset as SizePresetId) : DEFAULT_OPTIONS.sizePreset,
      customSize:
        typeof parsed.customSize === "number" && Number.isInteger(parsed.customSize) && parsed.customSize >= MIN_STITCHES && parsed.customSize <= MAX_STITCHES
          ? parsed.customSize
          : DEFAULT_OPTIONS.customSize,
      colorCount:
        typeof parsed.colorCount === "number" && Number.isInteger(parsed.colorCount) && parsed.colorCount >= MIN_COLORS && parsed.colorCount <= MAX_COLORS
          ? parsed.colorCount
          : DEFAULT_OPTIONS.colorCount,
      generationMode: parsed.generationMode === "original" ? "original" : DEFAULT_OPTIONS.generationMode,
      // Validated against the live brand registry, not a hardcoded "dmc", so a new brand needs no change here.
      paletteMode:
        parsed.paletteMode === "full" || (THREAD_BRAND_IDS as string[]).includes(parsed.paletteMode as string)
          ? (parsed.paletteMode as PaletteMode)
          : DEFAULT_OPTIONS.paletteMode,
      enhancementMode: isReleasedEnhancementMode(parsed.enhancementMode) ? parsed.enhancementMode : DEFAULT_OPTIONS.enhancementMode,
      // Absent in options stored before G-041, so anything that is not a boolean falls back to the default.
      doubleClickFill: typeof parsed.doubleClickFill === "boolean" ? parsed.doubleClickFill : DEFAULT_OPTIONS.doubleClickFill,
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
