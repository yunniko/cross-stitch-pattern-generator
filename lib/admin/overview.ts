import { usageWindowStarts } from "./usage-windows";

/**
 * The admin Overview's range switch and its comparisons (G-107 M3). Pure, so the window edges are tested without a
 * database. UTC days, as the stats windows are: "7 days" is today and the six before it, compared with the seven before
 * those; "Today" so far is compared with the whole of yesterday.
 */

const DAY_MS = 86_400_000;

export const RANGES = [
  { id: "today", label: "Today", days: 1 },
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "all", label: "All time", days: null },
] as const;

export type RangeId = (typeof RANGES)[number]["id"];

/** The range a `?range=` asks for; anything else is 30 days. */
export function parseRange(value: string | undefined): RangeId {
  return RANGES.find((range) => range.id === value)?.id ?? "30d";
}

export interface RangeWindow {
  /** From this instant on; null for all time. */
  from: Date | null;
  /** The period just before, of the same number of days, compared against; null for all time. */
  previous: { from: Date; to: Date } | null;
}

export function rangeWindow(range: RangeId, now: Date): RangeWindow {
  const days = RANGES.find((entry) => entry.id === range)!.days;
  if (days === null) return { from: null, previous: null };
  const today = usageWindowStarts(now).today.getTime();
  const from = today - (days - 1) * DAY_MS;
  return { from: new Date(from), previous: { from: new Date(from - days * DAY_MS), to: new Date(from) } };
}

/** The change from `previous` to `current` in whole percent; null when there was nothing before to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** What the comparison is against, as the figure's note says it. */
export function comparedWith(range: RangeId): string {
  return range === "today" ? "yesterday" : range === "7d" ? "the 7 days before" : "the 30 days before";
}

/** A figure's note: "+12% vs the 30 days before", "none before", or nothing for all time. */
export function changeNote(range: RangeId, current: number, previous: number | null): { text: string; trend: "up" | "down" | "flat" } {
  if (range === "all" || previous === null) return { text: "", trend: "flat" };
  const change = percentChange(current, previous);
  if (change === null) {
    const before = range === "today" ? "yesterday" : `in ${comparedWith(range)}`;
    return { text: current === 0 ? `none ${before} either` : `none ${before}`, trend: "flat" };
  }
  const sign = change > 0 ? "+" : change < 0 ? "−" : "±";
  return { text: `${sign}${Math.abs(change)}% vs ${comparedWith(range)}`, trend: change > 0 ? "up" : change < 0 ? "down" : "flat" };
}
