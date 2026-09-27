import { prisma } from "@/lib/prisma";
import { usageWindowStarts } from "@/lib/admin/usage-windows";

export type UsageKind = "GENERATE" | "EXPORT";

/**
 * Records one generation or export (G-075 M4), called from `app/api/jobs/route.ts` and
 * `app/api/exports/route.ts` right after the processor accepts the job. Deliberately not `async` and never
 * awaited by its caller: the constraint is that a slow or failed write to Postgres is never why a generate
 * or export job fails or waits, and awaiting it first would make that true only some of the time.
 */
export function recordUsage(kind: UsageKind, userId: string | null): void {
  prisma.usageEvent.create({ data: { kind, userId } }).catch((error: unknown) => {
    console.error("usage event write failed:", error);
  });
}

export interface UsageCounts {
  today: number;
  sevenDays: number;
  thirtyDays: number;
  allTime: number;
}

export async function usageCountsByKind(kind: UsageKind, now: Date = new Date()): Promise<UsageCounts> {
  const windows = usageWindowStarts(now);
  const [today, sevenDays, thirtyDays, allTime] = await Promise.all([
    prisma.usageEvent.count({ where: { kind, createdAt: { gte: windows.today } } }),
    prisma.usageEvent.count({ where: { kind, createdAt: { gte: windows.sevenDays } } }),
    prisma.usageEvent.count({ where: { kind, createdAt: { gte: windows.thirtyDays } } }),
    prisma.usageEvent.count({ where: { kind } }),
  ]);
  return { today, sevenDays, thirtyDays, allTime };
}
