import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT, type SizeUnit } from "./finished-size";
import { deserializePattern, serializePattern } from "./pattern-serialize";
import type { StitchPattern } from "./types";

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
}

const DEFAULT_OPTIONS: WorkspaceOptions = {
  aidaCount: DEFAULT_AIDA_COUNT,
  sizeUnit: DEFAULT_SIZE_UNIT,
  authorName: "",
};

/** Reads persisted fabric count / unit / author name -- falls back to defaults on first visit or any corrupt/missing data. */
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
