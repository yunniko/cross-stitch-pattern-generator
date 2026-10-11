import { EXPORT_KIND_GROUPS, exportChoiceFeature, exportKindFeature } from "../export/export-kinds";
import type { ExportJobKind } from "../export/export-request";
import { usageWindowStarts } from "../admin/usage-windows";

/**
 * A person's own usage (G-107 M2): what the Usage section draws, from their usage events. Pure, so the day boundaries and
 * the grouping are tested without a database; `usage-data.ts` reads the events. UTC days, as the admin's windows are.
 */

const DAY_MS = 86_400_000;

export interface UsageDay {
  /** UTC midnight of the day. */
  day: Date;
  generations: number;
  exports: number;
}

/**
 * The last `days` UTC days, today last, each with its generations and exports; a day with none is there with zeros. An
 * event stands for `count` of its kind (1 if not given), so counts already summed per day add the same way.
 */
export function dailyUsage(
  events: readonly { kind: "GENERATE" | "EXPORT"; createdAt: Date; count?: number }[],
  now: Date,
  days = 30
): UsageDay[] {
  const today = usageWindowStarts(now).today.getTime();
  const first = today - (days - 1) * DAY_MS;
  const series: UsageDay[] = Array.from({ length: days }, (_, i) => ({ day: new Date(first + i * DAY_MS), generations: 0, exports: 0 }));
  for (const event of events) {
    const index = Math.floor((event.createdAt.getTime() - first) / DAY_MS);
    if (index < 0 || index >= days) continue;
    const count = event.count ?? 1;
    if (event.kind === "GENERATE") series[index].generations += count;
    else series[index].exports += count;
  }
  return series;
}

/** Each day's two bars as shares of the busiest day's total, in percent; all zero when nothing was asked for. */
export function barShares(series: readonly UsageDay[]): { generations: number; exports: number }[] {
  const most = Math.max(0, ...series.map((d) => d.generations + d.exports));
  return series.map((d) =>
    most === 0 ? { generations: 0, exports: 0 } : { generations: (d.generations / most) * 100, exports: (d.exports / most) * 100 }
  );
}

/** The label of each export feature, from the Export workspace's own list. */
const FEATURE_LABELS: Record<string, string> = Object.fromEntries([
  ...EXPORT_KIND_GROUPS.flatMap(({ kinds }) => kinds.map((kind) => [exportKindFeature(kind), kind.label])),
  ["export.all", "Export all (ZIP)"],
]);

/** What an export is called where it was chosen; its colour and black-and-white forms are one row. */
export function exportKindLabel(kind: string | null): string {
  if (kind === null) return NOT_RECORDED;
  return FEATURE_LABELS[exportChoiceFeature(kind as ExportJobKind)] ?? kind;
}

/** The row for exports made before the kind was kept. */
export const NOT_RECORDED = "Kind not recorded (before 7 Oct 2026)";

export interface ExportKindRow {
  label: string;
  recent: number;
  allTime: number;
}

/**
 * Exports by kind: counts per stored kind, in the last window and all time, merged by label and ordered by all-time count.
 * The row for unrecorded kinds goes last whatever its count.
 */
export function exportsByKind(
  recent: readonly { exportKind: string | null; count: number }[],
  allTime: readonly { exportKind: string | null; count: number }[]
): ExportKindRow[] {
  const rows = new Map<string, ExportKindRow>();
  const row = (kind: string | null) => {
    const label = exportKindLabel(kind);
    let found = rows.get(label);
    if (!found) rows.set(label, (found = { label, recent: 0, allTime: 0 }));
    return found;
  };
  for (const { exportKind, count } of recent) row(exportKind).recent += count;
  for (const { exportKind, count } of allTime) row(exportKind).allTime += count;
  return [...rows.values()].sort(
    (a, b) => Number(a.label === NOT_RECORDED) - Number(b.label === NOT_RECORDED) || b.allTime - a.allTime || a.label.localeCompare(b.label)
  );
}

/** Exports by kind in one window (the admin's Overview): each row's count and its width against the largest, in percent. */
export function exportMix(
  rows: readonly { exportKind: string | null; count: number }[]
): { label: string; count: number; share: number }[] {
  const merged = exportsByKind([], rows);
  const most = Math.max(0, ...merged.map((row) => row.allTime));
  return merged.map((row) => ({ label: row.label, count: row.allTime, share: most === 0 ? 0 : (row.allTime / most) * 100 }));
}
