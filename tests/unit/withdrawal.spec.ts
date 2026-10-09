import { describe, expect, it } from "vitest";
import type { ProviderPayment } from "../../lib/billing/contract";
import { FakeBilling } from "../../lib/billing/fake";
import { FAKE_WEBHOOK_SECRET } from "../../lib/billing/settings";
import {
  deadlineLine,
  formatMoment,
  readRefunds,
  refundTotal,
  withdrawalAcknowledgment,
  withdrawalDeadline,
  withdrawalOpenUntil,
  withdrawalRefunds,
} from "../../lib/billing/withdrawal";

/**
 * G-129 M2 (D387): the 14 days of a consumer's withdrawal, counted in Prague days from the day after the purchase; who
 * has the right; and what a withdrawal gives back of each payment made since the subscription began.
 */

const DAY = 24 * 3_600_000;
const T0 = new Date("2026-10-01T10:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);

describe("withdrawalDeadline", () => {
  it("ends with the 14th day after the day of purchase, in Prague", () => {
    // 1 October, 12:00 in Prague: the right ends as 16 October begins there (22:00 UTC, summer time).
    expect(withdrawalDeadline(T0)).toEqual(new Date("2026-10-15T22:00:00Z"));
    // A minute before midnight, and at midnight: the day of purchase is whichever Prague day it was.
    expect(withdrawalDeadline(new Date("2026-10-01T21:59:00Z"))).toEqual(new Date("2026-10-15T22:00:00Z"));
    expect(withdrawalDeadline(new Date("2026-10-01T22:00:00Z"))).toEqual(new Date("2026-10-16T22:00:00Z"));
  });

  it("follows the clock change: bought in summer time, it ends at a winter-time midnight", () => {
    // 21 October, 01:30 in Prague: ends as 5 November begins, an hour later in UTC than in summer.
    expect(withdrawalDeadline(new Date("2026-10-20T23:30:00Z"))).toEqual(new Date("2026-11-04T23:00:00Z"));
  });

  it("is said as the last day, in words", () => {
    expect(deadlineLine(withdrawalDeadline(T0))).toBe(
      "You can withdraw from this contract until the end of 15 October 2026 (Prague time)."
    );
    expect(formatMoment(T0)).toBe("1 October 2026, 12:00 Prague time");
  });
});

describe("withdrawalOpenUntil", () => {
  const bought = { kind: "stripe", status: "active", endedAt: null, startedAt: T0, stripeSubscriptionId: "sub_1" };
  const deadline = new Date("2026-10-15T22:00:00Z");

  it("is open to the last moment of the 14th day, and closed from the 15th", () => {
    expect(withdrawalOpenUntil(bought, at(0))).toEqual(deadline);
    expect(withdrawalOpenUntil(bought, new Date(deadline.getTime() - 1))).toEqual(deadline);
    expect(withdrawalOpenUntil(bought, deadline)).toBeNull();
    expect(withdrawalOpenUntil(bought, at(15))).toBeNull();
  });

  it("is open while a payment fails, as the contract still stands", () => {
    expect(withdrawalOpenUntil({ ...bought, status: "past_due" }, at(1))).toEqual(deadline);
  });

  it("is closed for no subscription, an ended one, a tier given by hand, or a start not known", () => {
    expect(withdrawalOpenUntil(null, at(1))).toBeNull();
    expect(withdrawalOpenUntil({ ...bought, status: "canceled", endedAt: at(1) }, at(1))).toBeNull();
    expect(withdrawalOpenUntil({ ...bought, kind: "grant", stripeSubscriptionId: null }, at(1))).toBeNull();
    expect(withdrawalOpenUntil({ ...bought, startedAt: null }, at(1))).toBeNull();
  });
});

describe("withdrawalRefunds", () => {
  const month = { start: T0, end: at(30) };
  const payment = (overrides: Partial<ProviderPayment>): ProviderPayment => ({
    id: "ch_1",
    amount: 1000,
    currency: "eur",
    paidAt: T0,
    refunded: 0,
    disputed: false,
    period: month,
    ...overrides,
  });

  it("gives back each payment's unused part, rounded up to the cent", () => {
    // Day 3 of 30: 27/30 of €10.00.
    expect(withdrawalRefunds([payment({})], T0, at(3))).toEqual([{ paymentId: "ch_1", amount: 900, currency: "eur" }]);
    // A few seconds in: the whole of it, rounded up.
    expect(withdrawalRefunds([payment({})], T0, new Date(T0.getTime() + 5000))).toEqual([
      { paymentId: "ch_1", amount: 1000, currency: "eur" },
    ]);
  });

  it("leaves out payments from before the subscription began, and any with nothing to give back", () => {
    const older = payment({ id: "ch_0", paidAt: at(-40), period: { start: at(-40), end: at(-10) } });
    const refundedAlready = payment({ id: "ch_2", refunded: 1000 });
    expect(withdrawalRefunds([payment({}), older, refundedAlready], T0, at(3))).toEqual([
      { paymentId: "ch_1", amount: 900, currency: "eur" },
    ]);
  });

  it("gives back the whole of what is left of a payment whose period the provider did not say", () => {
    expect(withdrawalRefunds([payment({ period: null, refunded: 100 })], T0, at(3))).toEqual([
      { paymentId: "ch_1", amount: 900, currency: "eur" },
    ]);
  });
});

describe("the acknowledgment", () => {
  it("says when the withdrawal was received, that the plan has ended, and what is given back", () => {
    const lines = withdrawalAcknowledgment({
      requestedAt: T0,
      refunds: [{ paymentId: "ch_1", amount: 900, currency: "eur" }],
      completedAt: T0,
    });
    expect(lines[0]).toBe("We received your withdrawal from the contract on 1 October 2026, 12:00 Prague time.");
    expect(lines[1]).toContain("Your plan has ended");
    expect(lines[2]).toContain("€9.00 is given back to the card you paid with");
  });

  it("says when a withdrawal is not finished, and when nothing was left to give back", () => {
    const lines = withdrawalAcknowledgment({ requestedAt: T0, refunds: [], completedAt: null });
    expect(lines[1]).toContain("Press Finish withdrawal");
    expect(lines[2]).toBe("Nothing was left of your payments to give back.");
  });

  it("adds up the refunds by currency", () => {
    expect(
      refundTotal([
        { paymentId: "a", amount: 500, currency: "eur" },
        { paymentId: "b", amount: 400, currency: "eur" },
        { paymentId: "c", amount: 200, currency: "gbp" },
      ])
    ).toBe("€9.00 and £2.00");
  });
});

describe("readRefunds", () => {
  it("reads the stored list and refuses any other shape", () => {
    const refunds = [{ paymentId: "ch_1", amount: 900, currency: "eur" }];
    expect(readRefunds(JSON.parse(JSON.stringify(refunds)))).toEqual(refunds);
    expect(() => readRefunds({})).toThrow(/not a list/);
    expect(() => readRefunds([{ paymentId: "ch_1", amount: 9.5, currency: "eur" }])).toThrow(/malformed/);
  });
});

describe("the fake begun days ago", () => {
  it("moves the start, the period and the charge back together, so day 3 gives back 27/30", async () => {
    let now = at(0);
    const fake = new FakeBilling(FAKE_WEBHOOK_SECRET, "http://localhost:3000", () => now);
    const price = fake.addPrice({ amount: 1000, currency: "eur", interval: "MONTH", productName: "Personal" });
    const { url } = await fake.startCheckout({
      priceId: price.id,
      userId: "user_1",
      email: "a@example.com",
      customerId: null,
      consentId: "consent_1",
      successUrl: "x",
      cancelUrl: "y",
    });
    const started = fake.completeCheckout(new URL(url).searchParams.get("session")!);
    expect(started.startedAt).toEqual(T0);
    now = at(0);
    const moved = fake.backdateStart(started.id, 3);
    expect(moved.startedAt).toEqual(at(-3));
    expect(moved.currentPeriodEnd).toEqual(at(27));
    const payments = await fake.listPayments(started.customerId);
    expect(payments[0].period).toEqual({ start: at(-3), end: at(27) });
    expect(withdrawalRefunds(payments, moved.startedAt!, now)).toEqual([{ paymentId: payments[0].id, amount: 900, currency: "eur" }]);
  });
});
