import type { ProviderPayment } from "./contract";
import { isGrant } from "./entitlement";
import { formatMoney } from "./admin-view";
import { formatDay } from "./notices";
import { refundableLeft, unusedRefund } from "./refund-rule";
import { isFinal } from "./sync";

/**
 * A consumer's withdrawal from a subscription (G-129 M2, D387). Pure. The right runs for 14 days from the contract's
 * conclusion (the subscription's start), not from a renewal; withdrawing ends the subscription at once and gives back the
 * part of each payment for the time not yet provided (Directive 2011/83 Art. 14(3); the share is D386's rule).
 */

export const WITHDRAWAL_DAYS = 14;

/** The trader's zone: the period's days are counted in it. */
const ZONE = "Europe/Prague";

const ZONE_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zoneParts(at: Date): Record<"year" | "month" | "day" | "hour" | "minute" | "second", number> {
  const parts = Object.fromEntries(ZONE_PARTS.formatToParts(at).map((part) => [part.type, Number(part.value)]));
  return parts as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

/** How far the zone's clock is ahead of UTC at `at`, in ms. */
function zoneOffset(at: Date): number {
  const p = zoneParts(at);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The moment the zone's day `y-m-d` begins; the day may overflow its month, as `Date.UTC` allows. */
function zoneMidnight(year: number, month: number, day: number): Date {
  const local = Date.UTC(year, month - 1, day);
  const first = local - zoneOffset(new Date(local));
  return new Date(local - zoneOffset(new Date(first)));
}

/**
 * When the right of withdrawal ends: the end of the 14th day after the day the contract was concluded, as the day of the
 * event is not counted (Regulation 1182/71 Art. 3(1)). The moment returned is the first one at which it has ended.
 */
export function withdrawalDeadline(startedAt: Date): Date {
  const start = zoneParts(startedAt);
  return zoneMidnight(start.year, start.month, start.day + WITHDRAWAL_DAYS + 1);
}

/** A subscription as eligibility reads it. */
export interface WithdrawalSubject {
  kind?: string;
  status: string;
  endedAt: Date | null;
  startedAt: Date | null;
  stripeSubscriptionId: string | null;
}

/**
 * The moment the person's right to withdraw from this subscription ends, while it is open; null when there is none: no
 * bought subscription, one already ended, one whose start is not known, or the 14 days passed. A tier given by hand is
 * no contract with the person, so it has none. Whether a withdrawal is already recorded is the caller's to check.
 */
export function withdrawalOpenUntil(subscription: WithdrawalSubject | null, now: Date): Date | null {
  if (!subscription || isGrant(subscription) || !subscription.stripeSubscriptionId || !subscription.startedAt) return null;
  if (isFinal(subscription)) return null;
  const deadline = withdrawalDeadline(subscription.startedAt);
  return now < deadline ? deadline : null;
}

/** A refund a withdrawal asks for, decided once when the withdrawal is recorded. */
export interface PlannedRefund {
  paymentId: string;
  /** In the currency's minor unit. */
  amount: number;
  currency: string;
}

/**
 * The refunds a withdrawal at `at` asks for: each payment made since the subscription began gives back its unused part.
 * A payment whose period the provider did not say is given back whole, in the consumer's favour (D387).
 */
export function withdrawalRefunds(payments: ProviderPayment[], startedAt: Date, at: Date): PlannedRefund[] {
  return payments
    .filter((payment) => payment.paidAt.getTime() >= startedAt.getTime())
    .map((payment) => ({
      paymentId: payment.id,
      amount: payment.period ? (unusedRefund(payment, at) ?? 0) : refundableLeft(payment),
      currency: payment.currency,
    }))
    .filter((refund) => refund.amount > 0);
}

/** "€9.00", or "€9.00 and £2.00" across currencies; "nothing" when there is no refund. */
export function refundTotal(refunds: PlannedRefund[]): string {
  const sums = new Map<string, number>();
  for (const refund of refunds) sums.set(refund.currency, (sums.get(refund.currency) ?? 0) + refund.amount);
  if (sums.size === 0) return "nothing";
  return [...sums].map(([currency, amount]) => formatMoney(amount, currency)).join(" and ");
}

const MOMENT = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "23 October 2026, 00:00 Prague time": a moment as the withdrawal texts write it. */
export const formatMoment = (at: Date): string => `${MOMENT.format(at).replace(" at ", ", ")} Prague time`;

/** The last moment the person may withdraw, as the button's line says it: the day before the deadline, to its end. */
export function deadlineLine(deadline: Date): string {
  return `You can withdraw from this contract until the end of ${formatDay(new Date(deadline.getTime() - 1))} (Prague time).`;
}

/** The acknowledgment shown once a withdrawal is recorded (Directive 2023/2673 Art. 11a): what was received, and when. */
export function withdrawalAcknowledgment(withdrawal: { requestedAt: Date; refunds: PlannedRefund[]; completedAt: Date | null }): string[] {
  const total = refundTotal(withdrawal.refunds);
  return [
    `We received your withdrawal from the contract on ${formatMoment(withdrawal.requestedAt)}.`,
    withdrawal.completedAt
      ? "Your plan has ended, and the account is on the free plan. Your charts are kept."
      : "It is not finished yet: the payment provider could not be reached. Press Finish withdrawal to try again.",
    total === "nothing"
      ? "Nothing was left of your payments to give back."
      : `${total} is given back to the card you paid with, for the time your plan was not used. It usually arrives within 5 to 10 working days.`,
  ];
}

export const WITHDRAWAL_REFUSED = {
  none: "There is no contract to withdraw from on this account.",
  over: "The 14 days for withdrawing from this contract have passed. You can still cancel; the plan then ends when the period paid for ends.",
  off: "A withdrawal cannot be handled just now. Please try again in a few minutes.",
  unavailable: "The payment provider could not be reached, so nothing was changed. Please try again in a few minutes.",
  unfinished:
    "Your withdrawal is recorded, but the payment provider could not be reached to finish it. Press Finish withdrawal to try again.",
} as const;

/** Reads a withdrawal's stored refunds (`Withdrawal.refunds`), refusing anything not of their shape. */
export function readRefunds(value: unknown): PlannedRefund[] {
  if (!Array.isArray(value)) throw new Error("a withdrawal's refunds are not a list");
  return value.map((item) => {
    const { paymentId, amount, currency } = (item ?? {}) as Record<string, unknown>;
    if (typeof paymentId !== "string" || !Number.isInteger(amount) || typeof currency !== "string")
      throw new Error("a withdrawal's refund is malformed");
    return { paymentId, amount: amount as number, currency };
  });
}
