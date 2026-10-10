import { prisma } from "@/lib/prisma";
import { dailyUsage, exportMix, type UsageDay } from "@/lib/account/usage";
import { usageWindowStarts } from "./usage-windows";
import { rangeWindow, type RangeId } from "./overview";

/**
 * The admin Overview's reads (G-107 M3): the range's figures and the period before, jobs per UTC day for 30 days, and
 * exports by kind. Counted in the database: the site's events are too many to read one by one.
 */

export interface OverviewFigures {
  generations: { current: number; previous: number | null };
  exports: { current: number; previous: number | null };
  newAccounts: { current: number; previous: number | null };
  /** Accounts that exist and generated or exported in the range. */
  activeAccounts: number;
}

const between = (from: Date | null, to?: Date) => (from ? { createdAt: to ? { gte: from, lt: to } : { gte: from } } : {});

/**
 * Joined to `User`: `UsageEvent.userId` is a plain column, so an id whose account is gone must not count (D406). Deleting
 * an account clears its events' ids; the join keeps the figure right whatever a row holds.
 */
async function activeAccountsSince(from: Date | null): Promise<number> {
  const rows = from
    ? await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT e."userId") AS n FROM "UsageEvent" e JOIN "User" u ON u."id" = e."userId"
        WHERE e."createdAt" >= ${from}`
    : await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT e."userId") AS n FROM "UsageEvent" e JOIN "User" u ON u."id" = e."userId"`;
  return Number(rows[0]?.n ?? 0);
}

export async function overviewFigures(range: RangeId, now: Date = new Date()): Promise<OverviewFigures> {
  const { from, previous } = rangeWindow(range, now);
  const count = (kind: "GENERATE" | "EXPORT", window: object) => prisma.usageEvent.count({ where: { kind, ...window } });
  const [generations, exports, newAccounts, activeAccounts, prevGenerations, prevExports, prevAccounts] = await Promise.all([
    count("GENERATE", between(from)),
    count("EXPORT", between(from)),
    prisma.user.count({ where: between(from) }),
    activeAccountsSince(from),
    previous ? count("GENERATE", between(previous.from, previous.to)) : null,
    previous ? count("EXPORT", between(previous.from, previous.to)) : null,
    previous ? prisma.user.count({ where: between(previous.from, previous.to) }) : null,
  ]);
  return {
    generations: { current: generations, previous: prevGenerations },
    exports: { current: exports, previous: prevExports },
    newAccounts: { current: newAccounts, previous: prevAccounts },
    activeAccounts,
  };
}

/** Generations and exports per UTC day, the last 30 days, today last. */
export async function jobsPerDay(now: Date = new Date()): Promise<UsageDay[]> {
  const from = new Date(usageWindowStarts(now).thirtyDays);
  const rows = await prisma.$queryRaw<{ day: Date; kind: "GENERATE" | "EXPORT"; n: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day, "kind"::text AS kind, COUNT(*) AS n
    FROM "UsageEvent" WHERE "createdAt" >= ${from}
    GROUP BY 1, 2`;
  return dailyUsage(
    rows.map((row) => ({ kind: row.kind, createdAt: row.day, count: Number(row.n) })),
    now
  );
}

/** Exports in the range by kind, merged by name as the Export workspace names them. */
export async function exportsInRange(range: RangeId, now: Date = new Date()) {
  const { from } = rangeWindow(range, now);
  const rows = await prisma.usageEvent.groupBy({
    by: ["exportKind"],
    where: { kind: "EXPORT", ...between(from) },
    _count: { _all: true },
  });
  return exportMix(rows.map((row) => ({ exportKind: row.exportKind, count: row._count._all })));
}

/** New accounts in the stats table's four windows. */
export async function newAccountCounts(now: Date = new Date()) {
  const windows = usageWindowStarts(now);
  const [today, sevenDays, thirtyDays, allTime] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: windows.today } } }),
    prisma.user.count({ where: { createdAt: { gte: windows.sevenDays } } }),
    prisma.user.count({ where: { createdAt: { gte: windows.thirtyDays } } }),
    prisma.user.count(),
  ]);
  return { today, sevenDays, thirtyDays, allTime };
}
