import { countedLimits, limitValue, type Limit, type QuotaAction, type ResolvedLimits } from "./limits";

/**
 * Counted limits, decided (G-109): may this person have the server do this now? Pure: the uses come in as times, read
 * under a lock by `quota-server.ts`, which also counts the use it allows. Periods are rolling (Owner, 2026-10-08), so a
 * use stops counting exactly one period after it was made, and "when it resets" is when enough of the oldest drop out.
 */

const HOUR_MS = 3_600_000;

export function periodMs(limit: Limit): number {
  if (!limit.counted) throw new Error(`"${limit.id}" is not a counted limit`);
  return limit.counted.periodHours * HOUR_MS;
}

/** The counted limits on an action that apply to this person: those not unlimited. */
export function limitsInForce(action: QuotaAction, limits: ResolvedLimits): { limit: Limit; value: number }[] {
  return countedLimits(action).flatMap((limit) => {
    const value = limitValue(limits, limit.id);
    return value === "unlimited" ? [] : [{ limit, value }];
  });
}

/** How far back the uses must be read to decide every limit in force. */
export function lookbackMs(inForce: ReadonlyArray<{ limit: Limit }>): number {
  return Math.max(0, ...inForce.map(({ limit }) => periodMs(limit)));
}

export interface LimitUse {
  limit: Limit;
  value: number;
  /** Uses inside the period that ends now. */
  used: number;
  left: number;
  /** When one more is allowed again, if none is left now; null if none ever is (a value of 0). */
  nextAt: Date | null;
}

/**
 * One limit's use at `now`, from the times of the person's uses of its action (any order; those outside the period are
 * ignored). With `used` at or over the value, one more is allowed once all but `value - 1` of them have left the period:
 * at the time of the `(used - value + 1)`th oldest plus the period. The value may be under `used` when the admin lowered it.
 */
export function limitUse(limit: Limit, value: number, usedAt: readonly Date[], now: Date): LimitUse {
  const period = periodMs(limit);
  const inside = usedAt
    .map((at) => at.getTime())
    .filter((at) => at > now.getTime() - period && at <= now.getTime())
    .sort((a, b) => a - b);
  const used = inside.length;
  const left = Math.max(0, value - used);
  let nextAt: Date | null = null;
  if (left === 0 && value > 0) nextAt = new Date(inside[used - value] + period);
  return { limit, value, used, left, nextAt };
}

export type QuotaDecision =
  | { allowed: true }
  /** A guest, where a limit in force needs an account (Owner, 2026-10-06: nothing is counted for a guest). */
  | { allowed: false; reason: "sign-in"; action: QuotaAction }
  /** The limit that keeps the person waiting longest: never (a value of 0) beats any time. */
  | { allowed: false; reason: "used-up"; use: LimitUse };

export function decideQuota(
  action: QuotaAction,
  limits: ResolvedLimits,
  signedIn: boolean,
  usedAt: readonly Date[],
  now: Date
): QuotaDecision {
  const inForce = limitsInForce(action, limits);
  if (inForce.length === 0) return { allowed: true };
  if (!signedIn) return { allowed: false, reason: "sign-in", action };
  const spent = inForce.map(({ limit, value }) => limitUse(limit, value, usedAt, now)).filter((use) => use.left === 0);
  if (spent.length === 0) return { allowed: true };
  const waitOf = (use: LimitUse) => (use.nextAt === null ? Infinity : use.nextAt.getTime());
  return { allowed: false, reason: "used-up", use: spent.reduce((longest, use) => (waitOf(use) > waitOf(longest) ? use : longest)) };
}

const VERB: Record<QuotaAction, string> = { GENERATE: "Generating a chart", EXPORT: "Exporting from the server" };

/** "in 3 hours", "in 12 minutes", "in 2 days": rounded up, so the person is never told to come back too early. */
export function waitWords(ms: number): string {
  const unit = (n: number, word: string) => `in ${n} ${word}${n === 1 ? "" : "s"}`;
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return unit(minutes, "minute");
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return unit(hours, "hour");
  return unit(Math.ceil(hours / 24), "day");
}

/**
 * The refusal in words, one notice for every route (G-109). `plansWithMore` names the tiers that give more of the limit
 * that was reached; it is left out when there are none.
 */
export function refusalMessage(
  decision: Exclude<QuotaDecision, { allowed: true }>,
  now: Date,
  plansWithMore: readonly string[] = []
): string {
  if (decision.reason === "sign-in") return `${VERB[decision.action]} needs an account: sign in, or create one.`;
  const { limit, value, nextAt } = decision.use;
  const more =
    plansWithMore.length > 0 ? ` ${plansWithMore.length === 1 ? "A plan gives" : "Plans give"} more: ${plansWithMore.join(", ")}.` : "";
  if (value === 0 || nextAt === null) return `${VERB[limit.counted!.action]} is not available to your account.${more}`;
  const hours = limit.counted!.periodHours;
  const period = hours % 24 === 0 && hours > 24 ? `${hours / 24} days` : `${hours} hours`;
  return `You have used all ${value.toLocaleString("en")} ${value === 1 ? limit.unit.replace(/s$/, "") : limit.unit} allowed in ${period}. The next is available ${waitWords(nextAt.getTime() - now.getTime())}.${more}`;
}

/** Seconds until the refused request may be tried again, for `Retry-After`; null when it never may. */
export function retryAfterSeconds(decision: Exclude<QuotaDecision, { allowed: true }>, now: Date): number | null {
  if (decision.reason !== "used-up" || decision.use.nextAt === null) return null;
  return Math.max(1, Math.ceil((decision.use.nextAt.getTime() - now.getTime()) / 1000));
}
