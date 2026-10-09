import { describe, expect, it } from "vitest";
import { FakeBilling } from "../../lib/billing/fake";
import { REFUND_REFUSED, parseMoney, refundAmount, unusedRefund, unusedShare } from "../../lib/billing/refund-rule";
import { FAKE_WEBHOOK_SECRET } from "../../lib/billing/settings";
import { chargePeriod, invoicePeriod, periodsByPayment } from "../../lib/billing/stripe-mapping";

type StripeInvoice = Parameters<typeof invoicePeriod>[0];
type StripeCharge = Parameters<typeof chargePeriod>[0];

/**
 * G-129 M1 (D386): how much of a payment is given back — all, the unused part of its period, or an amount — and where
 * the period comes from: the fake's charges, and Stripe's invoices read into the contract.
 */

const T0 = new Date("2026-10-01T00:00:00Z");
const DAY = 24 * 3_600_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const month = { start: T0, end: at(30) };

describe("unusedShare", () => {
  it("is the share of the period still to come, 1 before it and 0 after it", () => {
    expect(unusedShare(month, at(0))).toBe(1);
    expect(unusedShare(month, at(3))).toBeCloseTo(0.9);
    expect(unusedShare(month, at(-1))).toBe(1);
    expect(unusedShare(month, at(30))).toBe(0);
    expect(unusedShare(month, at(31))).toBe(0);
    expect(unusedShare({ start: T0, end: T0 }, T0)).toBe(0);
  });
});

describe("unusedRefund", () => {
  it("rounds up to the cent, in the consumer's favour, and never gives back more than is left", () => {
    // 999 × 27/30 = 899.1 → 900.
    expect(unusedRefund({ amount: 999, refunded: 0, period: month }, at(3))).toBe(900);
    expect(unusedRefund({ amount: 1000, refunded: 0, period: month }, at(3))).toBe(900);
    expect(unusedRefund({ amount: 1000, refunded: 500, period: month }, at(3))).toBe(500);
    expect(unusedRefund({ amount: 1000, refunded: 0, period: month }, at(30))).toBe(0);
    expect(unusedRefund({ amount: 1000, refunded: 0, period: null }, at(3))).toBeNull();
  });

  it("works by exact time within a day", () => {
    const halfDay = new Date(T0.getTime() + DAY / 2);
    // 3000 × (29.5/30) = 2950.
    expect(unusedRefund({ amount: 3000, refunded: 0, period: month }, halfDay)).toBe(2950);
  });
});

describe("parseMoney", () => {
  it("reads an amount with a point or a comma, and an optional currency sign", () => {
    expect(parseMoney("12.50")).toBe(1250);
    expect(parseMoney("12,5")).toBe(1250);
    expect(parseMoney(" 12 ")).toBe(1200);
    expect(parseMoney("€0.99")).toBe(99);
    expect(parseMoney("0")).toBe(0);
  });

  it("refuses anything else", () => {
    for (const text of ["", "abc", "-1", "1.234", "1e3", "12.", "1 000", "Infinity"]) expect(parseMoney(text)).toBeNull();
  });
});

describe("refundAmount", () => {
  const payment = { amount: 1000, refunded: 200, period: month };

  it("gives all that is left, the unused part, or the amount entered", () => {
    expect(refundAmount(payment, { kind: "all" }, at(3))).toEqual({ amount: 800 });
    expect(refundAmount(payment, { kind: "unused" }, at(15))).toEqual({ amount: 500 });
    expect(refundAmount(payment, { kind: "amount", text: "3.5" }, at(3))).toEqual({ amount: 350 });
    expect(refundAmount(payment, { kind: "amount", text: "8" }, at(3))).toEqual({ amount: 800 });
  });

  it("refuses in words: nothing left, no period, a period over, a bad, zero or too large amount", () => {
    expect(refundAmount({ ...payment, refunded: 1000 }, { kind: "all" }, at(3))).toEqual({ refusal: REFUND_REFUSED.nothingLeft });
    expect(refundAmount({ ...payment, period: null }, { kind: "unused" }, at(3))).toEqual({ refusal: REFUND_REFUSED.noPeriod });
    expect(refundAmount(payment, { kind: "unused" }, at(40))).toEqual({ refusal: REFUND_REFUSED.periodOver });
    expect(refundAmount(payment, { kind: "amount", text: "x" }, at(3))).toEqual({ refusal: REFUND_REFUSED.notAmount });
    expect(refundAmount(payment, { kind: "amount", text: "0.00" }, at(3))).toEqual({ refusal: REFUND_REFUSED.zero });
    expect(refundAmount(payment, { kind: "amount", text: "8.01" }, at(3))).toEqual({ refusal: REFUND_REFUSED.tooMuch });
  });
});

