import { describe, expect, it } from "vitest";
import { MAX_PRICE, TIER_DELETE_REFUSED, parseAmount, pricesRetiredBy, tierDeleteRefusal } from "../../lib/billing/catalog";
import { entitlement } from "../../lib/billing/entitlement";
import { FakeBilling, FAKE_WEBHOOK_SECRET } from "../../lib/billing/fake";
import { GRANT_REFUSED, endedGrantRow, grantRefusal, grantRow, parseGrantEnd } from "../../lib/billing/grants";
import { planStatusLine } from "../../lib/billing/purchase";
import type { StoredSubscription } from "../../lib/billing/sync";

/**
 * G-127 M1: the admin's prices (D380) and tiers given by hand (D379). A grant gives its tier until exactly its end, with
 * no allowance for a late record since nothing reports it; it cannot be made over a bought subscription that may still
 * charge; ending it keeps the row as the record.
 */

const NOW = new Date("2026-10-08T12:00:00Z");
const DAY = 24 * 3_600_000;
const POLICY = { graceDays: 14 };

const given = (until: Date): StoredSubscription => ({
  id: "row_1",
  ...grantRow(null, { userId: "user_1", tierId: "tier_1", tierName: "Personal", until }).fields,
});

const bought = (status: string, endedAt: Date | null = null): StoredSubscription => ({
  ...given(new Date(NOW.getTime() + 30 * DAY)),
  kind: "stripe",
  stripeSubscriptionId: "sub_1",
  stripeCustomerId: "cus_1",
  status,
  endedAt,
});

describe("what a tier given by hand gives", () => {
  const until = new Date("2026-11-08T00:00:00Z");
  it("gives the tier until the instant it ends, and Free from then on", () => {
    expect(entitlement(given(until), POLICY, NOW)).toEqual({ tier: true, until, status: "active" });
    expect(entitlement(given(until), POLICY, new Date(until.getTime() - 1000)).tier).toBe(true);
    expect(entitlement(given(until), POLICY, until)).toMatchObject({ tier: false, reason: "given-ended" });
  });

  it("gives Free once ended early, and says so on the plan page", () => {
    const ended = endedGrantRow(given(until), NOW)!;
    const row = { id: "row_1", ...ended.fields };
    expect(row).toMatchObject({ kind: "grant", status: "canceled", endedAt: NOW });
    expect(entitlement(row, POLICY, NOW)).toMatchObject({ tier: false, reason: "given-ended" });
    expect(planStatusLine(row, POLICY, NOW)).toBe("The plan the site gave you has ended.");
    expect(planStatusLine(given(until), POLICY, NOW)).toMatch(/^Given to you by the site until 8 November 2026\.$/);
  });
});

describe("making and ending a grant", () => {
  it("reads the end as the start of that day in UTC, after today and at most five years ahead", () => {
    expect(parseGrantEnd("2026-11-08", NOW)).toEqual({ until: new Date("2026-11-08T00:00:00Z") });
    expect(parseGrantEnd(" 2026-11-08 ", NOW)).toEqual({ until: new Date("2026-11-08T00:00:00Z") });
    expect(parseGrantEnd("2026-10-08", NOW)).toEqual({ error: GRANT_REFUSED.past });
    expect(parseGrantEnd("2036-10-08", NOW)).toEqual({ error: GRANT_REFUSED.far });
    for (const bad of ["", "8.11.2026", "2026-02-30", "2026-13-01", "2026-1-8"])
      expect(parseGrantEnd(bad, NOW)).toEqual({ error: GRANT_REFUSED.date });
  });

  it("is refused over a bought subscription that may still charge, and allowed over a grant or one that has ended", () => {
    expect(grantRefusal(null)).toBeNull();
    expect(grantRefusal(given(new Date(NOW.getTime() + DAY)))).toBeNull();
    for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"])
      expect(grantRefusal(bought(status))).toBe(GRANT_REFUSED.bought);
    expect(grantRefusal(bought("canceled", NOW))).toBeNull();
    expect(grantRefusal(bought("incomplete_expired", NOW))).toBeNull();
  });

  it("writes a row without provider ids, keeping the provider's customer, and a history line naming what it replaced", () => {
    const until = new Date("2026-12-01T00:00:00Z");
    const over = grantRow(bought("canceled", NOW), { userId: "user_1", tierId: "tier_2", tierName: "Studio", until });
    expect(over.fields).toMatchObject({
      kind: "grant",
      tierId: "tier_2",
      priceId: null,
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: null,
      currentPeriodEnd: until,
      endedAt: null,
      firstFailedAt: null,
    });
    expect(over.history).toEqual([{ kind: "granted", before: null, after: "Studio until 1 December 2026" }]);
    const again = grantRow(given(new Date("2026-11-08T00:00:00Z")), { userId: "user_1", tierId: "tier_2", tierName: "Studio", until });
    expect(again.history[0].before).toBe("given until 8 November 2026");
  });

  it("ends only a grant that still lasts", () => {
    const lasting = given(new Date(NOW.getTime() + DAY));
    expect(endedGrantRow(lasting, NOW)!.history).toEqual([
      { kind: "grant-ended", before: "given until 9 October 2026", after: "ended 8 October 2026" },
    ]);
    expect(endedGrantRow(given(NOW), NOW)).toBeNull();
    expect(endedGrantRow(bought("active"), NOW)).toBeNull();
    const ended = { id: "row_1", ...endedGrantRow(lasting, NOW)!.fields };
    expect(endedGrantRow(ended, NOW)).toBeNull();
  });
});

