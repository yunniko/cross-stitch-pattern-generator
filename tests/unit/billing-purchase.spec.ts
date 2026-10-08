import { describe, expect, it } from "vitest";
import { FakeBilling } from "../../lib/billing/fake";
import {
  CHECKOUT_REFUSED,
  checkoutRefusal,
  formatPrice,
  offeredTiers,
  planStatusLine,
  type PriceRow,
  type StoredForStatus,
} from "../../lib/billing/purchase";

const NOW = new Date("2026-10-08T12:00:00Z");
const DAY = 24 * 3_600_000;

describe("checkoutRefusal (G-106 M3)", () => {
  const open = { billingOn: true, buyingUsable: true, price: { current: true }, stored: null };

  it("lets Checkout start for a current price and no subscription", () => {
    expect(checkoutRefusal(open)).toBeNull();
  });

  it("refuses with billing off, buying not usable, or a price not current or missing", () => {
    expect(checkoutRefusal({ ...open, billingOn: false })).toBe(CHECKOUT_REFUSED.off);
    expect(checkoutRefusal({ ...open, buyingUsable: false })).toBe(CHECKOUT_REFUSED.hidden);
    expect(checkoutRefusal({ ...open, price: { current: false } })).toBe(CHECKOUT_REFUSED.price);
    expect(checkoutRefusal({ ...open, price: null })).toBe(CHECKOUT_REFUSED.price);
  });

  it("refuses while a subscription holds the place, and allows it once that one is final or ended", () => {
    for (const status of ["trialing", "active", "past_due"])
      expect(checkoutRefusal({ ...open, stored: { status, endedAt: null } })).toBe(CHECKOUT_REFUSED.live);
    for (const status of ["canceled", "incomplete_expired", "unpaid", "incomplete"])
      expect(checkoutRefusal({ ...open, stored: { status, endedAt: null } })).toBeNull();
    expect(checkoutRefusal({ ...open, stored: { status: "active", endedAt: NOW } })).toBeNull();
  });
});

describe("offeredTiers and formatPrice", () => {
  const row = (id: string, tierId: string, interval: "MONTH" | "YEAR", amount: number): PriceRow => ({
    id,
    tierId,
    tierName: tierId.toUpperCase(),
    interval,
    amount,
    currency: "eur",
  });

  it("groups by tier, keeps the newest per period, and sorts cheapest monthly first", () => {
    const tiers = offeredTiers([
      row("pro-m", "pro", "MONTH", 2000),
      row("per-m-new", "per", "MONTH", 1200),
      row("per-y", "per", "YEAR", 10000),
      row("per-m-old", "per", "MONTH", 1000),
      row("ent-y", "ent", "YEAR", 12000),
    ]);
    expect(tiers.map((tier) => tier.tierId)).toEqual(["ent", "per", "pro"]);
    expect(tiers[1].month?.id).toBe("per-m-new");
    expect(tiers[1].year?.id).toBe("per-y");
    expect(tiers[2].year).toBeNull();
  });

  it("formats from the minor unit, with the period", () => {
    expect(formatPrice({ amount: 1000, currency: "eur", interval: "MONTH" })).toBe("€10.00 a month");
    expect(formatPrice({ amount: 10000, currency: "eur", interval: "YEAR" })).toBe("€100.00 a year");
  });
});

describe("planStatusLine", () => {
  const stored = (patch: Partial<StoredForStatus>): StoredForStatus => ({
    status: "active",
    currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY),
    firstFailedAt: null,
    cancelAtPeriodEnd: false,
    ...patch,
  });

  it("says nothing without a subscription", () => {
    expect(planStatusLine(null, NOW)).toBeNull();
  });

  it("names the renewal, the end of a cancelled one, a trial and a failing payment", () => {
    expect(planStatusLine(stored({}), NOW)).toBe("Renews on 18 October 2026.");
    expect(planStatusLine(stored({ cancelAtPeriodEnd: true }), NOW)).toBe(
      "Cancelled: your plan lasts until 18 October 2026 and will not renew."
    );
    expect(planStatusLine(stored({ status: "trialing" }), NOW)).toBe("Trial until 18 October 2026.");
    expect(planStatusLine(stored({ status: "past_due", firstFailedAt: NOW }), NOW)).toMatch(/payment failed/);
  });

  it("explains each way to Free", () => {
    expect(planStatusLine(stored({ status: "canceled" }), NOW)).toBe("Your paid plan has ended.");
    expect(planStatusLine(stored({ status: "unpaid" }), NOW)).toMatch(/could not be paid/);
    expect(planStatusLine(stored({ status: "incomplete" }), NOW)).toMatch(/not complete yet/);
    expect(planStatusLine(stored({ status: "incomplete_expired" }), NOW)).toMatch(/did not start/);
    expect(planStatusLine(stored({ status: "paused" }), NOW)).toMatch(/paused/);
    expect(planStatusLine(stored({ currentPeriodEnd: new Date(NOW.getTime() - 5 * DAY) }), NOW)).toMatch(/not active/);
  });
});

describe("the fake on a local server (G-106 M3)", () => {
  const site = "http://localhost:30200";

  it("sells a price it finds through its resolver, and refuses one it cannot find or that is not current", async () => {
    const resolved: string[] = [];
    const fake = new FakeBilling(
      "whsec_test",
      site,
      () => NOW,
      async (id) => {
        resolved.push(id);
        if (id === "price_gone") return { id, active: false, amount: 500, currency: "eur", interval: "MONTH", productName: "Old" };
        return id === "price_db" ? { id, active: true, amount: 1000, currency: "eur", interval: "MONTH", productName: "Personal" } : null;
      }
    );
    const input = {
      priceId: "price_db",
      userId: "u1",
      email: "a@example.com",
      customerId: null,
      successUrl: `${site}/ok`,
      cancelUrl: `${site}/no`,
    };
    const { url } = await fake.startCheckout(input);
    const session = new URL(url).searchParams.get("session")!;
    expect(url.startsWith(`${site}/billing/fake-checkout?session=`)).toBe(true);
    expect(fake.openSession(session)?.price.productName).toBe("Personal");
    expect(fake.openSession("cs_none")).toBeUndefined();

    await fake.startCheckout(input);
    expect(resolved).toEqual(["price_db"]);
    await expect(fake.startCheckout({ ...input, priceId: "price_gone" })).rejects.toThrow(/no active price/);
    await expect(fake.startCheckout({ ...input, priceId: "price_none" })).rejects.toThrow(/no active price/);
  });

  it("hands each emitted event to the delivery once, oldest first, signed for now", async () => {
    const fake = new FakeBilling("whsec_test", site, () => NOW);
    const price = fake.addPrice({ amount: 1000, currency: "eur", interval: "MONTH", productName: "Personal" });
    const { url } = await fake.startCheckout({
      priceId: price.id,
      userId: "u1",
      email: "a@example.com",
      customerId: null,
      successUrl: "",
      cancelUrl: "",
    });
    const subscription = fake.completeCheckout(new URL(url).searchParams.get("session")!);
    expect(fake.takeUndelivered().map((event) => event.type)).toEqual([
      "checkout.session.completed",
      "customer.subscription.created",
      "invoice.paid",
    ]);
    expect(fake.takeUndelivered()).toEqual([]);
    await fake.cancelSubscription(subscription.id, { atPeriodEnd: true });
    const [update] = fake.takeUndelivered();
    expect(update.type).toBe("customer.subscription.updated");
    expect(fake.readEvent(update.rawBody, fake.delivery(update).signature).subscriptionId).toBe(subscription.id);
  });
});
