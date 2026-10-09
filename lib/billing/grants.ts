import { GRANT_KIND, isGrant } from "./entitlement";
import { formatDay } from "./notices";
import { isFinal, type HistoryEntry, type StoredSubscription, type SubscriptionFields } from "./sync";

/**
 * A tier given by hand (G-127 M1, D379): a free month, a comp. It is the person's one subscription row, of its own kind,
 * with no provider id and an end date; the entitlement rule gives the tier until that date and nothing has to end it.
 * Pure: the admin's actions ask these functions and write what they answer.
 */

const DAY_MS = 24 * 3_600_000;

/** How far ahead a grant may end: a guard against a mistyped year, not a policy. */
export const GRANT_MAX_DAYS = 5 * 366;

export const GRANT_REFUSED = {
  bought:
    "This person has a subscription bought at the payment provider. It has to end, or be cancelled under Manage billing, before a tier is given by hand.",
  date: "Choose the day the tier ends, in the form 2026-11-08.",
  past: "The end has to be after today.",
  far: "The end can be at most five years ahead.",
  none: "This person has no tier given by hand to end.",
  own: "Your own tier is not given here; another admin gives it.",
} as const;

/** "2026-11-08" to the start of that day in UTC: the tier lasts until then. */
export function parseGrantEnd(text: string, now: Date): { until: Date } | { error: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return { error: GRANT_REFUSED.date };
  const until = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(until.getTime()) || until.toISOString().slice(0, 10) !== text.trim()) return { error: GRANT_REFUSED.date };
  if (until <= now) return { error: GRANT_REFUSED.past };
  if (until.getTime() - now.getTime() > GRANT_MAX_DAYS * DAY_MS) return { error: GRANT_REFUSED.far };
  return { until };
}

/**
 * Whether a tier may be given by hand over what the person has now: not while a subscription bought at the provider
 * could still charge or come back, since two would then decide one person's tier. Over an earlier grant, or a bought
 * subscription that has ended, it may.
 */
export function grantRefusal(stored: StoredSubscription | null): string | null {
  if (!stored || isGrant(stored) || isFinal(stored)) return null;
  return GRANT_REFUSED.bought;
}

const describe = (tierName: string, until: Date) => `${tierName} until ${formatDay(until)}`;

/** The row a grant writes, and the line it adds to the person's history. The provider's customer, if any, is kept. */
export function grantRow(
  stored: StoredSubscription | null,
  grant: { userId: string; tierId: string; tierName: string; until: Date }
): { fields: SubscriptionFields; history: HistoryEntry[] } {
  const fields: SubscriptionFields = {
    userId: grant.userId,
    kind: GRANT_KIND,
    tierId: grant.tierId,
    priceId: null,
    status: "active",
    stripeCustomerId: stored?.stripeCustomerId ?? null,
    stripeSubscriptionId: null,
    startedAt: null,
    scheduledPriceId: null,
    currentPeriodEnd: grant.until,
    cancelAtPeriodEnd: false,
    endedAt: null,
    firstFailedAt: null,
    nextAttemptAt: null,
    payUrl: null,
    actionNeeded: false,
  };
  const before = stored && isGrant(stored) && stored.currentPeriodEnd ? `given until ${formatDay(stored.currentPeriodEnd)}` : null;
  return { fields, history: [{ kind: "granted", before, after: describe(grant.tierName, grant.until) }] };
}

/** Ending a grant now: the row stays, as the record of what was given, and gives nothing from now on. */
export function endedGrantRow(stored: StoredSubscription, now: Date): { fields: SubscriptionFields; history: HistoryEntry[] } | null {
  if (!isGrant(stored) || stored.status !== "active" || !stored.currentPeriodEnd || stored.currentPeriodEnd <= now) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = stored;
  return {
    fields: { ...rest, status: "canceled", endedAt: now },
    history: [{ kind: "grant-ended", before: `given until ${formatDay(stored.currentPeriodEnd)}`, after: `ended ${formatDay(now)}` }],
  };
}
