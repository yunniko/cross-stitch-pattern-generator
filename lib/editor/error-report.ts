/**
 * Pattern-load error reporting (Owner request, 2026-09-12). With no server filesystem, "save the failed version to an
 * error-report folder" means downloading the exact content that failed, next to a console.error with the same detail;
 * "load the previous version" means callers never replace the current pattern until a load succeeds. Logging and
 * downloading are separate so auto-restore can offer the download on a click instead of on page load (D101).
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
export function downloadPatternLoadReport(
  { content, originalFileName }: Pick<PatternLoadFailure, "content" | "originalFileName">,
  timestamp = new Date().toISOString()
): void {
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