describe("the admin's prices", () => {
  it("reads an amount as typed into cents, and refuses what is not a price", () => {
    expect(parseAmount("4.99")).toEqual({ amount: 499 });
    expect(parseAmount("4,9")).toEqual({ amount: 490 });
    expect(parseAmount(" 12 ")).toEqual({ amount: 1200 });
    expect(parseAmount("0.01")).toEqual({ amount: 1 });
    expect(parseAmount(String(MAX_PRICE))).toEqual({ amount: MAX_PRICE * 100 });
    expect(parseAmount("0")).toEqual({ error: "A price is more than zero." });
    expect(parseAmount("10000.01")).toMatchObject({ error: expect.stringMatching(/at most/) });
    for (const bad of ["", "abc", "-5", "4.999", "1e3", "4.99 EUR", "1,000.00"])
      expect(parseAmount(bad)).toEqual({ error: "Enter an amount such as 4.99." });
  });

  it("retires every other current price of the same tier and period, and nothing else", () => {
    const prices = [
      { id: "a", tierId: "t1", interval: "MONTH" as const, current: true },
      { id: "b", tierId: "t1", interval: "MONTH" as const, current: false },
      { id: "c", tierId: "t1", interval: "YEAR" as const, current: true },
      { id: "d", tierId: "t2", interval: "MONTH" as const, current: true },
      { id: "e", tierId: "t1", interval: "MONTH" as const, current: true },
    ];
    expect(pricesRetiredBy(prices, { id: "e", tierId: "t1", interval: "MONTH" })).toEqual(["a"]);
    expect(pricesRetiredBy(prices, { tierId: "t1", interval: "MONTH" })).toEqual(["a", "e"]);
  });

  it("are made once per form at the provider, the product made with the first and reused after, and can be withdrawn", async () => {
    const fake = new FakeBilling(FAKE_WEBHOOK_SECRET, "http://localhost:3000", () => NOW);
    const input = {
      productId: null,
      productName: "Personal",
      tierId: "tier_1",
      amount: 499,
      currency: "eur",
      interval: "MONTH" as const,
      requestKey: "key-0001",
    };
    const first = await fake.createPrice(input);
    expect(await fake.createPrice(input)).toEqual(first);
    const second = await fake.createPrice({ ...input, productId: first.productId, amount: 599, requestKey: "key-0002" });
    expect(second.productId).toBe(first.productId);
    expect(second.priceId).not.toBe(first.priceId);
    await fake.setPriceActive(first.priceId, false);
    const listed = await fake.listPrices();
    expect(listed.find((price) => price.id === first.priceId)).toMatchObject({ active: false, amount: 499 });
    expect(listed.find((price) => price.id === second.priceId)).toMatchObject({ active: true, amount: 599, productName: "Personal" });
  });
});

describe("deleting a tier (D382)", () => {
  it("is refused once anyone has had the tier, and while a price of it is offered", () => {
    expect(tierDeleteRefusal({ subscriptions: 0, offeredPrices: 0 })).toBeNull();
    expect(tierDeleteRefusal({ subscriptions: 1, offeredPrices: 0 })).toBe(TIER_DELETE_REFUSED.people);
    expect(tierDeleteRefusal({ subscriptions: 1, offeredPrices: 2 })).toBe(TIER_DELETE_REFUSED.people);
    expect(tierDeleteRefusal({ subscriptions: 0, offeredPrices: 1 })).toBe(TIER_DELETE_REFUSED.offered);
  });

  it("asks the provider whether any subscription, ended or not, is on a price", async () => {
    const fake = new FakeBilling(FAKE_WEBHOOK_SECRET, "http://localhost:3000");
    const sold = fake.addPrice({ amount: 500, currency: "eur", interval: "MONTH", productName: "Personal" });
    const unsold = fake.addPrice({ amount: 700, currency: "eur", interval: "MONTH", productName: "Personal" });
    const { url } = await fake.startCheckout({
      priceId: sold.id,
      userId: "user_1",
      email: "a@example.com",
      customerId: null,
      consentId: "consent_1",
      successUrl: "x",
      cancelUrl: "y",
    });
    const bought = fake.completeCheckout(new URL(url).searchParams.get("session")!);
    await fake.cancelSubscription(bought.id, { atPeriodEnd: false });
    expect(await fake.priceInUse(sold.id)).toBe(true);
    expect(await fake.priceInUse(unsold.id)).toBe(false);
  });
});
