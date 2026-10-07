/**
 * A person's plan (G-107 M2): Free, or the tier of a live subscription. "Live" is Stripe's own word for a subscription's
 * status, written through unchanged; the feature states (`lib/features/server.ts`) count a tier's set by the same test.
 */

const LIVE_STATUSES: readonly string[] = ["active", "trialing", "past_due"];

export function subscriptionLive(status: string): boolean {
  return LIVE_STATUSES.includes(status);
}

export const FREE_PLAN = "Free";

/** The plan's name: the tier's while the subscription is live, Free otherwise. */
export function planName(subscription: { status: string; tier: { name: string } } | null | undefined): string {
  return subscription && subscriptionLive(subscription.status) ? subscription.tier.name : FREE_PLAN;
}
