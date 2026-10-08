import { describe, expect, it } from "vitest";
import { entitlement, type BillingPolicy } from "../../lib/billing/entitlement";
import { FakeBilling, type SignedEvent } from "../../lib/billing/fake";
import { deliverNotices, type NoticeMessage } from "../../lib/billing/notices";
import { FAKE_WEBHOOK_SECRET } from "../../lib/billing/settings";
import { handleWebhook, reconcile, type HistoryKind } from "../../lib/billing/sync";
import { MemoryBillingStore } from "./helpers/memory-billing-store";

/**
 * G-126 M1 (Acceptance 1): a subscription's life when a renewal payment fails, at any point and as often as it happens.
 * Each scenario is a table of steps — what the provider and the person do, then what the person must have — driven
 * through the fake provider and the one write path (`handleWebhook`, `reconcile`), with the entitlement rule's answer
 * checked after every step. Every scenario runs with its events delivered as sent, each twice, and shuffled within a
 * step; the answer must not change. A new scenario is a new entry in `SCENARIOS`.
 *
 * G-126 M2: each scenario also names the messages the person is sent over its life, in order (`lib/billing/notices.ts`).
 * Notices are delivered after every step, and a "wait" runs the reconciliation, as the hourly pass would on that day.
 */

const T0 = new Date("2026-01-05T12:00:00Z");
const DAY = 24 * 3_600_000;
const POLICY: BillingPolicy = { graceDays: 14 };

const TIERS = { tier_personal: "Personal", tier_pro: "Professional" } as const;
type Plan = (typeof TIERS)[keyof typeof TIERS] | "Free";
type PriceName = "personal-month" | "personal-year" | "pro-month";
const PRICES: Record<PriceName, { tierId: keyof typeof TIERS; interval: "MONTH" | "YEAR"; amount: number }> = {
  "personal-month": { tierId: "tier_personal", interval: "MONTH", amount: 1000 },
  "personal-year": { tierId: "tier_personal", interval: "YEAR", amount: 10000 },
  "pro-month": { tierId: "tier_pro", interval: "MONTH", amount: 2000 },
};

/** What happens, in order. `day` moves the clock to that day of the subscription's life first. */
type Action =
  | { do: "subscribe"; price?: PriceName }
  | { do: "renew"; payment: "paid" | "failed" }
  | { do: "retry"; payment: "paid" | "failed" }
  | { do: "action-required" }
  | { do: "pay-invoice" }
  | { do: "give-up"; outcome: "canceled" | "unpaid" | "past_due" }
  | { do: "cancel"; at: "now" | "period-end" }
  | { do: "change-plan"; to: PriceName; payment: "paid" | "failed" }
  | { do: "dispute" }
  | { do: "refund" }
  | { do: "webhook-down" }
  | { do: "webhook-up" }
  | { do: "reconcile" }
  | { do: "wait" };

interface Expectation {
  plan: Plan;
  status?: string;
  /** The day the stored failure date names; null when none is stored. */
  failedSince?: number | null;
  cancelAtPeriodEnd?: boolean;
  /** How many history lines of a kind the subscription has: a failure noted once is two lines, set and cleared. */
  history?: Partial<Record<HistoryKind, number>>;
}

type Step = Action & { day?: number; then?: Expectation };

interface Scenario {
  name: string;
  steps: Step[];
  /** Every message the person is sent, in order, however the events are delivered. */
  mails: NoticeMessage[];
}

/** Subscribed on day 0 and renewed, paid, on days 30 and 60: three paid periods. */
const THREE_PAID: Step[] = [
  { do: "subscribe", then: { plan: "Personal", status: "active" } },
  { day: 30, do: "renew", payment: "paid" },
  { day: 60, do: "renew", payment: "paid", then: { plan: "Personal", status: "active", failedSince: null } },
];

