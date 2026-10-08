import { parsePatternDocument } from "@/lib/editor/pattern-serialize";
import type { StitchPattern } from "@/lib/types";
import { BYTES_PER_MB, formatLimit, limitById, limitBytes, type LimitValue } from "@/lib/limits/limits";

/**
 * Charts saved to an account (G-108 part 1, D354): the rules the routes under `/api/charts` apply, kept pure so they are
 * tested without a database. A saved chart is the editable file, photo included, stored whole; its id is the server's,
 * never its name, so a renamed chart saved again is the same chart.
 */

/** The feature that saving to an account is (G-102): a server refusal names it as the interface does. */
export const SAVE_TO_ACCOUNT_FEATURE = "charts.account";

/** The limit the space for saved charts is (D353). */
export const CHART_STORAGE_LIMIT = "storage.charts";

/**
 * The largest chart one save may send: under the vhost's 40 MB body cap, and above the largest chart with the largest
 * photo the editor keeps (a 25 MB original as base64 is 33.4 MB). See D354.
 */
export const SAVED_CHART_MAX_BYTES = 38 * BYTES_PER_MB;

/** The longest name kept; a longer one is cut. */
export const SAVED_CHART_NAME_MAX = 100;

export const UNTITLED_CHART = "Untitled chart";

/** A chart's name as kept: whitespace runs as one space, trimmed, cut to the longest, never empty. */
export function savedChartName(name: unknown): string {
  const text = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  return text === "" ? UNTITLED_CHART : [...text].slice(0, SAVED_CHART_NAME_MAX).join("");
}

/** What the list shows of a chart without reading it whole. */
export interface SavedChartSummary {
  name: string;
  width: number;
  height: number;
  colors: number;
}

/**
 * Reads a chart sent to be saved with the reader the editor opens files with, so nothing is kept that the editor could not
 * open again. Answers the chart, for drawing its preview, and what the list shows of it; or the refusal.
 */
export function readChartUpload(text: string): { pattern: StitchPattern; summary: SavedChartSummary } | { error: string } {
  try {
    const { pattern } = parsePatternDocument(text);
    return {
      pattern,
      summary: { name: savedChartName(pattern.name), width: pattern.width, height: pattern.height, colors: pattern.palette.length },
    };
  } catch {
    return { error: "That is not a chart this editor can open, so it was not saved." };
  }
}

/** The bytes a stored chart counts for: its file as sent, in UTF-8. */
export function chartBytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/**
 * Whether a save fits the person's space: what they keep now, less the chart being overwritten, plus the one being sent.
 * The refusal names the limit and what to do.
 */
export function storageRefusal(used: number, replacing: number, adding: number, allowed: LimitValue): string | null {
  const after = used - replacing + adding;
  if (after <= limitBytes(allowed)) return null;
  const limit = limitById(CHART_STORAGE_LIMIT)!;
  return `Saving this would use ${formatMegabytes(after)} of your ${formatLimit(limit, allowed)} for saved charts. Delete a saved chart, or save to a file instead.`;
}

/** "12.3 MB", to one decimal under 100 MB; "0.1 MB" at the least for anything kept. */
export function formatMegabytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / BYTES_PER_MB;
  return `${mb >= 100 ? Math.round(mb) : Math.max(0.1, Math.round(mb * 10) / 10)} MB`;
}

/** The space saved charts use, against what the person is allowed: "1.2 MB of 50 MB", "0 MB of Unlimited". */
export function chartSpace(used: number, allowed: LimitValue): string {
  return `${formatMegabytes(used)} of ${formatLimit(limitById(CHART_STORAGE_LIMIT)!, allowed)}`;
}

/** The version a browser says it last saved or opened, from the request; null when it sent none or a malformed one. */
export function parseVersion(value: string | null): number | null {
  if (value === null || !/^\d{1,9}$/.test(value)) return null;
  const version = Number(value);
  return version >= 1 ? version : null;
}

/** The refusal of an overwrite when the chart was saved again since the browser's version (Owner, 2026-10-06). */
export const CONFLICT_MESSAGE = "This chart was saved from somewhere else since you opened it.";
