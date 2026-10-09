import type { BillingInterval } from "./contract";
import { entitlement, isGrant, type BillingPolicy, type EntitlementInput } from "./entitlement";
import { formatDay } from "./notices";
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
  live: "You already have a plan. Change or cancel it on this page.",
  given: "Your plan was given to you by the site. A plan can be bought once it ends.",
  unavailable: "The payment page could not be opened just now. Please try again in a few minutes.",
} as const;

export interface StoredForCheckout {
  kind: string;
  status: string;
  currentPeriodEnd: Date | null;
  endedAt: Date | null;
}

/** Whether the person's subscription stops them buying one now: a bought one still live, or a tier given by hand still lasting. */
export function hasPlanInPlace(stored: StoredForCheckout | null, now: Date): boolean {
  if (!stored) return false;
  return isGrant(stored) ? entitlement({ ...stored, firstFailedAt: null }, { graceDays: 0 }, now).tier : holdsThePlace(stored);
}

/**
 * Why Checkout is refused, or null when it may start. A subscription that still holds the person's place — trialing,
 * active or past due, not ended — refuses a second one (Acceptance 6; a second made anyway is D370's), and so does a
 * tier given by hand while it lasts (D379).
 */
export function checkoutRefusal(facts: {
  billingOn: boolean;
  buyingUsable: boolean;
  price: { current: boolean } | null;
  stored: StoredForCheckout | null;
  now: Date;
}): string | null {
  if (!facts.billingOn) return CHECKOUT_REFUSED.off;
  if (!facts.buyingUsable) return CHECKOUT_REFUSED.hidden;
  if (!facts.price?.current) return CHECKOUT_REFUSED.price;
  if (hasPlanInPlace(facts.stored, facts.now)) return isGrant(facts.stored) ? CHECKOUT_REFUSED.given : CHECKOUT_REFUSED.live;
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

export interface StoredForStatus extends EntitlementInput {
  cancelAtPeriodEnd: boolean;
}

/** One line under the plan's name about where the subscription stands; null when there is none to speak of. */
export function planStatusLine(stored: StoredForStatus | null, policy: BillingPolicy, now: Date): string | null {
  if (!stored) return null;
  const given = entitlement(stored, policy, now);
  const periodEnd = stored.currentPeriodEnd ? formatDay(stored.currentPeriodEnd) : null;
  if (isGrant(stored))
    return given.tier ? `Given to you by the site until ${formatDay(given.until)}.` : "The plan the site gave you has ended.";
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
    case "grace-ended":
      return "Your paid plan stopped because a renewal could not be paid.";
    case "paused":
      return "Your paid plan is paused.";
    case "given-ended":
      return "The plan the site gave you has ended.";
    case "period-ended":
    case "no-period-recorded":
    case "unknown-status":
      return "Your paid plan is not active. If you have just paid, this page will update shortly.";
    case "no-subscription":
      return null;
  }
}

export interface StoredForPaymentNotice extends EntitlementInput {
  nextAttemptAt: Date | null;
  payUrl: string | null;
  actionNeeded: boolean;
}

export interface PaymentNotice {
  /** "warning" while the plan is kept, "ended" once the account is on Free for want of payment. */
  tone: "warning" | "ended";
  lines: string[];
  /** The provider's page for paying the open invoice, when there is one to link to. */
  pay: { href: string; label: string } | null;
}

/** Only the provider's own https pages, or the fake's on this machine, are linked to. */
export function safePayUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const local = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    return parsed.protocol === "https:" || local ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * What the Plan page says while a payment fails (G-126 M2): until when the plan is kept, the next try, and the way to
 * pay; or, once the grace is over, that the account is on Free and the charts are kept. Null when no payment is failing.
 */
export function paymentNotice(stored: StoredForPaymentNotice | null, policy: BillingPolicy, now: Date): PaymentNotice | null {
  if (!stored) return null;
  const given = entitlement(stored, policy, now);
  const href = safePayUrl(stored.payUrl);
  if (given.tier && given.status === "past_due") {
    const until = `Your plan stays as it is until ${formatDay(given.until)}. If it is still unpaid then, your account moves to the free plan; your charts are kept.`;
    if (stored.actionNeeded)
      return {
        tone: "warning",
        lines: ["Your bank asks you to confirm the payment for your plan before it goes through.", until],
        pay: href ? { href, label: "Confirm the payment" } : null,
      };
    const next = stored.nextAttemptAt ? ` The card will be tried again on ${formatDay(stored.nextAttemptAt)}.` : "";
    return {
      tone: "warning",
      lines: [`A payment for your plan did not go through.${next} To pay with another card, use Manage billing.`, until],
      pay: href ? { href, label: "Pay now" } : null,
    };
  }
  if (!given.tier && (given.reason === "grace-ended" || given.reason === "unpaid"))
    return {
      tone: "ended",
      lines: [
        "Your plan ended because its payment did not go through, and your account is on the free plan.",
        `Your charts are kept: you can still open and export every one.${href ? " Paying the open invoice brings the plan back." : ""}`,
      ],
      pay: href ? { href, label: "Pay the open invoice" } : null,
    };
  return null;
}
