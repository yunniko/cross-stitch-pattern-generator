/**
 * What a person gets from their subscription (G-106 M1, D367): their tier, or Free. One pure function of the stored
 * snapshot and the time now; features, limits and the Plan section all ask it, and nothing else decides.
 *
 * Every Stripe status is a named case (Stripe's statuses: docs/reviews/2026-10-08-stripe-billing-reference.md). A status
 * this list does not know gives Free and says so: a new Stripe status must not give a tier away, nor break a page.
 */

/** Stripe's subscription statuses at the pinned API version (`lib/billing/stripe-adapter.ts`). */
export const SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "paused",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isSubscriptionStatus(status: string): status is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

/**
 * How long past the stored period's end the tier is still given: a renewal's webhook can arrive late, or be lost until
 * the reconciliation pass reads the subscription again. See D367.
 */
export const LATE_RECORD_ALLOWANCE_MS = 2 * 24 * 3_600_000;

/** What the rule takes from the site's settings (`lib/settings/`). */
export interface BillingPolicy {
  /** How long the tier lasts after a renewal first fails (G-126, D375). */
  graceDays: number;
}

const DAY_MS = 24 * 3_600_000;

/** The stored fields the rule reads: what a query selects for it (`ENTITLEMENT_SELECT`). */
export interface EntitlementInput {
  /** "grant" for a tier an admin gives by hand (G-127, D379); anything else, or absent, is a subscription bought. */
  kind?: string;
  status: string;
  currentPeriodEnd: Date | null;
  /** The first failed attempt of the invoice now open, kept while the subscription stays failing (D375). */
  firstFailedAt: Date | null;
}

/** The Prisma `select` for a subscription the rule will read. */
export const ENTITLEMENT_SELECT = { kind: true, status: true, currentPeriodEnd: true, firstFailedAt: true } as const;

export type FreeReason =
  | "no-subscription"
  | "first-payment-pending"
  | "first-payment-never-made"
  | "period-ended"
  | "no-period-recorded"
  | "grace-ended"
  | "given-ended"
  | "unpaid"
  | "canceled"
  | "paused"
  | "unknown-status";

export type Entitlement =
  { tier: true; until: Date; status: SubscriptionStatus } | { tier: false; reason: FreeReason; status: string | null };

const free = (reason: FreeReason, status: string | null): Entitlement => ({ tier: false, reason, status });

/** While the stored period lasts, plus the allowance for a late record. */
function untilPeriodEnd(subscription: EntitlementInput, status: SubscriptionStatus, now: Date): Entitlement {
  if (!subscription.currentPeriodEnd) return free("no-period-recorded", status);
  const until = new Date(subscription.currentPeriodEnd.getTime() + LATE_RECORD_ALLOWANCE_MS);
  return now < until ? { tier: true, until, status } : free("period-ended", status);
}

/**
 * A renewal is failing and being retried: the tier lasts for the grace, counted from the invoice's first failed
 * attempt (Stripe's own date, never when an event arrived), and never past the period, so a subscription left failing
 * cannot keep its tier for ever. A failing one with no failure date known lasts to its period's end. See D375.
 */
function untilGraceEnds(subscription: EntitlementInput, policy: BillingPolicy, now: Date): Entitlement {
  const byPeriod = untilPeriodEnd(subscription, "past_due", now);
  if (!subscription.firstFailedAt || !byPeriod.tier) return byPeriod;
  const graceEnd = new Date(subscription.firstFailedAt.getTime() + policy.graceDays * DAY_MS);
  if (now >= graceEnd) return free("grace-ended", "past_due");
  return { tier: true, until: graceEnd < byPeriod.until ? graceEnd : byPeriod.until, status: "past_due" };
}

/** A subscription an admin gave by hand (G-127, D379). */
export const GRANT_KIND = "grant";

export function isGrant(subscription: { kind?: string } | null | undefined): boolean {
  return subscription?.kind === GRANT_KIND;
}

/**
 * A tier given by hand lasts until its end date exactly: no payment record can arrive late, so the allowance for one
 * does not apply. An admin ending it early writes the status "canceled". See D379.
 */
function untilGrantEnds(subscription: EntitlementInput, now: Date): Entitlement {
  if (subscription.status !== "active" || !subscription.currentPeriodEnd || now >= subscription.currentPeriodEnd)
    return free("given-ended", subscription.status);
  return { tier: true, until: subscription.currentPeriodEnd, status: "active" };
}

export function entitlement(subscription: EntitlementInput | null | undefined, policy: BillingPolicy, now: Date): Entitlement {
  if (!subscription) return free("no-subscription", null);
  if (isGrant(subscription)) return untilGrantEnds(subscription, now);
  const { status } = subscription;
  if (!isSubscriptionStatus(status)) return free("unknown-status", status);
  switch (status) {
    // A first payment that has not succeeded (yet, or within Stripe's 23 hours): nothing has been paid for.
    case "incomplete":
      return free("first-payment-pending", status);
    case "incomplete_expired":
      return free("first-payment-never-made", status);
    case "trialing":
    case "active":
      return untilPeriodEnd(subscription, status, now);
    case "past_due":
      return untilGraceEnds(subscription, policy, now);
    // Stripe has stopped trying (its "revoke access" status), ended the subscription, or paused it for want of a card.
    case "unpaid":
      return free("unpaid", status);
    case "canceled":
      return free("canceled", status);
    case "paused":
      return free("paused", status);
    default: {
      const unhandled: never = status;
      return free("unknown-status", unhandled);
    }
  }
}

/** Whether the person's tier counts now: the test features and limits apply. */
export function hasTier(subscription: EntitlementInput | null | undefined, policy: BillingPolicy, now = new Date()): boolean {
  return entitlement(subscription, policy, now).tier;
}
