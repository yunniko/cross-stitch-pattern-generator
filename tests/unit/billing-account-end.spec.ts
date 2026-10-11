import { describe, expect, it } from "vitest";
import { DELETION_REFUSED, endSubscriptionsBeforeDeletion } from "../../lib/billing/account-end";
import { FakeBilling, FAKE_WEBHOOK_SECRET } from "../../lib/billing/fake";
import { MIN_TOKEN_LENGTH, reconcileRefusal } from "../../lib/billing/reconcile-access";

/** G-106 M2: account deletion ends the subscriptions at the provider first (Acceptance 7); who may start a reconciliation. */

async function subscribed() {
  const fake = new FakeBilling(FAKE_WEBHOOK_SECRET, "http://localhost:3000");
  const price = fake.addPrice({ amount: 1000, currency: "eur", interval: "MONTH", productName: "Personal" });
  const checkout = async (customerId: string | null) => {
    const { url } = await fake.startCheckout({
      priceId: price.id,
      userId: "user_1",
      email: "a@example.com",
      customerId,
      consentId: "consent_1",
      successUrl: "x",
      cancelUrl: "y",
    });
    return fake.completeCheckout(new URL(url).searchParams.get("session")!);
  };
  return { fake, checkout };
}

describe("ending subscriptions before an account is deleted", () => {
  it("cancels the stored subscription and a second one of the same customer, now", async () => {
    const { fake, checkout } = await subscribed();
    const first = await checkout(null);
    const second = await checkout(first.customerId);
    const stored = { status: "active", endedAt: null, stripeSubscriptionId: first.id, stripeCustomerId: first.customerId };
    const result = await endSubscriptionsBeforeDeletion(fake, stored);
    expect(result).toEqual({ ok: true, cancelled: [first.id, second.id] });
    expect(await fake.listSubscriptions(first.customerId)).toEqual([]);
  });

  it("refuses while the provider is unreachable, cancelling nothing", async () => {
    const { fake, checkout } = await subscribed();
    const first = await checkout(null);
    fake.unavailable = true;
    const stored = { status: "active", endedAt: null, stripeSubscriptionId: first.id, stripeCustomerId: first.customerId };
    expect(await endSubscriptionsBeforeDeletion(fake, stored)).toEqual({ ok: false, error: DELETION_REFUSED });
    fake.unavailable = false;
    expect(await fake.fetchSubscription(first.id)).toMatchObject({ status: "active", endedAt: null });
  });

  it("refuses with billing off only when a stored subscription is still open", async () => {
    const open = { status: "past_due", endedAt: null, stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1" };
    expect(await endSubscriptionsBeforeDeletion(null, open)).toEqual({ ok: false, error: DELETION_REFUSED });
    expect(await endSubscriptionsBeforeDeletion(null, { ...open, status: "canceled", endedAt: new Date() })).toEqual({
      ok: true,
      cancelled: [],
    });
    expect(await endSubscriptionsBeforeDeletion(null, null)).toEqual({ ok: true, cancelled: [] });
  });
});

describe("who may start the reconciliation", () => {
  const TOKEN = "t".repeat(MIN_TOKEN_LENGTH);
  const headers = (entries: Record<string, string>) => new Headers(entries);

  it("is off without a token long enough", () => {
    expect(reconcileRefusal(headers({}), undefined)?.status).toBe(404);
    expect(reconcileRefusal(headers({ authorization: "Bearer short" }), "short")?.status).toBe(404);
  });

  it("is the internal caller with the token, never a request through nginx", () => {
    expect(reconcileRefusal(headers({ authorization: `Bearer ${TOKEN}` }), TOKEN)).toBeNull();
    expect(reconcileRefusal(headers({ authorization: `Bearer ${TOKEN}`, "x-real-ip": "203.0.113.9" }), TOKEN)?.status).toBe(403);
    expect(reconcileRefusal(headers({ authorization: `Bearer ${"u".repeat(MIN_TOKEN_LENGTH)}` }), TOKEN)?.status).toBe(403);
    expect(reconcileRefusal(headers({}), TOKEN)?.status).toBe(403);
  });
});