describe("the fake's payments carry their period, and refund part of a charge", () => {
  function bought() {
    let now = T0;
    const fake = new FakeBilling(FAKE_WEBHOOK_SECRET, "http://localhost:3000", () => now);
    const price = fake.addPrice({ amount: 1000, currency: "eur", interval: "MONTH", productName: "Personal" });
    const move = (days: number) => (now = at(days));
    return { fake, price, move };
  }

  async function buy(fake: FakeBilling, priceId: string) {
    const { url } = await fake.startCheckout({
      priceId,
      userId: "user_1",
      email: "a@example.com",
      customerId: null,
      consentId: "consent_1",
      successUrl: "x",
      cancelUrl: "y",
    });
    return fake.completeCheckout(new URL(url).searchParams.get("session")!);
  }

  it("dates each charge's period: the first from the purchase, a renewal's from the period before's end, a late payment's too", async () => {
    const { fake, price, move } = bought();
    const subscription = await buy(fake, price.id);
    move(30);
    fake.endPeriod(subscription.id, "failed");
    move(33);
    fake.pay(subscription.id);
    const [renewal, first] = await fake.listPayments(subscription.customerId);
    expect(first.period).toEqual({ start: T0, end: at(30) });
    expect(renewal.period).toEqual({ start: at(30), end: at(60) });
    expect(renewal.paidAt).toEqual(at(33));
  });

  it("refunds an amount, then the rest, each once per key, and refuses more than is left", async () => {
    const { fake, price } = bought();
    const subscription = await buy(fake, price.id);
    const [payment] = await fake.listPayments(subscription.customerId);
    await fake.refundPayment(payment.id, "key_1", 300);
    await fake.refundPayment(payment.id, "key_1", 300);
    expect((await fake.listPayments(subscription.customerId))[0].refunded).toBe(300);
    await expect(fake.refundPayment(payment.id, "key_2", 701)).rejects.toThrow(/cannot refund 701/);
    await expect(fake.refundPayment(payment.id, "key_3", 0)).rejects.toThrow(/cannot refund 0/);
    await fake.refundPayment(payment.id, "key_4");
    expect((await fake.listPayments(subscription.customerId))[0].refunded).toBe(1000);
    expect(fake.events.filter((event) => event.type === "charge.refunded")).toHaveLength(2);
    await expect(fake.refundPayment(payment.id, "key_5", 1)).rejects.toThrow(/already refunded/);
  });
});

describe("a Stripe payment's period, read from its invoice", () => {
  const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
  const line = (start: Date, end: Date) => ({ period: { start: seconds(start), end: seconds(end) } });
  const invoice = (lines: unknown[], payments: unknown[]) =>
    ({ lines: { data: lines }, payments: { data: payments } }) as unknown as StripeInvoice;

  it("spans the invoice's lines, not its own period fields", () => {
    expect(invoicePeriod(invoice([line(T0, at(30))], []))).toEqual(month);
    // A change of plan: a credit for the old price's rest, a charge for the new one's, both from the change to the end.
    expect(invoicePeriod(invoice([line(at(10), at(30)), line(at(10), at(30))], []))).toEqual({ start: at(10), end: at(30) });
    expect(invoicePeriod(invoice([], []))).toBeNull();
    expect(invoicePeriod(invoice([line(T0, T0)], []))).toBeNull();
  });

  it("matches a charge by its payment intent, or by the charge itself, and only a paid invoice payment", () => {
    const periods = periodsByPayment([
      invoice([line(T0, at(30))], [{ status: "paid", payment: { type: "payment_intent", payment_intent: "pi_1" } }]),
      invoice([line(at(30), at(60))], [{ status: "paid", payment: { type: "charge", charge: { id: "ch_2" } } }]),
      invoice([line(at(60), at(90))], [{ status: "open", payment: { type: "payment_intent", payment_intent: "pi_3" } }]),
    ]);
    const charge = (id: string, intent: string | null) => ({ id, payment_intent: intent }) as unknown as StripeCharge;
    expect(chargePeriod(charge("ch_1", "pi_1"), periods)).toEqual(month);
    expect(chargePeriod(charge("ch_2", null), periods)).toEqual({ start: at(30), end: at(60) });
    expect(chargePeriod(charge("ch_3", "pi_3"), periods)).toBeNull();
    expect(chargePeriod(charge("ch_9", "pi_9"), periods)).toBeNull();
  });
});
