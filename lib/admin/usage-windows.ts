/**
 * The admin stats page's four windows (G-075 M4), kept pure and out of the page component so the boundary
 * math is unit-testable without a database. UTC throughout: this is an internal dashboard, not a
 * reader-facing date, and a fixed zone means the same instant always falls in the same window regardless of
 * where the server runs.
 */
export interface UsageWindows {
  /** Since UTC midnight today. */
  today: Date;
  /** Since UTC midnight 6 days ago -- the last 7 calendar days, today included. */
  sevenDays: Date;
  /** Since UTC midnight 29 days ago -- the last 30 calendar days, today included. */
  thirtyDays: Date;
}

const DAY_MS = 86_400_000;

export function usageWindowStarts(now: Date): UsageWindows {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    today,
    sevenDays: new Date(today.getTime() - 6 * DAY_MS),
    thirtyDays: new Date(today.getTime() - 29 * DAY_MS),
  };
}
