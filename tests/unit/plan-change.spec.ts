import { describe, expect, it } from "vitest";
import { historyText } from "../../lib/billing/admin-view";
import { FakeBilling, type SignedEvent } from "../../lib/billing/fake";
import {
  CANCEL_REFUSED,
  CHANGE_REFUSED,
  cancelRefusal,
  changeKind,
  changeRefusal,
  targetRefusal,
  type PlanSubject,
} from "../../lib/billing/plan-change";
import { FAKE_WEBHOOK_SECRET } from "../../lib/billing/settings";
import { scheduledPrice, snapshotFromStripe } from "../../lib/billing/stripe-mapping";
import { handleWebhook, syncSubscription } from "../../lib/billing/sync";
import { MemoryBillingStore } from "./helpers/memory-billing-store";

type StripeSubscription = Parameters<typeof snapshotFromStripe>[0];

/**
 * G-129 M3 (D388): a plan held is changed from the Plan page — more at once, with the difference for the rest of the
 * period charged; less at the next renewal, with nothing charged now — cancelled at the period's end, and kept. The
 * rules alone; the fake provider learning both kinds of change; the sync storing a change waiting for the renewal; and
 * Stripe's schedule read into the contract.
 */

const T0 = new Date("2026-10-01T00:00:00Z");
const DAY = 24 * 3_600_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);

const month = (amount: number) => ({ amount, currency: "eur", interval: "MONTH" as const });
const year = (amount: number) => ({ amount, currency: "eur", interval: "YEAR" as const });

describe("changeKind", () => {
  it("starts more now: a dearer price for the same period, or a longer period", () => {
    expect(changeKind(month(1000), month(2000))).toBe("now");
    expect(changeKind(month(1000), year(10000))).toBe("now");
    // A longer period counts as more even when its price is lower than the month's.
    expect(changeKind(month(2000), year(1000))).toBe("now");
  });

  it("starts less at the renewal: a cheaper price, the same amount, or a shorter period", () => {
    expect(changeKind(month(2000), month(1000))).toBe("renewal");
    expect(changeKind(month(1000), month(1000))).toBe("renewal");
    expect(changeKind(year(10000), month(2000))).toBe("renewal");
  });
});

describe("who may change or cancel", () => {
  const held: PlanSubject = { kind: "stripe", status: "active", endedAt: null, cancelAtPeriodEnd: false, stripeSubscriptionId: "sub_1" };

  it("changes a plan in good standing, and nothing else", () => {
    expect(changeRefusal(held)).toBeNull();
    expect(changeRefusal({ ...held, status: "trialing" })).toBeNull();
    expect(changeRefusal(null)).toBe(CHANGE_REFUSED.none);
    expect(changeRefusal({ ...held, kind: "grant", stripeSubscriptionId: null })).toBe(CHANGE_REFUSED.given);
    expect(changeRefusal({ ...held, status: "canceled", endedAt: at(1) })).toBe(CHANGE_REFUSED.ended);
    expect(changeRefusal({ ...held, cancelAtPeriodEnd: true })).toBe(CHANGE_REFUSED.ending);
  });

  it("refuses a change while a payment is failing or not complete, and says to pay it first", () => {
    for (const status of ["past_due", "unpaid", "incomplete", "paused"])
      expect(changeRefusal({ ...held, status })).toBe(CHANGE_REFUSED.failing);
  });

  it("cancels while a payment fails, but not a plan given by hand or one ended", () => {
    expect(cancelRefusal(held)).toBeNull();
    expect(cancelRefusal({ ...held, status: "past_due" })).toBeNull();
    expect(cancelRefusal({ ...held, kind: "grant", stripeSubscriptionId: null })).toBe(CANCEL_REFUSED.given);
    expect(cancelRefusal({ ...held, status: "canceled", endedAt: at(1) })).toBe(CANCEL_REFUSED.ended);
    expect(cancelRefusal(null)).toBe(CANCEL_REFUSED.none);
  });

  it("moves only to a price on sale, in the same currency", () => {
    expect(targetRefusal(month(1000), { ...month(2000), current: true })).toBeNull();
    expect(targetRefusal(month(1000), { ...month(2000), current: false })).toBe(CHANGE_REFUSED.price);
    expect(targetRefusal(month(1000), null)).toBe(CHANGE_REFUSED.price);
    expect(targetRefusal(month(1000), { ...month(2000), currency: "gbp", current: true })).toBe(CHANGE_REFUSED.currency);
  });
});