const SCENARIOS: Scenario[] = [
  {
    name: "1. three paid periods, the next renewal fails, a retry succeeds",
    steps: [
      ...THREE_PAID,
      { day: 90, do: "renew", payment: "failed", then: { plan: "Personal", status: "past_due", failedSince: 90 } },
      { day: 93, do: "retry", payment: "failed", then: { plan: "Personal", status: "past_due", failedSince: 90 } },
      { day: 95, do: "retry", payment: "paid", then: { plan: "Personal", status: "active", failedSince: null, history: { failure: 2 } } },
      { day: 120, do: "renew", payment: "paid", then: { plan: "Personal", status: "active", failedSince: null } },
      { day: 125, do: "wait", then: { plan: "Personal" } },
    ],
    mails: ["payment-failed", "payment-recovered"],
  },
  ...(["canceled", "unpaid"] as const).map((outcome): Scenario => ({
    name: `2. three paid periods, every retry fails, the retries end as ${outcome} before the grace does`,
    steps: [
      ...THREE_PAID,
      { day: 90, do: "renew", payment: "failed" },
      { day: 93, do: "retry", payment: "failed" },
      { day: 97, do: "retry", payment: "failed" },
      { day: 102, do: "retry", payment: "failed", then: { plan: "Personal", status: "past_due", failedSince: 90 } },
      { day: 103, do: "give-up", outcome, then: { plan: "Free", status: outcome } },
    ],
    mails: ["payment-failed", "last-notice", "moved-to-free"],
  })),
  {
    name: "2. three paid periods, every retry fails, the retries end leaving it past_due: Free when the grace ends",
    steps: [
      ...THREE_PAID,
      { day: 90, do: "renew", payment: "failed" },
      { day: 97, do: "retry", payment: "failed" },
      { day: 100, do: "give-up", outcome: "past_due", then: { plan: "Personal", status: "past_due" } },
      { day: 103, do: "wait", then: { plan: "Personal" } },
      { day: 104, do: "wait", then: { plan: "Free", status: "past_due" } },
      // The next period's invoice fails too: a new invoice must not start the grace again.
      { day: 120, do: "renew", payment: "failed", then: { plan: "Free", status: "past_due", failedSince: 90 } },
    ],
    mails: ["payment-failed", "last-notice", "moved-to-free"],
  },
  {
    name: "2. Stripe still retrying after the grace: Free when the grace ends, whatever Stripe does later",
    steps: [
      ...THREE_PAID,
      { day: 90, do: "renew", payment: "failed" },
      { day: 104, do: "wait", then: { plan: "Free", status: "past_due", failedSince: 90 } },
      { day: 110, do: "retry", payment: "failed", then: { plan: "Free" } },
      { day: 111, do: "give-up", outcome: "canceled", then: { plan: "Free", status: "canceled" } },
    ],
    mails: ["payment-failed", "moved-to-free"],
  },
  {
    name: "3. as 2 ending unpaid, then the person pays the open invoice: the tier is back at once, same subscription",
    steps: [
      ...THREE_PAID,
      { day: 90, do: "renew", payment: "failed" },
      { day: 100, do: "give-up", outcome: "unpaid", then: { plan: "Free", status: "unpaid" } },
      {
        day: 110,
        do: "pay-invoice",
        then: { plan: "Personal", status: "active", failedSince: null, history: { replaced: 0, created: 1 } },
      },
    ],
    mails: ["payment-failed", "moved-to-free", "payment-recovered"],
  },
  {
    name: "4. a failure in period 3 recovered, a second in period 6: the grace counts afresh from the second",
    steps: [
      { do: "subscribe" },
      { day: 30, do: "renew", payment: "paid" },
      { day: 60, do: "renew", payment: "failed", then: { plan: "Personal", failedSince: 60 } },
      { day: 62, do: "retry", payment: "paid", then: { plan: "Personal", status: "active", failedSince: null } },
      { day: 90, do: "renew", payment: "paid" },
      { day: 120, do: "renew", payment: "paid" },
      { day: 150, do: "renew", payment: "failed", then: { plan: "Personal", status: "past_due", failedSince: 150 } },
      { day: 163, do: "wait", then: { plan: "Personal" } },
      { day: 164, do: "wait", then: { plan: "Free", history: { failure: 3 } } },
    ],
    mails: ["payment-failed", "payment-recovered", "payment-failed", "last-notice", "moved-to-free"],
  },
  {
    name: "5. a renewal needs the person to authenticate: the tier is kept as for a failure",
    steps: [
      ...THREE_PAID,
      { day: 90, do: "action-required", then: { plan: "Personal", status: "past_due", failedSince: 90 } },
      { day: 91, do: "pay-invoice", then: { plan: "Personal", status: "active", failedSince: null } },
    ],
    mails: ["action-needed", "payment-recovered"],
  },
  {
    name: "5. a renewal needs authentication that never comes: Free when the grace ends",
    steps: [...THREE_PAID, { day: 90, do: "action-required" }, { day: 104, do: "wait", then: { plan: "Free", status: "past_due" } }],
    // Nothing synced it between days 91 and 103, so the last notice was never due on a day it was looked at.
    mails: ["action-needed", "moved-to-free"],
  },
  {
    name: "6. the card replaced in the Portal during the grace, and the retry succeeds",
    steps: [
      ...THREE_PAID,
      { day: 90, do: "renew", payment: "failed" },
      { day: 99, do: "retry", payment: "paid", then: { plan: "Personal", status: "active", failedSince: null } },
    ],
    mails: ["payment-failed", "payment-recovered"],
  },
  {
    name: "7. cancelled at once during the grace: Free at once",
    steps: [
      ...THREE_PAID,
      { day: 90, do: "renew", payment: "failed" },
      { day: 92, do: "cancel", at: "now", then: { plan: "Free", status: "canceled" } },
    ],
    mails: ["payment-failed"],
  },
  {
    name: "7. cancelled at the period's end during the grace: Free when the grace ends, ended at the period's end",
    steps: [
      ...THREE_PAID,
      { day: 90, do: "renew", payment: "failed" },
      { day: 92, do: "cancel", at: "period-end", then: { plan: "Personal", status: "past_due", cancelAtPeriodEnd: true } },
      { day: 104, do: "wait", then: { plan: "Free" } },
      { day: 120, do: "renew", payment: "paid", then: { plan: "Free", status: "canceled" } },
    ],
    mails: ["payment-failed"],
  },
  {
    name: "7. cancelled at the period's end, then the retry succeeds: the tier to the period's end",
    steps: [
      ...THREE_PAID,
      { day: 90, do: "renew", payment: "failed" },
      { day: 92, do: "cancel", at: "period-end" },
      { day: 95, do: "retry", payment: "paid", then: { plan: "Personal", status: "active", cancelAtPeriodEnd: true } },
      { day: 119, do: "wait", then: { plan: "Personal" } },
      { day: 120, do: "renew", payment: "paid", then: { plan: "Free", status: "canceled" } },
    ],
    mails: ["payment-failed", "payment-recovered"],
  },
  {
    name: "8. a yearly subscription failing at its first renewal: the same grace in days",
    steps: [
      { do: "subscribe", price: "personal-year", then: { plan: "Personal", status: "active" } },
      { day: 365, do: "renew", payment: "failed", then: { plan: "Personal", status: "past_due", failedSince: 365 } },
      { day: 378, do: "wait", then: { plan: "Personal" } },
      { day: 379, do: "wait", then: { plan: "Free" } },
      { day: 380, do: "retry", payment: "paid", then: { plan: "Personal", status: "active", failedSince: null } },
    ],
    mails: ["payment-failed", "last-notice", "moved-to-free", "payment-recovered"],
  },
  {
    name: "9. a change of plan whose prorated payment fails: the old plan is kept, the new one only once paid",
    steps: [
      ...THREE_PAID,
      {
        day: 70,
        do: "change-plan",
        to: "pro-month",
        payment: "failed",
        then: { plan: "Personal", status: "past_due", history: { price: 0 } },
      },
      { day: 72, do: "retry", payment: "paid", then: { plan: "Professional", status: "active", history: { price: 1 } } },
    ],
    mails: ["payment-failed", "payment-recovered"],
  },
  {
    name: "9. a change of plan never paid for: the old plan through the grace, then Free",
    steps: [
      ...THREE_PAID,
      { day: 70, do: "change-plan", to: "pro-month", payment: "failed" },
      { day: 83, do: "wait", then: { plan: "Personal" } },
      { day: 84, do: "wait", then: { plan: "Free", history: { price: 0 } } },
    ],
    mails: ["payment-failed", "last-notice", "moved-to-free"],
  },
  {
    name: "9. a change of plan paid at once is taken at once",
    steps: [
      ...THREE_PAID,
      { day: 70, do: "change-plan", to: "pro-month", payment: "paid", then: { plan: "Professional", status: "active" } },
    ],
    mails: [],
  },
  {
    name: "10. a dispute and a refund after paid periods are shown to the admin and change no access",
    steps: [
      ...THREE_PAID,
      { day: 70, do: "dispute", then: { plan: "Personal", status: "active", history: { dispute: 1 } } },
      { day: 71, do: "refund", then: { plan: "Personal", status: "active", history: { dispute: 1, refund: 1 } } },
    ],
    mails: [],
  },
  {
    name: "11. the webhook is down for a day during a failure and its retries: the reconciliation alone gets it right",
    steps: [
      ...THREE_PAID,
      { day: 89, do: "webhook-down" },
      { day: 90, do: "renew", payment: "failed" },
      { do: "reconcile", then: { plan: "Personal", status: "past_due", failedSince: 90 } },
      { day: 91, do: "retry", payment: "failed" },
      { do: "reconcile", then: { plan: "Personal", status: "past_due", failedSince: 90 } },
      { day: 91.5, do: "retry", payment: "paid" },
      { do: "reconcile", then: { plan: "Personal", status: "active", failedSince: null } },
      // Stripe's own retries of the held events arrive once the webhook is back: nothing changes.
      { day: 92, do: "webhook-up", then: { plan: "Personal", status: "active", failedSince: null, history: { failure: 2 } } },
    ],
    mails: ["payment-failed", "payment-recovered"],
  },
];

