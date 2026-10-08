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

/** The stored fields the rule reads: what a query selects for it (`ENTITLEMENT_SELECT`). */
export interface EntitlementInput {
  status: string;
  currentPeriodEnd: Date | null;
  /** The first failed attempt of the invoice now open; G-126 counts its grace from it. */
  firstFailedAt: Date | null;
}

/** The Prisma `select` for a subscription the rule will read. */
export const ENTITLEMENT_SELECT = { status: true, currentPeriodEnd: true, firstFailedAt: true } as const;

export type FreeReason =
  | "no-subscription"
  | "first-payment-pending"
  | "first-payment-never-made"
  | "period-ended"
  | "no-period-recorded"
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

export function entitlement(subscription: EntitlementInput | null | undefined, now: Date): Entitlement {
  if (!subscription) return free("no-subscription", null);
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
    // A renewal failed. Until G-126's grace setting exists, the tier lasts no longer than the paid-for period would:
    // never past the stored period's end, so a failing subscription cannot keep its tier for ever.
    case "past_due":
      return untilPeriodEnd(subscription, status, now);
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
export function hasTier(subscription: EntitlementInput | null | undefined, now = new Date()): boolean {
  return entitlement(subscription, now).tier;
}
