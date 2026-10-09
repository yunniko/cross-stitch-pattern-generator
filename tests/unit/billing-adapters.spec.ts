import { describe, expect, it } from "vitest";
import { BillingSignatureError, BillingUnavailableError } from "../../lib/billing/contract";
import { readEventObject } from "../../lib/billing/event-reference";
import { FakeBilling } from "../../lib/billing/fake";
import { FAKE_WEBHOOK_SECRET, billingSettings } from "../../lib/billing/settings";
import { signPayload, verifySignature } from "../../lib/billing/signature";
import { failingInvoice, invoicePaymentIntentId, priceFromStripe, snapshotFromStripe } from "../../lib/billing/stripe-mapping";

type StripeSubscription = Parameters<typeof snapshotFromStripe>[0];
type StripePrice = Parameters<typeof priceFromStripe>[0];

/**
 * G-106 M1: the billing contract's parts that need no network — the settings that choose an adapter, the signature
 * scheme, Stripe's objects read into the contract's, and the fake provider's life of a subscription. Stripe's objects
 * here are plain JSON shaped as the pinned API version shapes them (docs/reviews/2026-10-08-stripe-billing-reference.md).
 */

const T0 = new Date("2026-10-08T12:00:00Z");
const DAY = 24 * 3_600_000;
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