function bought() {
  let now = T0;
  const fake = new FakeBilling(FAKE_WEBHOOK_SECRET, "http://localhost:3000", () => now);
  const personal = fake.addPrice({ ...month(1000), productName: "Personal" });
  const pro = fake.addPrice({ ...month(2000), productName: "Pro" });
  const proYear = fake.addPrice({ ...year(10000), productName: "Pro" });
  const move = (days: number) => (now = at(days));
  const buy = async () => {
    const { url } = await fake.startCheckout({
      priceId: personal.id,
      userId: "user_1",
      email: "a@example.com",
      customerId: null,
      consentId: "consent_1",
      successUrl: "x",
      cancelUrl: "y",
    });
    return fake.completeCheckout(new URL(url).searchParams.get("session")!);
  };
  return { fake, personal, pro, proYear, move, buy };
}

describe("the fake's change made now", () => {
  it("charges the difference for the rest of the period, and keeps the period", async () => {
    const { fake, pro, move, buy } = bought();
    const subscription = await buy();
    move(10);
    expect(await fake.changePlan(subscription.id, pro.id, "now")).toEqual({ applied: true });
    const after = (await fake.fetchSubscription(subscription.id))!;
    expect(after.priceId).toBe(pro.id);
    expect(after.currentPeriodEnd).toEqual(at(30));
    // 20 of 30 days left: €20.00 × 2/3 rounded down, less €10.00 × 2/3 rounded up = 1333 − 667.
    const [difference] = await fake.listPayments(subscription.customerId);
    expect(difference.amount).toBe(666);
    expect(difference.period).toEqual({ start: at(10), end: at(30) });
  });

  it("starts a new period on a longer one, charging its price less the unused part of the old", async () => {
    const { fake, proYear, move, buy } = bought();
    const subscription = await buy();
    move(10);
    await fake.changePlan(subscription.id, proYear.id, "now");
    const after = (await fake.fetchSubscription(subscription.id))!;
    expect(after.currentPeriodEnd).toEqual(at(10 + 365));
    const [difference] = await fake.listPayments(subscription.customerId);
    expect(difference.amount).toBe(10000 - 667);
    // The next renewal charges the year's price whole.
    move(375);
    fake.endPeriod(subscription.id, "paid");
    expect((await fake.listPayments(subscription.customerId))[0].amount).toBe(10000);
  });

  it("leaves the plan as it was when the card declines the difference", async () => {
    const { fake, pro, move, buy, personal } = bought();
    const subscription = await buy();
    move(10);
    fake.declineChanges = true;
    expect(await fake.changePlan(subscription.id, pro.id, "now")).toEqual({ applied: false });
    expect((await fake.fetchSubscription(subscription.id))!.priceId).toBe(personal.id);
    expect(await fake.listPayments(subscription.customerId)).toHaveLength(1);
  });
});

describe("the fake's change at the renewal", () => {
  it("charges nothing now, keeps the plan to the period's end, then renews on the new price", async () => {
    const { fake, pro, personal, move } = bought();
    const { url } = await fake.startCheckout({
      priceId: pro.id,
      userId: "user_1",
      email: "a@example.com",
      customerId: null,
      consentId: "consent_1",
      successUrl: "x",
      cancelUrl: "y",
    });
    const subscription = fake.completeCheckout(new URL(url).searchParams.get("session")!);
    move(10);
    await fake.changePlan(subscription.id, personal.id, "renewal");
    const waiting = (await fake.fetchSubscription(subscription.id))!;
    expect(waiting).toMatchObject({ priceId: pro.id, scheduledPriceId: personal.id });
    expect(await fake.listPayments(subscription.customerId)).toHaveLength(1);
    move(30);
    fake.endPeriod(subscription.id, "paid");
    expect(await fake.fetchSubscription(subscription.id)).toMatchObject({ priceId: personal.id, scheduledPriceId: null });
    expect((await fake.listPayments(subscription.customerId))[0].amount).toBe(1000);
  });

  it("is dropped by a cancellation, or on its own; a cancellation is taken back by resuming", async () => {
    const { fake, personal, pro, buy } = bought();
    const subscription = await buy();
    await fake.changePlan(subscription.id, pro.id, "renewal");
    await fake.dropScheduledChange(subscription.id);
    expect((await fake.fetchSubscription(subscription.id))!.scheduledPriceId).toBeNull();
    await fake.changePlan(subscription.id, pro.id, "renewal");
    await fake.cancelSubscription(subscription.id, { atPeriodEnd: true });
    expect(await fake.fetchSubscription(subscription.id)).toMatchObject({ cancelAtPeriodEnd: true, scheduledPriceId: null });
    expect(await fake.resumeSubscription(subscription.id)).toMatchObject({ cancelAtPeriodEnd: false, priceId: personal.id });
  });
});

