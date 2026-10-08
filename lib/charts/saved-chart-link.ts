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

/** A saved chart's id as the server makes them (a cuid); anything else is never sent to it. */
const ID = /^[a-z0-9]{1,64}$/;

/** A link read back from storage, or undefined when there is none or it is not one. */
export function readSavedChartLink(value: unknown): SavedChartLink | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { id, version, savedAt } = value as Record<string, unknown>;
  if (typeof id !== "string" || !ID.test(id)) return undefined;
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

/** The address parameter the account's Charts open a saved chart with: `/?chart=<id>`. */
export const OPEN_CHART_PARAM = "chart";

/** The editor's address for opening a saved chart. */
export function openChartHref(id: string): string {
  return `/?${OPEN_CHART_PARAM}=${encodeURIComponent(id)}`;
}

/** The saved chart an address asks the editor to open, or null when it names none, or not one. */
export function chartToOpen(search: string): string | null {
  const id = new URLSearchParams(search).get(OPEN_CHART_PARAM);
  return id !== null && ID.test(id) ? id : null;
}

/** The address parameter that opens the editor at its start screen: the account's New chart (G-108 part 1 M8). */
export const NEW_CHART_PARAM = "new";

/** The editor's address for starting a new chart; choosing a card there is what replaces the open chart, after asking. */
export const NEW_CHART_HREF = `/?${NEW_CHART_PARAM}`;

export type OpenOutcome = { kind: "opened"; link: SavedChartLink; name: string } | { kind: "refused"; message: string };

/** What the server's answer to reading a saved chart means; `header` reads one of the response's headers. */
export function openOutcome(status: number, header: (name: string) => string | null, id: string): OpenOutcome {
  if (status === 401) return { kind: "refused", message: "Sign in to open the charts saved to your account." };
  if (status === 404) return { kind: "refused", message: "That chart is no longer among your saved charts." };
  if (status !== 200) return { kind: "refused", message: "Couldn't open that chart. Try again in a moment." };
  const link = readSavedChartLink({ id, version: Number(header("x-chart-version")), savedAt: header("x-chart-saved-at") });
  if (!link) return { kind: "refused", message: "Couldn't open that chart. Try again in a moment." };
  const name = header("x-chart-name");
  return { kind: "opened", link, name: name ? decodeURIComponent(name) : "" };
}

/** A saved chart's preview, at a version: a new save asks for a new picture, an unchanged one is served from the cache. */
export function previewHref(id: string, version: number): string {
  return `/api/charts/${encodeURIComponent(id)}/preview?v=${version}`;
}

/** "8 Oct 2026, 14:05", for saying when the chart was saved elsewhere. */
export function formatSavedAt(savedAt: string, locale?: string): string {
  return new Date(savedAt).toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
