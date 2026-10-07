import { prisma } from "@/lib/prisma";
import { usageWindowStarts } from "@/lib/admin/usage-windows";
import { dailyUsage, exportsByKind, type ExportKindRow, type UsageDay } from "./usage";

export interface PersonUsage {
  days: UsageDay[];
  generations: { recent: number; allTime: number };
  exports: { recent: number; allTime: number };
  byKind: ExportKindRow[];
}

/** One person's usage for the Usage section (G-107 M2): the last 30 UTC days, and all time. */
export async function personUsage(userId: string, now: Date = new Date()): Promise<PersonUsage> {
  const since = usageWindowStarts(now).thirtyDays;
  const [recentEvents, totals, recentKinds, allKinds] = await Promise.all([
    prisma.usageEvent.findMany({ where: { userId, createdAt: { gte: since } }, select: { kind: true, createdAt: true } }),
    prisma.usageEvent.groupBy({ by: ["kind"], where: { userId }, _count: { _all: true } }),
    prisma.usageEvent.groupBy({
      by: ["exportKind"],
      where: { userId, kind: "EXPORT", createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.usageEvent.groupBy({ by: ["exportKind"], where: { userId, kind: "EXPORT" }, _count: { _all: true } }),
  ]);
  const days = dailyUsage(recentEvents, now);
  const total = (kind: "GENERATE" | "EXPORT") => totals.find((t) => t.kind === kind)?._count._all ?? 0;
  const counts = (rows: typeof allKinds) => rows.map((r) => ({ exportKind: r.exportKind, count: r._count._all }));
  return {
    days,
    generations: { recent: days.reduce((n, d) => n + d.generations, 0), allTime: total("GENERATE") },
    exports: { recent: days.reduce((n, d) => n + d.exports, 0), allTime: total("EXPORT") },
    byKind: exportsByKind(counts(recentKinds), counts(allKinds)),
  };
}
