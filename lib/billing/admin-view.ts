import type { HistoryKind } from "./sync";
import { isGrant } from "./entitlement";
import { formatDay } from "./notices";

/**
 * What the admin reads of people's subscriptions (G-127 M2): a history line in words, whether a subscription may be moved
 * to its tier's current price (D381), and the months revenue is read for. Pure: the pages and actions ask these.
 */

/** "€4.99": an amount in the currency's minor unit. */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

const ISO = /^\d{4}-\d{2}-\d{2}T/;
/** A stored history value: a date written as ISO text reads as a day; anything else as it is. */
const shown = (value: string | null): string => (value === null ? "none" : ISO.test(value) ? formatDay(new Date(value)) : value);

export interface HistoryLine {
  kind: string;
  before: string | null;
  after: string | null;
}

/**
 * One history line in words. `priceName` names an app price id (what a "price" line holds); an id it does not know is
 * shown as it is.
 */
export function historyText(line: HistoryLine, priceName: (id: string) => string | undefined): string {
  const price = (id: string | null) => (id === null ? "none" : (priceName(id) ?? id));
  switch (line.kind as HistoryKind) {
    case "created":
      return `Started, ${shown(line.after)}`;
    case "status":
      return `Status ${shown(line.before)} → ${shown(line.after)}`;
    case "period":
      return `Period ends ${shown(line.after)} (was ${shown(line.before)})`;
    case "cancel":
      return line.after === "true" ? "Set to end at the period's end" : "No longer set to end";
    case "price":
      return `Price ${price(line.before)} → ${price(line.after)}`;
    case "failure":
      return line.after === null ? "No payment failing any more" : `A payment failed, first on ${shown(line.after)}`;
    case "ended":
      return `Ended ${shown(line.after)}`;
    case "replaced":
      return `Took the place of ${line.before === "grant" ? "a tier given by hand" : `subscription ${shown(line.before)}`}`;
    case "second":
      return `A second subscription, ${shown(line.after)}, was set to end at its period's end`;
    case "dispute":
      return `Payment ${shown(line.after)} disputed by the bank`;
    case "refund":
      return `Payment ${shown(line.after)} refunded`;
    case "refund-asked":
      return `Refund asked: ${shown(line.after)}`;
    case "granted":
      return line.before ? `Given ${shown(line.after)}, in place of ${line.before}` : `Given ${shown(line.after)}`;
    case "grant-ended":
      return `Given by hand ended: ${shown(line.before)}, ${shown(line.after)}`;
    case "withdrawal":
      return `Withdrawn from by the person: ${shown(line.after)}`;
    default:
      return `${line.kind}: ${shown(line.before)} → ${shown(line.after)}`;
  }
}

export const MOVE_REFUSED = {
  notBought: "Only a subscription bought at the payment provider moves to another price.",
  standing: "Only a subscription in good standing moves: this one has a failing payment, or it has ended.",
  noPrice: "This subscription has no price recorded to move from.",
  noCurrent: "Its tier offers no price for the same period now.",
  same: "This subscription is already on the price offered now.",
} as const;

export interface StoredForMove {
  kind: string;
  status: string;
  endedAt: Date | null;
  firstFailedAt: Date | null;
  stripeSubscriptionId: string | null;
  priceId: string | null;
}

/**
 * Why a subscription may not be moved to `target` (its tier's current price for the same period), or null when it may.
 * Only one in good standing moves, as only such a change of price is taken by the sync (D376).
 */
export function moveRefusal(stored: StoredForMove, target: { id: string } | null): string | null {
  if (isGrant(stored) || !stored.stripeSubscriptionId) return MOVE_REFUSED.notBought;
  if (stored.endedAt !== null || stored.firstFailedAt !== null || (stored.status !== "active" && stored.status !== "trialing"))
    return MOVE_REFUSED.standing;
  if (!stored.priceId) return MOVE_REFUSED.noPrice;
  if (!target) return MOVE_REFUSED.noCurrent;
  if (target.id === stored.priceId) return MOVE_REFUSED.same;
  return null;
}

/** The UTC calendar month `offset` months from the one `now` is in: [from, to). */
export function monthRange(now: Date, offset = 0): { from: Date; to: Date; name: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const name = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(from);
  return { from, to, name };
}

/** A subscription whose payment is failing now: what the admin's list of failing payments shows. */
export const FAILING_STATUSES = ["past_due", "unpaid", "incomplete"] as const;
