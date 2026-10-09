/**
 * How much of a payment is given back (G-129 M1, D386): the admin's three refund kinds, and the consumer's withdrawal,
 * which keeps the proportionate amount for the time already provided (Directive 2011/83 Art. 14(3)). Pure.
 *
 * The rule is a judgment awaiting the Owner's confirmation (D386): the share is by exact time, and the refund is rounded
 * up to the minor unit, in the consumer's favour.
 */

export interface PaidPeriod {
  start: Date;
  end: Date;
}

export interface RefundablePayment {
  /** In the currency's minor unit. */
  amount: number;
  refunded: number;
  /** The period the payment paid for; null when the provider did not say. */
  period: PaidPeriod | null;
}

/** The share of a period not yet provided at `at`: 1 before it starts, 0 once it has ended. */
export function unusedShare(period: PaidPeriod, at: Date): number {
  const length = period.end.getTime() - period.start.getTime();
  if (length <= 0) return 0;
  const left = (period.end.getTime() - at.getTime()) / length;
  return Math.min(1, Math.max(0, left));
}

/** What is left of a payment to give back. */
export function refundableLeft(payment: RefundablePayment): number {
  return Math.max(0, payment.amount - payment.refunded);
}

/**
 * The part of the payment for the time not yet provided, never more than what is left of it; null when the payment's
 * period is not known, so no share can be computed.
 */
export function unusedRefund(payment: RefundablePayment, at: Date): number | null {
  if (!payment.period) return null;
  return Math.min(refundableLeft(payment), Math.ceil(payment.amount * unusedShare(payment.period, at)));
}

/** "12.50", "12,5", "12" or "€12.50" as minor units (1250); null for anything else, a negative or a third decimal. */
export function parseMoney(text: string): number | null {
  const match = /^\s*(?:€|\$|£)?\s*(\d{1,7})(?:[.,](\d{1,2}))?\s*$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export const REFUND_REFUSED = {
  nothingLeft: "That payment has already been refunded.",
  notAmount: "Enter an amount such as 4.99.",
  zero: "Enter an amount above zero.",
  tooMuch: "That is more than is left of the payment.",
  noPeriod: "The payment provider did not say which period this payment paid for, so the unused part cannot be worked out.",
  periodOver: "The period this payment paid for has ended, so no part of it is unused.",
} as const;

export type RefundAsk = { kind: "all" } | { kind: "unused" } | { kind: "amount"; text: string };

/** The amount to refund for an ask, in minor units, or the refusal in words. */
export function refundAmount(payment: RefundablePayment, ask: RefundAsk, at: Date): { amount: number } | { refusal: string } {
  const left = refundableLeft(payment);
  if (left === 0) return { refusal: REFUND_REFUSED.nothingLeft };
  if (ask.kind === "all") return { amount: left };
  if (ask.kind === "unused") {
    const unused = unusedRefund(payment, at);
    if (unused === null) return { refusal: REFUND_REFUSED.noPeriod };
    if (unused === 0) return { refusal: REFUND_REFUSED.periodOver };
    return { amount: unused };
  }
  const amount = parseMoney(ask.text);
  if (amount === null) return { refusal: REFUND_REFUSED.notAmount };
  if (amount === 0) return { refusal: REFUND_REFUSED.zero };
  if (amount > left) return { refusal: REFUND_REFUSED.tooMuch };
  return { amount };
}
