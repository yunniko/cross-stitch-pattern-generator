import { CONFLICT_MESSAGE } from "./saved-charts";

/**
 * The editor's side of a chart saved to an account (G-108 part 1, D354, D355): which saved chart the open one is, and
 * what the server's answer to a save means. Pure, so it is tested without a browser.
 */

/** The saved chart the open one is: Save overwrites it, at the version last saved or opened. */
export interface SavedChartLink {
  id: string;
  version: number;
  /** When it was last saved, as the server says it (ISO 8601). */
  savedAt: string;
}

/** A link read back from storage, or undefined when there is none or it is not one. */
export function readSavedChartLink(value: unknown): SavedChartLink | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { id, version, savedAt } = value as Record<string, unknown>;
  if (typeof id !== "string" || !/^[a-z0-9]{1,64}$/.test(id)) return undefined;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return undefined;
  if (typeof savedAt !== "string" || Number.isNaN(Date.parse(savedAt))) return undefined;
  return { id, version, savedAt };
}

/** How a save is sent: a new chart, or over the linked one at the version it names. */
export function saveRequest(link: SavedChartLink | null): { url: string; method: "POST" | "PUT"; headers: Record<string, string> } {
  const headers = { "content-type": "application/json" };
  if (!link) return { url: "/api/charts", method: "POST", headers };
  return {
    url: `/api/charts/${encodeURIComponent(link.id)}`,
    method: "PUT",
    headers: { ...headers, "x-chart-version": String(link.version) },
  };
}

export type SaveOutcome =
  /** Saved: the open chart is now this one. */
  | { kind: "saved"; link: SavedChartLink; name: string }
  /** Saved from somewhere else since: the person is asked whether to replace it or save a copy. */
  | { kind: "conflict"; message: string; version: number; savedAt: string }
  /** The linked chart is gone (deleted elsewhere, or another account's): a Save makes a new one. */
  | { kind: "gone"; message: string }
  /** Refused, with the sentence to show. */
  | { kind: "refused"; message: string };

const FALLBACK = "Couldn't save to your account. Try again, or save to a file instead.";
const GONE_MESSAGE = "That chart is no longer among your saved charts, so nothing was overwritten. Save again to keep this as a new one.";

/** What the server's answer to a save means; `body` is its JSON, or null when it sent none. */
export function saveOutcome(status: number, body: unknown): SaveOutcome {
  const data = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const message = typeof data.error === "string" && data.error !== "" ? data.error : FALLBACK;
  if (status === 200 || status === 201) {
    const link = readSavedChartLink(data);
    if (link && typeof data.name === "string") return { kind: "saved", link, name: data.name };
    return { kind: "refused", message: FALLBACK };
  }
  if (status === 409 && data.reason === "conflict" && typeof data.version === "number" && typeof data.savedAt === "string")
    return { kind: "conflict", message: CONFLICT_MESSAGE, version: data.version, savedAt: data.savedAt };
  if (status === 404) return { kind: "gone", message: GONE_MESSAGE };
  return { kind: "refused", message };
}

/** "8 Oct 2026, 14:05", for saying when the chart was saved elsewhere. */
export function formatSavedAt(savedAt: string, locale?: string): string {
  return new Date(savedAt).toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