describe("billing settings", () => {
  const SITE = { AUTH_URL: "https://cross-stitch.example" };
  const STRIPE = { ...SITE, BILLING_GATEWAY: "stripe", STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc" };

  it("is off until an adapter is named", () => {
    expect(billingSettings({})).toEqual({ on: false, reason: "BILLING_GATEWAY is not set" });
    expect(billingSettings({ ...SITE, BILLING_GATEWAY: "" }).on).toBe(false);
    expect(billingSettings({ ...SITE, BILLING_GATEWAY: "paypal" })).toEqual({
      on: false,
      reason: 'BILLING_GATEWAY "paypal" is not an adapter',
    });
  });

  it("takes Stripe with a test key, a webhook secret and the site's address", () => {
    expect(billingSettings(STRIPE)).toEqual({
      on: true,
      gateway: "stripe",
      secretKey: "sk_test_abc",
      webhookSecret: "whsec_abc",
      siteUrl: "https://cross-stitch.example",
    });
    expect(billingSettings({ ...STRIPE, STRIPE_WEBHOOK_SECRET: "" }).on).toBe(false);
    expect(billingSettings({ ...STRIPE, STRIPE_SECRET_KEY: "pk_test_abc" }).on).toBe(false);
    expect(billingSettings({ ...STRIPE, AUTH_URL: "" }).on).toBe(false);
  });

  it("refuses a live key unless live mode is switched on (G-128)", () => {
    expect(billingSettings({ ...STRIPE, STRIPE_SECRET_KEY: "sk_live_abc" })).toEqual({
      on: false,
      reason: "STRIPE_SECRET_KEY is a live key and STRIPE_LIVE is not on",
    });
    expect(billingSettings({ ...STRIPE, STRIPE_SECRET_KEY: "rk_live_abc" }).on).toBe(false);
    expect(billingSettings({ ...STRIPE, STRIPE_SECRET_KEY: "sk_live_abc", STRIPE_LIVE: "on" }).on).toBe(true);
  });

  it("runs the fake only on this machine's address", () => {
    expect(billingSettings({ BILLING_GATEWAY: "fake", AUTH_URL: "http://localhost:3000" })).toEqual({
      on: true,
      gateway: "fake",
      webhookSecret: FAKE_WEBHOOK_SECRET,
      siteUrl: "http://localhost:3000",
    });
    expect(billingSettings({ BILLING_GATEWAY: "fake", APP_URL: "http://127.0.0.1:30200/" }).on).toBe(true);
    expect(billingSettings({ BILLING_GATEWAY: "fake", AUTH_URL: "https://cross-stitch.example" })).toEqual({
      on: false,
      reason: "the fake billing adapter runs only on a local address",
    });
    expect(billingSettings({ BILLING_GATEWAY: "fake", AUTH_URL: "http://localhost.evil.example" }).on).toBe(false);
  });
});

describe("the webhook signature (Stripe's scheme)", () => {
  const BODY = '{"id":"evt_1"}';
  const SECRET = "whsec_test";

  it("accepts its own signature within the tolerance", () => {
    expect(() => verifySignature(BODY, signPayload(BODY, SECRET, T0), SECRET, new Date(T0.getTime() + 299_000))).not.toThrow();
  });

  it("refuses a missing, malformed, wrong, tampered or stale one", () => {
    const good = signPayload(BODY, SECRET, T0);
    const refused = (body: string, header: string | null, secret = SECRET, now = T0) => {
      try {
        verifySignature(body, header, secret, now);
      } catch (error) {
        return error instanceof BillingSignatureError ? error.message : `not a signature error: ${String(error)}`;
      }
      return "accepted";
    };
    expect(refused(BODY, null)).toBe("no signature");
    expect(refused(BODY, "nonsense")).toBe("malformed signature");
    expect(refused(BODY, good, "whsec_other")).toBe("signature does not match");
    expect(refused('{"id":"evt_2"}', good)).toBe("signature does not match");
    expect(refused(BODY, good, SECRET, new Date(T0.getTime() + 301_000))).toBe("signature too old");
    // Only v1 counts: a v0 signature alone is not one.
    expect(refused(BODY, good.replace("v1=", "v0="))).toBe("malformed signature");
  });

  it("accepts a header carrying several v1 signatures, as during a secret's roll", () => {
    const good = signPayload(BODY, SECRET, T0);
    const other = signPayload(BODY, "whsec_old", T0).split(",")[1];
    expect(() => verifySignature(BODY, `${good.split(",")[0]},${other},${good.split(",")[1]}`, SECRET, T0)).not.toThrow();
  });
});

describe("the subscription an event concerns", () => {
  const event = (object: Record<string, unknown>) => ({ id: "evt_1", type: "x", data: { object } });

  it("is the subscription itself, an invoice's parent, or a Checkout session's", () => {
    expect(readEventObject(event({ object: "subscription", id: "sub_1", customer: "cus_1" }))).toEqual({
      id: "evt_1",
      type: "x",
      subscriptionId: "sub_1",
      customerId: "cus_1",
      userId: null,
      chargeId: null,
    });
    expect(
      readEventObject(
        event({ object: "invoice", id: "in_1", customer: "cus_1", parent: { subscription_details: { subscription: "sub_2" } } })
      ).subscriptionId
    ).toBe("sub_2");
    expect(
      readEventObject(
        event({ object: "checkout.session", customer: { id: "cus_3" }, subscription: "sub_3", client_reference_id: "user_1" })
      )
    ).toMatchObject({ subscriptionId: "sub_3", customerId: "cus_3", userId: "user_1" });
  });

  it("is no subscription for a dispute, which names its charge only, or a refunded charge, which names its customer too", () => {
    expect(readEventObject(event({ object: "dispute", id: "dp_1", charge: "ch_1" }))).toMatchObject({
      subscriptionId: null,
      customerId: null,
      chargeId: "ch_1",
    });
    expect(readEventObject(event({ object: "charge", id: "ch_2", customer: "cus_2" }))).toMatchObject({
      subscriptionId: null,
      customerId: "cus_2",
      chargeId: "ch_2",
    });
  });

  it("is none for an invoice outside a subscription, or an object of another kind", () => {
    expect(readEventObject(event({ object: "invoice", id: "in_1", parent: null })).subscriptionId).toBeNull();
    expect(readEventObject(event({ object: "charge", id: "ch_1" })).subscriptionId).toBeNull();
    expect(() => readEventObject({ nonsense: true })).toThrow("not an event");
  });
});

describe("Stripe's subscription read into the contract", () => {
  const periodEnd = new Date("2026-11-08T12:00:00Z");
  const stripeSubscription = (overrides: Record<string, unknown> = {}) =>
    ({
      id: "sub_1",
      object: "subscription",
      customer: "cus_1",
      status: "active",
      cancel_at_period_end: false,
      ended_at: null,
      start_date: seconds(T0),
      metadata: { userId: "user_1", consentId: "consent_1" },
      items: { data: [{ current_period_end: seconds(periodEnd), price: { id: "price_1" } }] },
      latest_invoice: { status: "paid", attempt_count: 1, created: seconds(T0), status_transitions: { finalized_at: seconds(T0) } },
      ...overrides,
    }) as unknown as StripeSubscription;

  it("takes the period's end from the item, not the subscription, and the start from the subscription's start date", () => {
    expect(snapshotFromStripe(stripeSubscription())).toEqual({
      id: "sub_1",
      customerId: "cus_1",
      status: "active",
      priceId: "price_1",
      startedAt: T0,
      scheduledPriceId: null,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      endedAt: null,
      firstFailedAt: null,
      nextAttemptAt: null,
      payUrl: null,
      actionNeeded: false,
      canceledFor: null,
      userId: "user_1",
      consentId: "consent_1",
    });
  });

  it("dates the failure from when the open invoice was finalized, and only while it is open with attempts made", () => {
    const failing = stripeSubscription({
      status: "past_due",
      latest_invoice: { status: "open", attempt_count: 2, created: seconds(T0) - 3600, status_transitions: { finalized_at: seconds(T0) } },
    });
    expect(snapshotFromStripe(failing).firstFailedAt).toEqual(T0);
    const notYetTried = stripeSubscription({
      latest_invoice: { status: "open", attempt_count: 0, created: seconds(T0), status_transitions: { finalized_at: seconds(T0) } },
    });
    expect(snapshotFromStripe(notYetTried).firstFailedAt).toBeNull();
    expect(snapshotFromStripe(stripeSubscription({ latest_invoice: "in_1" })).firstFailedAt).toBeNull();
  });

  it("reads a failing invoice's next try and payment page, and whether it waits on the person, only while it fails (G-126)", () => {
    const next = new Date(T0.getTime() + 3 * DAY);
    const invoice = (status: string) => ({
      status,
      attempt_count: 1,
      created: seconds(T0),
      status_transitions: { finalized_at: seconds(T0) },
      next_payment_attempt: seconds(next),
      hosted_invoice_url: "https://invoice.stripe.com/i/test",
      payments: {
        data: [
          { created: 1, payment: { type: "payment_intent", payment_intent: "pi_old" } },
          { created: 2, payment: { type: "payment_intent", payment_intent: { id: "pi_new" } } },
        ],
      },
    });
    const failing = stripeSubscription({ status: "past_due", latest_invoice: invoice("open") });
    expect(snapshotFromStripe(failing, true)).toMatchObject({
      nextAttemptAt: next,
      payUrl: "https://invoice.stripe.com/i/test",
      actionNeeded: true,
    });
    expect(snapshotFromStripe(failing).actionNeeded).toBe(false);
    expect(invoicePaymentIntentId(failingInvoice(failing)!)).toBe("pi_new");
    const paid = stripeSubscription({ latest_invoice: invoice("paid") });
    expect(snapshotFromStripe(paid, true)).toMatchObject({ nextAttemptAt: null, payUrl: null, actionNeeded: false });
    expect(failingInvoice(paid)).toBeNull();
  });

  it("tells an end the person asked for from one a failed payment brought, and nothing else", () => {
    const ended = (reason: string | null, status = "canceled") =>
      snapshotFromStripe(stripeSubscription({ status, cancellation_details: { reason } })).canceledFor;
    expect(ended("cancellation_requested")).toBe("request");
    expect(ended("payment_failed")).toBe("payment");
    expect(ended("payment_disputed")).toBeNull();
    expect(ended(null)).toBeNull();
    expect(ended("payment_failed", "active")).toBeNull();
  });

  it("reads an expanded customer, an end, a cancellation at the period's end, and missing metadata", () => {
    const ended = stripeSubscription({
      customer: { id: "cus_9" },
      status: "canceled",
      ended_at: seconds(T0),
      cancel_at_period_end: true,
      metadata: {},
      items: { data: [] },
    });
    expect(snapshotFromStripe(ended)).toMatchObject({
      customerId: "cus_9",
      endedAt: T0,
      cancelAtPeriodEnd: true,
      userId: null,
      consentId: null,
      priceId: null,
      currentPeriodEnd: null,
    });
  });

  it("reads a price's interval only when it recurs every month or every year", () => {
    const price = (recurring: unknown, product: unknown = { id: "prod_1", name: "Personal" }) =>
      priceFromStripe({ id: "price_1", active: true, unit_amount: 1000, currency: "eur", recurring, product } as unknown as StripePrice);
    expect(price({ interval: "month", interval_count: 1 })).toEqual({
      id: "price_1",
      active: true,
      amount: 1000,
      currency: "eur",
      interval: "MONTH",
      productName: "Personal",
    });
    expect(price({ interval: "year", interval_count: 1 }).interval).toBe("YEAR");
    expect(price({ interval: "month", interval_count: 3 }).interval).toBeNull();
    expect(price(null).interval).toBeNull();
    expect(price({ interval: "month", interval_count: 1 }, "prod_1").productName).toBeNull();
  });
});

describe("the fake provider", () => {
  const setUp = () => {
    let now = T0;
    const fake = new FakeBilling(FAKE_WEBHOOK_SECRET, "http://localhost:3000", () => now);
    const price = fake.addPrice({ amount: 1000, currency: "eur", interval: "MONTH", productName: "Personal" });
    const move = (ms: number) => (now = new Date(now.getTime() + ms));
    return { fake, price, move };
  };

  const subscribe = async (fake: FakeBilling, priceId: string) => {
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
  };

  it("emits signed events the webhook can read, naming the subscription", async () => {
    const { fake, price } = setUp();
    const subscription = await subscribe(fake, price.id);
    expect(fake.events.map((event) => event.type)).toEqual(["checkout.session.completed", "customer.subscription.created", "invoice.paid"]);
    for (const event of fake.events) {
      const read = fake.readEvent(event.rawBody, event.signature);
      expect(read).toMatchObject({ id: event.id, type: event.type, subscriptionId: subscription.id, customerId: subscription.customerId });
    }
    expect(fake.readEvent(fake.events[0].rawBody, fake.events[0].signature).userId).toBe("user_1");
    expect(() => fake.readEvent(fake.events[0].rawBody, fake.events[1].signature)).toThrow(BillingSignatureError);
  });

  it("moves the period on at a renewal, paid or not, and keeps the first failure's date across retries", async () => {
    const { fake, price, move } = setUp();
    const { id } = await subscribe(fake, price.id);
    move(30 * DAY);
    expect(fake.endPeriod(id, "paid")).toMatchObject({ status: "active", currentPeriodEnd: new Date(T0.getTime() + 60 * DAY) });
    move(30 * DAY);
    const failedAt = new Date(T0.getTime() + 60 * DAY);
    expect(fake.endPeriod(id, "failed")).toMatchObject({
      status: "past_due",
      currentPeriodEnd: new Date(T0.getTime() + 90 * DAY),
      firstFailedAt: failedAt,
    });
    move(3 * DAY);
    expect(fake.fail(id).firstFailedAt).toEqual(failedAt);
    expect(fake.pay(id)).toMatchObject({ status: "active", firstFailedAt: null });
  });

  it("ends a subscription cancelled at the period's end when the period ends", async () => {
    const { fake, price, move } = setUp();
    const { id } = await subscribe(fake, price.id);
    expect(await fake.cancelSubscription(id, { atPeriodEnd: true })).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
    move(30 * DAY);
    const ended = fake.endPeriod(id, "paid");
    expect(ended).toMatchObject({ status: "canceled", endedAt: new Date(T0.getTime() + 30 * DAY) });
    expect(await fake.listSubscriptions(ended.customerId)).toEqual([]);
  });

  it("fails every call while set unavailable, and knows no subscription it never made", async () => {
    const { fake } = setUp();
    expect(await fake.fetchSubscription("sub_none")).toBeNull();
    fake.unavailable = true;
    await expect(fake.fetchSubscription("sub_none")).rejects.toBeInstanceOf(BillingUnavailableError);
    await expect(fake.listPrices()).rejects.toBeInstanceOf(BillingUnavailableError);
  });
});