describe("the sync of a change", () => {
  it("stores a change waiting for the renewal, writes its history, and clears it when the renewal takes it", async () => {
    const { fake, personal, pro, move, buy } = bought();
    const store = new MemoryBillingStore();
    store.prices.set(personal.id, { id: "row_personal", tierId: "tier_personal" });
    store.prices.set(pro.id, { id: "row_pro", tierId: "tier_pro" });
    store.users.add("user_1");
    const deliver = async (events: readonly SignedEvent[]) => {
      for (const event of events) {
        const { rawBody, signature } = fake.delivery(event);
        await handleWebhook(fake, store, rawBody, signature, fake.now(), { graceDays: 14 });
      }
    };
    const subscription = await buy();
    await deliver(fake.takeUndelivered());
    await fake.changePlan(subscription.id, pro.id, "renewal");
    await syncSubscription(fake, store, subscription.id, {
      source: "person",
      event: null,
      userIdHint: null,
      policy: { graceDays: 14 },
      now: fake.now(),
    });
    expect(store.row("user_1")).toMatchObject({ priceId: "row_personal", tierId: "tier_personal", scheduledPriceId: "row_pro" });
    expect(store.historyOf("user_1").filter((line) => line.kind === "scheduled")).toEqual([
      expect.objectContaining({ before: null, after: "row_pro", source: "person" }),
    ]);
    await deliver(fake.takeUndelivered());
    move(30);
    fake.endPeriod(subscription.id, "paid");
    await deliver(fake.takeUndelivered());
    expect(store.row("user_1")).toMatchObject({ priceId: "row_pro", tierId: "tier_pro", scheduledPriceId: null });
  });

  it("says each kind of change in the admin's history", () => {
    const name = (id: string) => ({ row_pro: "Pro, €20.00 a month", row_personal: "Personal, €10.00 a month" })[id];
    expect(historyText({ kind: "scheduled", before: null, after: "row_pro" }, name)).toBe("Changes at renewal to Pro, €20.00 a month");
    expect(historyText({ kind: "scheduled", before: "row_pro", after: null }, name)).toBe(
      "Change at renewal to Pro, €20.00 a month dropped"
    );
  });
});

describe("Stripe's schedule read into the contract", () => {
  const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
  const subscription = (overrides: Record<string, unknown>) =>
    ({
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      start_date: seconds(T0),
      cancel_at_period_end: false,
      ended_at: null,
      metadata: {},
      pending_update: null,
      items: { data: [{ current_period_end: seconds(at(30)), price: { id: "price_pro" } }] },
      latest_invoice: { status: "paid", attempt_count: 1, created: seconds(T0), status_transitions: { finalized_at: seconds(T0) } },
      schedule: null,
      ...overrides,
    }) as unknown as StripeSubscription;
  const schedule = (status: string, nextPrice: string) => ({
    status,
    current_phase: { start_date: seconds(T0), end_date: seconds(at(30)) },
    phases: [
      { start_date: seconds(T0), end_date: seconds(at(30)), items: [{ price: "price_pro" }] },
      { start_date: seconds(at(30)), end_date: seconds(at(60)), items: [{ price: { id: nextPrice } }] },
    ],
  });

  it("reads the next phase's price as the change waiting for the renewal", () => {
    expect(scheduledPrice(subscription({ schedule: schedule("active", "price_personal") }))).toBe("price_personal");
    expect(snapshotFromStripe(subscription({ schedule: schedule("active", "price_personal") })).scheduledPriceId).toBe("price_personal");
  });

  it("reads none with no schedule, a schedule released, or a next phase on the same price", () => {
    expect(scheduledPrice(subscription({}))).toBeNull();
    expect(scheduledPrice(subscription({ schedule: "sub_sched_1" }))).toBeNull();
    expect(scheduledPrice(subscription({ schedule: schedule("released", "price_personal") }))).toBeNull();
    expect(scheduledPrice(subscription({ schedule: schedule("active", "price_pro") }))).toBeNull();
  });

  it("does not take a change's pending payment for a renewal failing", () => {
    const failing = { status: "open", attempt_count: 1, created: seconds(at(10)), status_transitions: { finalized_at: seconds(at(10)) } };
    expect(snapshotFromStripe(subscription({ latest_invoice: failing })).firstFailedAt).toEqual(at(10));
    expect(snapshotFromStripe(subscription({ latest_invoice: failing, pending_update: { expires_at: 1 } })).firstFailedAt).toBeNull();
  });
});