type Delivery = { kind: "as-sent" } | { kind: "twice" } | { kind: "shuffled"; seed: number };
const DELIVERIES: Delivery[] = [{ kind: "as-sent" }, { kind: "twice" }, { kind: "shuffled", seed: 1 }, { kind: "shuffled", seed: 7 }];

/** A seeded shuffle, so a failing order can be named and rerun. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function run(scenario: Scenario, delivery: Delivery) {
  let now = T0;
  const fake = new FakeBilling(FAKE_WEBHOOK_SECRET, "http://localhost:3000", () => now);
  const store = new MemoryBillingStore();
  store.clock = () => now;
  store.users.add("user_1");
  const mails: NoticeMessage[] = [];
  const sendNotices = () =>
    deliverNotices(store, async (message) => (mails.push(message), true), "http://localhost:3000/account/plan", now);
  const priceIds = {} as Record<PriceName, string>;
  for (const [name, price] of Object.entries(PRICES) as [PriceName, (typeof PRICES)[PriceName]][]) {
    const added = fake.addPrice({ amount: price.amount, currency: "eur", interval: price.interval, productName: TIERS[price.tierId] });
    priceIds[name] = added.id;
    store.prices.set(added.id, { id: `row_${name}`, tierId: price.tierId });
  }
  let subscriptionId = "";
  let webhookUp = true;
  let held: SignedEvent[] = [];

  const deliver = async (events: readonly SignedEvent[]) => {
    const order =
      delivery.kind === "twice"
        ? events.flatMap((event) => [event, event])
        : delivery.kind === "shuffled"
          ? shuffled(events, delivery.seed)
          : events;
    for (const event of order) {
      const { rawBody, signature } = fake.delivery(event);
      const answer = await handleWebhook(fake, store, rawBody, signature, now, POLICY);
      expect(answer.status, `${event.type} answered`).toBe(200);
    }
  };

  const act = async (step: Step) => {
    switch (step.do) {
      case "subscribe": {
        const { url } = await fake.startCheckout({
          priceId: priceIds[step.price ?? "personal-month"],
          userId: "user_1",
          email: "a@example.com",
          customerId: null,
          successUrl: "x",
          cancelUrl: "y",
        });
        subscriptionId = fake.completeCheckout(new URL(url).searchParams.get("session")!).id;
        return;
      }
      case "renew":
        fake.endPeriod(subscriptionId, step.payment);
        return;
      case "retry":
        if (step.payment === "paid") fake.pay(subscriptionId);
        else fake.fail(subscriptionId);
        return;
      case "action-required":
        fake.endPeriod(subscriptionId, "failed");
        // The renewal's attempt asked for authentication rather than being declined: one more event, the same state.
        fake.requireAction(subscriptionId);
        return;
      case "pay-invoice":
        fake.pay(subscriptionId);
        return;
      case "give-up":
        fake.giveUp(subscriptionId, step.outcome);
        return;
      case "cancel":
        await fake.cancelSubscription(subscriptionId, { atPeriodEnd: step.at === "period-end" });
        return;
      case "change-plan":
        fake.changePrice(subscriptionId, priceIds[step.to], step.payment);
        return;
      case "dispute":
        fake.dispute(fake.lastCharge(subscriptionId));
        return;
      case "refund":
        fake.refund(fake.lastCharge(subscriptionId));
        return;
      case "webhook-down":
        webhookUp = false;
        return;
      case "webhook-up":
        webhookUp = true;
        await deliver(held);
        held = [];
        return;
      case "reconcile":
        expect((await reconcile(fake, store, now, POLICY)).failed).toEqual([]);
        return;
      case "wait":
        expect((await reconcile(fake, store, now, POLICY)).failed).toEqual([]);
        return;
    }
  };

  for (const [index, step] of scenario.steps.entries()) {
    if (step.day !== undefined) {
      const at = new Date(T0.getTime() + step.day * DAY);
      expect(at >= now, `step ${index} goes back in time`).toBe(true);
      now = at;
    }
    await act(step);
    const events = fake.takeUndelivered();
    if (webhookUp) await deliver(events);
    else held.push(...events);
    await sendNotices();
    if (!step.then) continue;

    const where = `step ${index} (${step.do}${step.day !== undefined ? `, day ${step.day}` : ""})`;
    const row = store.row("user_1");
    const given = entitlement(row ?? null, POLICY, now);
    const plan: Plan = given.tier && row ? TIERS[row.tierId as keyof typeof TIERS] : "Free";
    expect(plan, `${where}: the plan`).toBe(step.then.plan);
    if (step.then.status !== undefined) expect(row?.status, `${where}: the status`).toBe(step.then.status);
    if (step.then.failedSince !== undefined)
      expect(row?.firstFailedAt ?? null, `${where}: the failure date`).toEqual(
        step.then.failedSince === null ? null : new Date(T0.getTime() + step.then.failedSince * DAY)
      );
    if (step.then.cancelAtPeriodEnd !== undefined)
      expect(row?.cancelAtPeriodEnd, `${where}: cancel at period end`).toBe(step.then.cancelAtPeriodEnd);
    for (const [kind, count] of Object.entries(step.then.history ?? {}))
      expect(store.historyOf("user_1").filter((entry) => entry.kind === kind).length, `${where}: history "${kind}"`).toBe(count);
  }

  // Every event once more, late, in reverse: what was stored stays as it was.
  const before = { row: store.row("user_1"), history: store.historyOf("user_1").length };
  if (delivery.kind === "twice") {
    for (const event of [...fake.events].reverse()) {
      const { rawBody, signature } = fake.delivery(event);
      await handleWebhook(fake, store, rawBody, signature, now, POLICY);
    }
    expect({ row: store.row("user_1"), history: store.historyOf("user_1").length }).toEqual(before);
    await sendNotices();
  }
  expect(mails, "the messages sent").toEqual(scenario.mails);
}

describe("payment failures at any point in a subscription's life (G-126 scenarios)", () => {
  for (const scenario of SCENARIOS) {
    describe(scenario.name, () => {
      for (const delivery of DELIVERIES) {
        const label = delivery.kind === "shuffled" ? `shuffled (seed ${delivery.seed})` : delivery.kind;
        it(`events delivered ${label}`, () => run(scenario, delivery));
      }
    });
  }

  it("covers each of the goal's eleven scenarios", () => {
    const numbers = new Set(SCENARIOS.map((scenario) => Number(scenario.name.split(".")[0])));
    expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});
