import { describe, expect, it } from "vitest";
import { MOVE_REFUSED, formatMoney, historyText, monthRange, moveRefusal, type StoredForMove } from "../../lib/billing/admin-view";
import { BillingUnavailableError } from "../../lib/billing/contract";
import { FakeBilling } from "../../lib/billing/fake";
import { FAKE_WEBHOOK_SECRET } from "../../lib/billing/settings";
import { handleWebhook, syncSubscription } from "../../lib/billing/sync";
import { MemoryBillingStore } from "./helpers/memory-billing-store";

/**
 * G-127 M2: what the admin reads of people's subscriptions (history in words, figures by month), and the fake's side of
 * the contract the admin's pages ask — payments, refunds, totals, counts, and moving a subscription to another price (D381).
 */

const T0 = new Date("2026-10-08T12:00:00Z");
const DAY = 24 * 3_600_000;
const POLICY = { graceDays: 14 };

describe("formatMoney", () => {
  it("reads an amount in the currency's minor unit", () => {
    expect(formatMoney(499, "eur")).toBe("€4.99");
    expect(formatMoney(12_000, "usd")).toBe("US$120.00");
    expect(formatMoney(0, "eur")).toBe("€0.00");
  });
});

describe("historyText", () => {
  const names = (id: string) => ({ row_old: "Personal €4.99 a month", row_new: "Personal €5.99 a month" })[id];

  it("names prices, shows ISO dates as days, and says each kind in words", () => {
    expect(historyText({ kind: "price", before: "row_old", after: "row_new" }, names)).toBe(
      "Price Personal €4.99 a month → Personal €5.99 a month"
    );
    expect(historyText({ kind: "price", before: "row_gone", after: null }, names)).toBe("Price row_gone → none");
    expect(historyText({ kind: "failure", before: null, after: "2026-10-08T12:00:00.000Z" }, names)).toMatch(
      /^A payment failed, first on .*2026/
    );
    expect(historyText({ kind: "failure", before: "2026-10-08T12:00:00.000Z", after: null }, names)).toBe("No payment failing any more");
    expect(historyText({ kind: "cancel", before: "false", after: "true" }, names)).toBe("Set to end at the period's end");
    expect(historyText({ kind: "replaced", before: "grant", after: "sub_1" }, names)).toBe("Took the place of a tier given by hand");
    expect(historyText({ kind: "refund-asked", before: null, after: "€4.99 of the payment of 8 Oct 2026 (ch_1)" }, names)).toBe(
      "Refund asked: €4.99 of the payment of 8 Oct 2026 (ch_1)"
    );
  });

  it("shows a kind it does not know as it is, rather than failing", () => {
    expect(historyText({ kind: "something-new", before: "a", after: null }, names)).toBe("something-new: a → none");
  });
});

describe("moveRefusal", () => {
  const good: StoredForMove = {
    kind: "stripe",
    status: "active",
    endedAt: null,
    firstFailedAt: null,
    stripeSubscriptionId: "sub_1",
    priceId: "row_old",
  };
  const target = { id: "row_new" };

  it("lets a subscription in good standing move to a different current price", () => {
    expect(moveRefusal(good, target)).toBeNull();
    expect(moveRefusal({ ...good, status: "trialing" }, target)).toBeNull();
  });

  it("refuses a tier given by hand, one failing or ended, one with no price, no target, or the same price", () => {
    expect(moveRefusal({ ...good, kind: "grant", stripeSubscriptionId: null }, target)).toBe(MOVE_REFUSED.notBought);
    expect(moveRefusal({ ...good, status: "past_due" }, target)).toBe(MOVE_REFUSED.standing);
    expect(moveRefusal({ ...good, firstFailedAt: T0 }, target)).toBe(MOVE_REFUSED.standing);
    expect(moveRefusal({ ...good, endedAt: T0, status: "canceled" }, target)).toBe(MOVE_REFUSED.standing);
    expect(moveRefusal({ ...good, priceId: null }, target)).toBe(MOVE_REFUSED.noPrice);
    expect(moveRefusal(good, null)).toBe(MOVE_REFUSED.noCurrent);
    expect(moveRefusal(good, { id: "row_old" })).toBe(MOVE_REFUSED.same);
  });
});

describe("monthRange", () => {
  it("is the UTC calendar month, and the one before across a year's turn", () => {
    expect(monthRange(T0)).toEqual({
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-11-01T00:00:00Z"),
      name: "October 2026",
    });
    const january = new Date("2027-01-01T00:30:00Z");
    expect(monthRange(january, -1)).toEqual({
      from: new Date("2026-12-01T00:00:00Z"),
      to: new Date("2027-01-01T00:00:00Z"),
      name: "December 2026",
    });
  });
});

