/**
 * The account's Charts as the design draws them (G-108 part 1 M8, D358): the order, the search, and the words on each
 * card. Pure, so it is tested without a browser.
 */

/** One saved chart as the list shows it. */
export interface SavedChartCard {
  id: string;
  name: string;
  bytes: number;
  width: number;
  height: number;
  colors: number;
  /** The thread brand's name ("DMC"), or "Full range" for a mix or custom colours. */
  palette: string;
  pinned: boolean;
  version: number;
  savedAt: string;
}

export type ChartOrder = "recent" | "name" | "size";

export const CHART_ORDERS: readonly { id: ChartOrder; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "name", label: "Name" },
  { id: "size", label: "Size" },
];

export const FULL_RANGE = "Full range";

/**
 * The charts whose name holds every word searched for, in the order chosen; pinned charts first in every order. Recent is
 * newest first, Name A to Z, Size largest first.
 */
export function chartsShown(charts: readonly SavedChartCard[], query: string, order: ChartOrder): SavedChartCard[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const byOrder: Record<ChartOrder, (a: SavedChartCard, b: SavedChartCard) => number> = {
    recent: (a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt),
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }),
    size: (a, b) => b.bytes - a.bytes,
  };
  return charts
    .filter((chart) => {
      const name = chart.name.toLocaleLowerCase();
      return words.every((word) => name.includes(word));
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || byOrder[order](a, b) || a.id.localeCompare(b.id));
}

/** "180 × 135 · 32 colours · DMC". */
export function chartFacts(chart: Pick<SavedChartCard, "width" | "height" | "colors" | "palette">): string {
  return `${chart.width} × ${chart.height} · ${chart.colors} ${chart.colors === 1 ? "colour" : "colours"} · ${chart.palette}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** When a chart was saved, as the design says it: "Just now", "5 min ago", "2 h ago", "Yesterday", "3 Oct", "3 Oct 2025". */
export function savedWhen(savedAt: string, now: number, locale?: string): string {
  const then = new Date(savedAt);
  const ago = now - then.getTime();
  if (ago < MINUTE) return "Just now";
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)} min ago`;
  const today = new Date(now);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(then, today)) return `${Math.floor(ago / HOUR)} h ago`;
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(then, yesterday)) return "Yesterday";
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (then.getFullYear() !== today.getFullYear()) options.year = "numeric";
  return then.toLocaleDateString(locale, options);
}

/** "12 charts", "1 chart". */
export function chartCount(count: number): string {
  return `${count} ${count === 1 ? "chart" : "charts"}`;
}
