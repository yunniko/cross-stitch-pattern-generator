import type { BillingInterval } from "./contract";
import { entitlement, type EntitlementInput } from "./entitlement";
import { holdsThePlace } from "./sync";

/**
 * Buying a plan (G-106 M3): which prices are offered, when Checkout is refused, and what the Plan section says about a
 * subscription. Pure, so the page and the server action ask the same questions and the tests can ask them too.
 */

/** The feature buying is under. It starts hidden in production, by a row its migration writes (D372). */
export const BUYING_FEATURE = "billing.buy";

export const CHECKOUT_REFUSED = {
  off: "Plans cannot be bought just now.",
  hidden: "Plans are not on sale.",
  price: "That price is no longer offered. Please choose again.",
  live: "You already have a plan. Change or cancel it under Manage billing.",
  unavailable: "The payment page could not be opened just now. Please try again in a few minutes.",
} as const;

export interface StoredForCheckout {
  status: string;
  endedAt: Date | null;
}

/**
 * Why Checkout is refused, or null when it may start. A subscription that still holds the person's place — trialing,
 * active or past due, not ended — refuses a second one (Acceptance 6; a second made anyway is D370's).
 */
export function checkoutRefusal(facts: {
  billingOn: boolean;
  buyingUsable: boolean;
  price: { current: boolean } | null;
  stored: StoredForCheckout | null;
}): string | null {
  if (!facts.billingOn) return CHECKOUT_REFUSED.off;
  if (!facts.buyingUsable) return CHECKOUT_REFUSED.hidden;
  if (!facts.price?.current) return CHECKOUT_REFUSED.price;
  if (facts.stored && holdsThePlace(facts.stored)) return CHECKOUT_REFUSED.live;
  return null;
}

export interface PriceRow {
  id: string;
  tierId: string;
  tierName: string;
  interval: BillingInterval;
  amount: number;
  currency: string;
}

export interface OfferedTier {
  tierId: string;
  tierName: string;
  month: PriceRow | null;
  year: PriceRow | null;
}

/**
 * Current prices grouped by tier, cheapest monthly first; a tier with only a yearly price sorts by a twelfth of it. The
 * rows come newest first, so where two are current for one period (an admin's slip) the newer is offered.
 */
export function offeredTiers(currentPricesNewestFirst: readonly PriceRow[]): OfferedTier[] {
  const tiers = new Map<string, OfferedTier>();
  for (const price of currentPricesNewestFirst) {
    const tier = tiers.get(price.tierId) ?? { tierId: price.tierId, tierName: price.tierName, month: null, year: null };
    const slot = price.interval === "MONTH" ? "month" : "year";
    tier[slot] ??= price;
    tiers.set(price.tierId, tier);
  }
  const monthly = (tier: OfferedTier) => tier.month?.amount ?? (tier.year ? tier.year.amount / 12 : Infinity);
  return [...tiers.values()].sort((a, b) => monthly(a) - monthly(b) || a.tierName.localeCompare(b.tierName));
}

/** "€10.00 a month": the amount is in the currency's minor unit, as Stripe keeps it. */
export function formatPrice(price: { amount: number; currency: string; interval: BillingInterval }): string {
  const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency: price.currency.toUpperCase() }).format(price.amount / 100);
  return `${amount} a ${price.interval === "MONTH" ? "month" : "year"}`;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export interface StoredForStatus extends EntitlementInput {
  cancelAtPeriodEnd: boolean;
}

/** One line under the plan's name about where the subscription stands; null when there is none to speak of. */
export function planStatusLine(stored: StoredForStatus | null, now: Date): string | null {
  if (!stored) return null;
  const given = entitlement(stored, now);
  const periodEnd = stored.currentPeriodEnd ? DAY_FORMAT.format(stored.currentPeriodEnd) : null;
  if (given.tier) {
    if (given.status === "past_due") return "A renewal payment failed and is being retried. Update your card under Manage billing.";
    if (stored.cancelAtPeriodEnd && periodEnd) return `Cancelled: your plan lasts until ${periodEnd} and will not renew.`;
    if (given.status === "trialing" && periodEnd) return `Trial until ${periodEnd}.`;
    return periodEnd ? `Renews on ${periodEnd}.` : null;
  }
  switch (given.reason) {
    case "first-payment-pending":
      return "Your first payment is not complete yet.";
    case "first-payment-never-made":
      return "Your first payment was not completed, so the plan did not start.";
    case "canceled":
      return "Your paid plan has ended.";
    case "unpaid":
      return "Your paid plan stopped because a renewal could not be paid.";
    case "paused":
      return "Your paid plan is paused.";
    case "period-ended":
    case "no-period-recorded":
    case "unknown-status":
      return "Your paid plan is not active. If you have just paid, this page will update shortly.";
    case "no-subscription":
      return null;
  }
}
