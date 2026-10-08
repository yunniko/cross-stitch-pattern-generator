import { describe, expect, it } from "vitest";
import { FakeBilling } from "../../lib/billing/fake";
import {
  CHECKOUT_REFUSED,
  checkoutRefusal,
  formatPrice,
  offeredTiers,
  paymentNotice,
  planStatusLine,
  safePayUrl,
  type PriceRow,
  type StoredForStatus,
} from "../../lib/billing/purchase";

const NOW = new Date("2026-10-08T12:00:00Z");
const DAY = 24 * 3_600_000;
const POLICY = { graceDays: 14 };

describe("checkoutRefusal (G-106 M3)", () => {
  const open = { billingOn: true, buyingUsable: true, price: { current: true }, stored: null, now: NOW };
  const bought = (status: string, endedAt: Date | null) => ({ kind: "stripe", status, currentPeriodEnd: null, endedAt });

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
      expect(checkoutRefusal({ ...open, stored: bought(status, null) })).toBe(CHECKOUT_REFUSED.live);
    for (const status of ["canceled", "incomplete_expired", "unpaid", "incomplete"])
      expect(checkoutRefusal({ ...open, stored: bought(status, null) })).toBeNull();
    expect(checkoutRefusal({ ...open, stored: bought("active", NOW) })).toBeNull();
  });

  it("refuses while a tier given by hand lasts, and allows it once the grant has ended or been taken back (D379)", () => {
    const grant = (status: string, days: number) => ({
      kind: "grant",
      status,
      currentPeriodEnd: new Date(NOW.getTime() + days * DAY),
      endedAt: null,
    });
    expect(checkoutRefusal({ ...open, stored: grant("active", 3) })).toBe(CHECKOUT_REFUSED.given);
    expect(checkoutRefusal({ ...open, stored: grant("active", -1) })).toBeNull();
    expect(checkoutRefusal({ ...open, stored: grant("canceled", 3) })).toBeNull();
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
    expect(planStatusLine(null, POLICY, NOW)).toBeNull();
  });

  it("names the renewal, the end of a cancelled one, a trial and a failing payment", () => {
    expect(planStatusLine(stored({}), POLICY, NOW)).toBe("Renews on 18 October 2026.");
    expect(planStatusLine(stored({ cancelAtPeriodEnd: true }), POLICY, NOW)).toBe(
      "Cancelled: your plan lasts until 18 October 2026 and will not renew."
    );
    expect(planStatusLine(stored({ status: "trialing" }), POLICY, NOW)).toBe("Trial until 18 October 2026.");
    expect(planStatusLine(stored({ status: "past_due", firstFailedAt: NOW }), POLICY, NOW)).toMatch(/payment failed/);
  });

  it("explains each way to Free", () => {
    expect(planStatusLine(stored({ status: "canceled" }), POLICY, NOW)).toBe("Your paid plan has ended.");
    expect(planStatusLine(stored({ status: "unpaid" }), POLICY, NOW)).toMatch(/could not be paid/);
    expect(planStatusLine(stored({ status: "incomplete" }), POLICY, NOW)).toMatch(/not complete yet/);
    expect(planStatusLine(stored({ status: "incomplete_expired" }), POLICY, NOW)).toMatch(/did not start/);
    expect(planStatusLine(stored({ status: "paused" }), POLICY, NOW)).toMatch(/paused/);
    expect(planStatusLine(stored({ currentPeriodEnd: new Date(NOW.getTime() - 5 * DAY) }), POLICY, NOW)).toMatch(/not active/);
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

describe("paymentNotice (G-126 M2)", () => {
  const failing = {
    status: "past_due",
    currentPeriodEnd: new Date(NOW.getTime() + 25 * DAY),
    firstFailedAt: new Date(NOW.getTime() - 5 * DAY),
    nextAttemptAt: new Date(NOW.getTime() + 2 * DAY),
    payUrl: "https://invoice.stripe.com/i/acct/test",
    actionNeeded: false,
  };

  it("says nothing while no payment fails", () => {
    expect(paymentNotice(null, POLICY, NOW)).toBeNull();
    expect(paymentNotice({ ...failing, status: "active", firstFailedAt: null }, POLICY, NOW)).toBeNull();
    expect(paymentNotice({ ...failing, status: "canceled" }, POLICY, NOW)).toBeNull();
  });

  it("names the grace's end, the next try and the way to pay while the plan is kept", () => {
    const notice = paymentNotice(failing, POLICY, NOW)!;
    expect(notice.tone).toBe("warning");
    expect(notice.lines.join(" ")).toBe(
      "A payment for your plan did not go through. The card will be tried again on 10 October 2026. To pay with another card, " +
        "use Manage billing. Your plan stays as it is until 17 October 2026. If it is still unpaid then, your account moves " +
        "to the free plan; your charts are kept."
    );
    expect(notice.pay).toEqual({ href: failing.payUrl, label: "Pay now" });
    expect(paymentNotice({ ...failing, nextAttemptAt: null }, POLICY, NOW)!.lines[0]).not.toMatch(/tried again/);
  });

  it("asks for the bank's check to be confirmed when the payment waits on it", () => {
    const notice = paymentNotice({ ...failing, actionNeeded: true }, POLICY, NOW)!;
    expect(notice.lines[0]).toMatch(/bank asks you to confirm/);
    expect(notice.pay?.label).toBe("Confirm the payment");
  });

  it("says the account is on Free and the charts are kept once the grace is over, or the retries end unpaid", () => {
    for (const stored of [
      { ...failing, firstFailedAt: new Date(NOW.getTime() - 14 * DAY) },
      { ...failing, status: "unpaid" },
    ]) {
      const notice = paymentNotice(stored, POLICY, NOW)!;
      expect(notice.tone).toBe("ended");
      expect(notice.lines.join(" ")).toMatch(/free plan.*charts are kept.*Paying the open invoice brings the plan back/);
      expect(notice.pay?.label).toBe("Pay the open invoice");
    }
    expect(paymentNotice({ ...failing, status: "unpaid", payUrl: null }, POLICY, NOW)!.lines.join(" ")).not.toMatch(/open invoice/);
  });

  it("links only to an https page, or the fake's on this machine", () => {
    expect(safePayUrl("https://invoice.stripe.com/i/x")).toBe("https://invoice.stripe.com/i/x");
    expect(safePayUrl("http://localhost:3000/billing/fake-portal?customer=c")).toBe("http://localhost:3000/billing/fake-portal?customer=c");
    for (const url of ["http://evil.example/x", "javascript:alert(1)", "not a url", "", null]) expect(safePayUrl(url)).toBeNull();
    expect(paymentNotice({ ...failing, payUrl: "javascript:alert(1)" }, POLICY, NOW)!.pay).toBeNull();
  });
});
