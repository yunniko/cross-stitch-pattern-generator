/**
 * Pattern-load error reporting (Owner request, 2026-09-12: "If while working
 * on a scheme there is a loading error ... log the error, save the
 * problematic file version to [an] error report folder and try to load
 * previous version (undo)").
 *
 * This app is entirely client-side with no server filesystem -- the closest
 * real equivalent of an "error report folder" is a browser download of the
 * exact content that failed to load, alongside a console.error with the
 * same detail. "Try to load previous version" is satisfied by callers never
 * overwriting the current in-memory pattern until a load has succeeded.
 *
 * The download is a separate step from the log so the auto-restore path can
 * log immediately but only download on a click (a page-load download with
 * no user gesture is commonly blocked, and startling when it isn't -- D099).
 */

export type PatternLoadSource = "open-file" | "auto-restore";

export interface PatternLoadFailure {
  source: PatternLoadSource;
  error: unknown;
  /** The exact bytes/text that failed to load. */
  content: Blob | string;
  /** The original file name, when there was a real file (absent for `"auto-restore"`, whose content came from the autosave store, not a file). */
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

/** Console-logs a pattern-load failure. Returns the timestamp used, so a later download can carry the same one. */
export function logPatternLoadFailure({ source, error }: Pick<PatternLoadFailure, "source" | "error">): string {
  const timestamp = new Date().toISOString();
  console.error(`[cross-stitch-pattern-generator] Pattern load failed (source: ${source}) at ${timestamp}:`, errorDetail(error));
  return timestamp;
}

/** Downloads the exact content that failed to load. No-op where there's no `document` (unit tests, SSR). */
export function downloadPatternLoadReport({ content, originalFileName }: Pick<PatternLoadFailure, "content" | "originalFileName">, timestamp = new Date().toISOString()): void {
  if (typeof document === "undefined") return;
  const blob = content instanceof Blob ? content : new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = deriveErrorReportFilename(originalFileName, timestamp);
  link.click();
  URL.revokeObjectURL(url);
}

/** Log + immediate download -- for failures that follow a user gesture (opening a file), where a download is expected. */
export function reportPatternLoadFailure(failure: PatternLoadFailure): void {
  const timestamp = logPatternLoadFailure(failure);
  downloadPatternLoadReport(failure, timestamp);
}
