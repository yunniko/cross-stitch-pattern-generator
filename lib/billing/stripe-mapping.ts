import type Stripe from "stripe";
import type { ProviderPrice, SubscriptionSnapshot } from "./contract";

/**
 * Stripe's objects read into the contract's (G-106 M1). Pure, and importing Stripe's types only, so the unit tests feed
 * it plain objects shaped as the pinned API version shapes them (docs/reviews/2026-10-08-stripe-billing-reference.md).
 */

const toDate = (seconds: number | null | undefined): Date | null => (typeof seconds === "number" ? new Date(seconds * 1000) : null);

/** The subscription as the contract holds it. `latest_invoice` must be expanded for the failure date to be read. */
export function snapshotFromStripe(subscription: Stripe.Subscription): SubscriptionSnapshot {
  const items = subscription.items.data;
  // The period lives on the items since the 2025-03-31 API version; a subscription here has one item, and were there
  // more, the earliest end is the one paid for by all of them.
  const ends = items.map((item) => item.current_period_end).filter((end): end is number => typeof end === "number");
  const invoice = typeof subscription.latest_invoice === "object" ? subscription.latest_invoice : null;
  // An invoice is attempted when it is finalized, so an open one with attempts made first failed then.
  const failing = invoice !== null && invoice.status === "open" && invoice.attempt_count > 0;
  return {
    id: subscription.id,
    customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    status: subscription.status,
    priceId: items[0]?.price.id ?? null,
    currentPeriodEnd: ends.length > 0 ? toDate(Math.min(...ends)) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    endedAt: toDate(subscription.ended_at),
    firstFailedAt: failing ? toDate(invoice.status_transitions.finalized_at ?? invoice.created) : null,
    userId: subscription.metadata?.userId || null,
  };
}

const INTERVALS: Record<string, ProviderPrice["interval"]> = { month: "MONTH", year: "YEAR" };

export function priceFromStripe(price: Stripe.Price): ProviderPrice {
  const recurring = price.recurring;
  const product = typeof price.product === "object" && !("deleted" in price.product && price.product.deleted) ? price.product : null;
  return {
    id: price.id,
    active: price.active,
    amount: price.unit_amount,
    currency: price.currency,
    interval: recurring && recurring.interval_count === 1 ? (INTERVALS[recurring.interval] ?? null) : null,
    productName: product && "name" in product ? product.name : null,
  };
}
