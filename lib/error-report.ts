/**
 * Pattern-load error reporting (Owner request, 2026-09-12: "If while working
 * on a scheme there is a loading error ... log the error, save the
 * problematic file version to [an] error report folder and try to load
 * previous version (undo)").
 *
 * This app is entirely client-side with no server filesystem -- there is no
 * literal "folder" to write into. The closest real equivalent is triggering
 * a browser download of the exact content that failed to load, landing in
 * the user's own Downloads folder, alongside a console.error with the same
 * detail. "Try to load previous version" is satisfied by the callers of
 * this module never overwriting the current in-memory pattern until a load
 * has actually succeeded -- see `loadSavedProject` (lib/workspace-storage.ts)
 * and `handleOpenFile` (app/workspace.tsx).
 */

export type PatternLoadSource = "open-file" | "auto-restore";

export interface PatternLoadFailure {
  source: PatternLoadSource;
  error: unknown;
  /** The exact bytes/text that failed to load. */
  content: Blob | string;
  /** The original file name, when there was a real file (absent for `"auto-restore"` -- that content came from localStorage, not a file). */
  originalFileName?: string;
}

/** Builds the downloaded report's filename: `<original-base>_error-report_<timestamp><ext>`, or a generic `autosave_error-report_<timestamp>.json` when there's no original file name (the auto-restore path). */
export function deriveErrorReportFilename(originalFileName: string | undefined, timestamp: string): string {
  const safeStamp = timestamp.replace(/[:.]/g, "-");
  if (!originalFileName) return `autosave_error-report_${safeStamp}.json`;
  const extMatch = originalFileName.match(/\.[^./\\]+$/);
  const ext = extMatch ? extMatch[0] : "";
  const base = ext ? originalFileName.slice(0, -ext.length) : originalFileName;
  return `${base}_error-report_${safeStamp}${ext || ".txt"}`;
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

/**
 * Logs a pattern-load failure to the console and, when a DOM is available,
 * downloads the exact content that failed to load. In environments with no
 * `document` (unit tests, SSR) only the console.error happens -- there is
 * nowhere to download to, and nothing else in this module depends on the
 * download succeeding.
 */
export function reportPatternLoadFailure({ source, error, content, originalFileName }: PatternLoadFailure): void {
  const timestamp = new Date().toISOString();
  console.error(`[cross-stitch-pattern-generator] Pattern load failed (source: ${source}) at ${timestamp}:`, errorDetail(error));

  if (typeof document === "undefined") return;

  const blob = content instanceof Blob ? content : new Blob([content], { type: "text/plain" });
  const filename = deriveErrorReportFilename(originalFileName, timestamp);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
