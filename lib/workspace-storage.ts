import type { OverlapCells } from "./a4-layout";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT, type SizeUnit } from "./finished-size";
import { deserializePattern, serializePattern } from "./pattern-serialize";
import type { EdgeMode, GenerationMode, PaletteMode } from "./pattern.worker";
import { MAX_COLORS, MAX_STITCHES, MIN_COLORS, MIN_STITCHES, type SizePresetId, type StitchPattern } from "./types";

// Workspace-level preferences and the in-progress project, persisted to
// localStorage (G-015, Owner request 2026-09-10) so a page reload doesn't
// lose either. Both are per-browser, best-effort: every read/write is
// wrapped so a disabled/full/unavailable localStorage (private browsing,
// SSR, quota exceeded by a large embedded source photo) degrades to
// "nothing persists" rather than throwing and breaking the edit that
// triggered it.
// Exported so tests can seed/inspect the underlying storage entries directly
// without duplicating these literals.
export const OPTIONS_KEY = "cross-stitch-pattern-generator:options:v1";
export const PROJECT_KEY = "cross-stitch-pattern-generator:project:v1";

export interface WorkspaceOptions {
  aidaCount: number;
  sizeUnit: SizeUnit;
  authorName: string;
  /**
   * The Standard/Crisp choice for the *next* Generate/Regenerate (G-024
   * M5) -- unlike `dmcMode`/`edgeMode` on a `StitchPattern` itself
   * (which record how an already-generated pattern was built), this is
   * just a remembered UI preference so a reloaded session starts with
   * the Owner's last choice instead of always resetting to Standard.
   * Missing/corrupt/legacy (every workspace saved before this field
   * existed) defaults to `"standard"`.
   */
  edgeMode: EdgeMode;
  /**
   * The A4 export overlap-cells choice (Owner request, 2026-09-12: moved
   * here from an inline control next to the old per-mode A4 export
   * buttons, now that every export lives behind one dropdown with no
   * room for its own inline settings). Missing/corrupt/legacy defaults
   * to `5`, the same default `calculateA4Layout` itself already uses.
   */
  overlapCells: OverlapCells;
  /**
   * The on-screen canvas background color (Owner request, 2026-09-12):
   * shown behind empty (no-stitch) cells in the live Color/B&W chart view
   * and as a backdrop behind the realistic preview's own transparent PNG.
   * Purely a display preference -- never threaded into any export path,
   * which always renders empty cells on white and the realistic preview on
   * a transparent background regardless of this setting. Missing/corrupt
   * defaults to white, matching every export's own existing default.
   */
  canvasColor: string;
  /**
   * Generate/Regenerate settings (Owner request, 2026-09-12: "remember
   * regeneration modes, pattern size and color count on page reload") --
   * unlike `edgeMode` above, these have no per-pattern equivalent (nothing
   * on a `StitchPattern` itself records "this was generated as Large,
   * 24 colors, Latest/Full range"), so the *only* place they can survive a
   * reload is here, exactly like `aidaCount`/`sizeUnit` already do.
   */
  sizePreset: SizePresetId;
  /** Only meaningful when `sizePreset` is `"custom"` -- kept even when a named preset is selected, so switching back to Custom later restores the Owner's last custom value instead of resetting to the default. */
  customSize: number;
  colorCount: number;
  generationMode: GenerationMode;
  paletteMode: PaletteMode;
}

const DEFAULT_OPTIONS: WorkspaceOptions = {
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
};

const VALID_OVERLAP_CELLS: readonly OverlapCells[] = [0, 5, 10];
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const VALID_SIZE_PRESETS: readonly SizePresetId[] = ["small", "medium", "large", "xl", "xxl", "custom"];

/** Reads persisted fabric count / unit / author name / edge mode / overlap -- falls back to defaults on first visit or any corrupt/missing data. */
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
      edgeMode: parsed.edgeMode === "crisp" ? "crisp" : DEFAULT_OPTIONS.edgeMode,
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
      paletteMode: parsed.paletteMode === "dmc" ? "dmc" : DEFAULT_OPTIONS.paletteMode,
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

/** The most recently open project. Returns null (never throws) when there's nothing saved or it fails to parse -- callers treat that as "start fresh," the same as a first visit. */
export function loadSavedProject(): StitchPattern | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROJECT_KEY);
    if (!raw) return null;
    return deserializePattern(raw);
  } catch {
    return null;
  }
}

/**
 * Auto-saves the current project, or clears the saved slot when `pattern`
 * is null. Best-effort: a pattern with a large embedded source photo can
 * exceed localStorage's quota (typically 5-10MB/origin) -- that failure is
 * swallowed rather than surfaced, matching how this app already treats a
 * failed source-photo re-decode on open as non-fatal (app/workspace.tsx).
 */
export function saveProject(pattern: StitchPattern | null): void {
  if (typeof window === "undefined") return;
  try {
    if (pattern) window.localStorage.setItem(PROJECT_KEY, serializePattern(pattern));
    else window.localStorage.removeItem(PROJECT_KEY);
  } catch {
    // Best-effort, see above.
  }
}