function setUp() {
  let now = T0;
  const fake = new FakeBilling(FAKE_WEBHOOK_SECRET, "http://localhost:3000", () => now);
  const store = new MemoryBillingStore();
  store.clock = () => now;
  store.users.add("user_1");
  store.users.add("user_2");
  const old = fake.addPrice({ amount: 499, currency: "eur", interval: "MONTH", productName: "Personal" });
  const raised = fake.addPrice({ amount: 599, currency: "eur", interval: "MONTH", productName: "Personal" });
  store.prices.set(old.id, { id: "row_old", tierId: "tier_personal" });
  store.prices.set(raised.id, { id: "row_new", tierId: "tier_personal" });
  const clock = { now: () => now, move: (ms: number) => (now = new Date(now.getTime() + ms)) };
  const buy = async (userId: string) => {
    const { url } = await fake.startCheckout({
      priceId: old.id,
      userId,
      email: "a@example.com",
      customerId: null,
      consentId: "consent_1",
      successUrl: "x",
      cancelUrl: "y",
    });
    return fake.completeCheckout(new URL(url).searchParams.get("session")!);
  };
  const deliverAll = async () => {
    for (const event of fake.takeUndelivered()) {
      const { rawBody, signature } = fake.delivery(event);
      expect((await handleWebhook(fake, store, rawBody, signature, now, POLICY)).status).toBe(200);
    }
  };
  return { fake, store, old, raised, clock, buy, deliverAll };
}

describe("the fake's payments, as the admin's person page reads them", () => {
  it("lists a customer's payments newest first, with what each took", async () => {
    const { fake, clock, buy } = setUp();
    const bought = await buy("user_1");
    await buy("user_2");
    clock.move(30 * DAY);
    fake.endPeriod(bought.id, "paid");
    const payments = await fake.listPayments(bought.customerId);
    expect(payments.map((payment) => [payment.amount, payment.paidAt, payment.refunded, payment.disputed])).toEqual([
      [499, new Date(T0.getTime() + 30 * DAY), 0, false],
      [499, T0, 0, false],
    ]);
  });

  it("refunds a payment once for one request key, refuses a second refund of it, and tells the webhook", async () => {
    const { fake, store, buy, deliverAll } = setUp();
    const bought = await buy("user_1");
    await deliverAll();
    const [payment] = await fake.listPayments(bought.customerId);
    await fake.refundPayment(payment.id, "key_1");
    await fake.refundPayment(payment.id, "key_1");
    expect((await fake.listPayments(bought.customerId))[0].refunded).toBe(499);
    expect(fake.events.filter((event) => event.type === "charge.refunded")).toHaveLength(1);
    await expect(fake.refundPayment(payment.id, "key_2")).rejects.toThrow(/already refunded/);
    await deliverAll();
    expect(store.historyOf("user_1").map((entry) => entry.kind)).toContain("refund");
  });

  it("adds up a month's payments by currency, refunds included, and counts running subscriptions by status", async () => {
    const { fake, clock, buy } = setUp();
    const first = await buy("user_1");
    const second = await buy("user_2");
    await fake.refundPayment(fake.lastCharge(second.id), "key_1");
    clock.move(30 * DAY);
    fake.endPeriod(first.id, "failed");
    const october = monthRange(T0);
    expect(await fake.paymentTotals(october.from, october.to)).toEqual([{ currency: "eur", payments: 2, taken: 998, refunded: 499 }]);
    expect(await fake.paymentTotals(monthRange(T0, 1).from, monthRange(T0, 1).to)).toEqual([]);
    expect(await fake.countSubscriptions()).toEqual({ past_due: 1, active: 1 });
  });

  it("fails as an outage would when set unavailable", async () => {
    const { fake } = setUp();
    fake.unavailable = true;
    await expect(fake.paymentTotals(T0, T0)).rejects.toBeInstanceOf(BillingUnavailableError);
    await expect(fake.countSubscriptions()).rejects.toBeInstanceOf(BillingUnavailableError);
  });
});

describe("moving a subscription to the tier's current price (D381)", () => {
  it("records the new price at once, charges nothing now, and charges it at the next renewal", async () => {
    const { fake, store, raised, clock, buy, deliverAll } = setUp();
    const bought = await buy("user_1");
    await deliverAll();
    await fake.movePrice(bought.id, raised.id);
    await syncSubscription(fake, store, bought.id, {
      source: "admin",
      event: null,
      userIdHint: "user_1",
      policy: POLICY,
      now: clock.now(),
    });
    expect(store.row("user_1")?.priceId).toBe("row_new");
    expect(store.historyOf("user_1").find((entry) => entry.kind === "price")).toMatchObject({
      before: "row_old",
      after: "row_new",
      source: "admin",
    });
    expect(await fake.listPayments(bought.customerId)).toHaveLength(1);
    await deliverAll();
    clock.move(30 * DAY);
    fake.endPeriod(bought.id, "paid");
    expect((await fake.listPayments(bought.customerId))[0].amount).toBe(599);
  });
});
