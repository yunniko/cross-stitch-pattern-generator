import { describe, expect, it } from "vitest";
import { BillingUnavailableError } from "../../lib/billing/contract";
import { entitlement, hasTier } from "../../lib/billing/entitlement";
import { FakeBilling, type SignedEvent } from "../../lib/billing/fake";
import { grantRow } from "../../lib/billing/grants";
import { FAKE_WEBHOOK_SECRET } from "../../lib/billing/settings";
import { UnknownPriceError, handleWebhook, planSync, reconcile } from "../../lib/billing/sync";
import { MemoryBillingStore } from "./helpers/memory-billing-store";

/**
 * G-106 M2 (Acceptance 3, 4, 6): the webhook and the reconciliation share one write path that fetches the subscription
 * and stores it whole (D369). Driven end to end through the fake provider: every event delivered twice, in shuffled
 * orders, or dropped and then recovered by the reconciliation — including payment failures after several paid periods.
 */

const T0 = new Date("2026-10-08T12:00:00Z");
const DAY = 24 * 3_600_000;
const POLICY = { graceDays: 14 };
const PRICE_ROW = { id: "price_row_personal_month", tierId: "tier_personal" };

function setUp() {
  let now = T0;
  const fake = new FakeBilling(FAKE_WEBHOOK_SECRET, "http://localhost:3000", () => now);
  const store = new MemoryBillingStore();
  const price = fake.addPrice({ amount: 1000, currency: "eur", interval: "MONTH", productName: "Personal" });
  store.prices.set(price.id, PRICE_ROW);
  store.users.add("user_1");
  const clock = {
    now: () => now,
    move: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
  const checkout = async (userId = "user_1", customerId: string | null = null) => {
    const { url } = await fake.startCheckout({
      priceId: price.id,
      userId,
      email: "a@example.com",
      customerId,
      consentId: "consent_1",
      successUrl: "x",
      cancelUrl: "y",
    });
    return fake.completeCheckout(new URL(url).searchParams.get("session")!);
  };
  const deliver = async (events: readonly SignedEvent[]) => {
    const answers = [];
    for (const event of events) {
      const { rawBody, signature } = fake.delivery(event);
      answers.push(await handleWebhook(fake, store, rawBody, signature, clock.now(), POLICY));
    }
    return answers;
  };
  /** The events emitted since the last call. */
  let delivered = 0;
  const fresh = () => {
    const events = fake.events.slice(delivered);
    delivered = fake.events.length;
    return events;
  };
  return { fake, store, price, clock, checkout, deliver, fresh };
}

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

const stored = (store: MemoryBillingStore, userId = "user_1") => {
  const row = store.row(userId);
  if (!row) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...fields } = row;
  return fields;
};

/** A subscription's whole life at the fake: two paid renewals, a failed one with a retry, paid, cancelled, ended. */
async function wholeLife(world: ReturnType<typeof setUp>) {
  const { fake, clock, checkout } = world;
  const { id } = await checkout();
  clock.move(30 * DAY);
  fake.endPeriod(id, "paid");
  clock.move(30 * DAY);
  fake.endPeriod(id, "paid");
  clock.move(30 * DAY);
  fake.endPeriod(id, "failed");
  clock.move(3 * DAY);
  fake.fail(id);
  clock.move(2 * DAY);
  fake.pay(id);
  await fake.cancelSubscription(id, { atPeriodEnd: true });
  clock.move(25 * DAY);
  fake.endPeriod(id, "paid");
  return id;
}

describe("a subscription stored from the webhook", () => {
  it("is created from Checkout's events with the tier of its price, and gives the tier", async () => {
    const world = setUp();
    const snapshot = await world.checkout();
    const answers = await world.deliver(world.fresh());
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
    expect(stored(world.store)).toEqual({
      userId: "user_1",
      kind: "stripe",
      tierId: PRICE_ROW.tierId,
      priceId: PRICE_ROW.id,
      status: "active",
      stripeCustomerId: snapshot.customerId,
      stripeSubscriptionId: snapshot.id,
      startedAt: T0,
      scheduledPriceId: null,
      currentPeriodEnd: new Date(T0.getTime() + 30 * DAY),
      cancelAtPeriodEnd: false,
      endedAt: null,
      firstFailedAt: null,
      nextAttemptAt: null,
      payUrl: null,
      actionNeeded: false,
    });
    expect(world.store.historyOf("user_1").map((entry) => [entry.kind, entry.after, entry.source])).toEqual([
      ["created", "active", "webhook"],
    ]);
    expect(hasTier(world.store.row("user_1")!, POLICY, world.clock.now())).toBe(true);
  });

  it("changes nothing on a second delivery of any event", async () => {
    const world = setUp();
    await wholeLife(world);
    const events = world.fresh();
    await world.deliver(events);
    const once = { row: stored(world.store), history: world.store.historyOf("user_1").length };
    const again = await world.deliver(events);
    expect(again.every((answer) => answer.status === 200 && answer.outcome.kind === "duplicate")).toBe(true);
    expect({ row: stored(world.store), history: world.store.historyOf("user_1").length }).toEqual(once);
  });

  it("ends in the provider's state whatever order the events arrive in", async () => {
    const world = setUp();
    const id = await wholeLife(world);
    const events = world.fresh();
    const truth = await world.fake.fetchSubscription(id);
    let reference: ReturnType<typeof stored> | undefined;
    for (const seed of [1, 2, 3, 42, 1234]) {
      const store = new MemoryBillingStore();
      store.prices.set(world.price.id, PRICE_ROW);
      store.users.add("user_1");
      for (const event of shuffled(events, seed)) {
        const { rawBody, signature } = world.fake.delivery(event);
        await handleWebhook(world.fake, store, rawBody, signature, world.clock.now(), POLICY);
      }
      expect({ seed, status: store.row("user_1")?.status, endedAt: store.row("user_1")?.endedAt }).toEqual({
        seed,
        status: truth!.status,
        endedAt: truth!.endedAt,
      });
      reference ??= stored(store);
      expect({ seed, row: stored(store) }).toEqual({ seed, row: reference });
    }
  });

  it("follows each step of the life when delivered as it happens, each step from the provider's state", async () => {
    const world = setUp();
    const { id } = await world.checkout();
    await world.deliver(world.fresh());
    const check = async (expected: { status: string; tierAt: Date; freeAt: Date }) => {
      await world.deliver(shuffled(world.fresh(), 7));
      const row = world.store.row("user_1")!;
      expect(row.status).toBe(expected.status);
      expect(hasTier(row, POLICY, expected.tierAt)).toBe(true);
      expect(hasTier(row, POLICY, expected.freeAt)).toBe(false);
    };
    world.clock.move(30 * DAY);
    world.fake.endPeriod(id, "paid");
    await check({ status: "active", tierAt: new Date(T0.getTime() + 59 * DAY), freeAt: new Date(T0.getTime() + 63 * DAY) });
    world.clock.move(30 * DAY);
    world.fake.endPeriod(id, "paid");
    await check({ status: "active", tierAt: new Date(T0.getTime() + 89 * DAY), freeAt: new Date(T0.getTime() + 93 * DAY) });
  });
});

describe("payment failures after paid periods (the Owner's case)", () => {
  it("records the first failure's date, keeps it across retries, clears it on payment, and bounds the tier", async () => {
    const world = setUp();
    const { id } = await world.checkout();
    await world.deliver(world.fresh());
    world.clock.move(30 * DAY);
    world.fake.endPeriod(id, "paid");
    await world.deliver(world.fresh());
    world.clock.move(30 * DAY);
    world.fake.endPeriod(id, "paid");
    await world.deliver(world.fresh());
    world.clock.move(30 * DAY);
    const failedAt = world.clock.now();
    world.fake.endPeriod(id, "failed");
    await world.deliver(world.fresh());
    let row = world.store.row("user_1")!;
    expect(row).toMatchObject({ status: "past_due", firstFailedAt: failedAt, currentPeriodEnd: new Date(T0.getTime() + 120 * DAY) });

    world.clock.move(3 * DAY);
    world.fake.fail(id);
    await world.deliver(world.fresh());
    expect(world.store.row("user_1")!.firstFailedAt).toEqual(failedAt);

    world.clock.move(2 * DAY);
    world.fake.pay(id);
    await world.deliver(world.fresh());
    row = world.store.row("user_1")!;
    expect(row).toMatchObject({ status: "active", firstFailedAt: null });
    expect(
      world.store
        .historyOf("user_1")
        .filter((entry) => entry.kind === "failure")
        .map((entry) => [entry.before, entry.after])
    ).toEqual([
      [null, failedAt.toISOString()],
      [failedAt.toISOString(), null],
    ]);
  });

  for (const outcome of ["unpaid", "canceled"] as const) {
    it(`gives Free once the retries end as ${outcome}`, async () => {
      const world = setUp();
      const { id } = await world.checkout();
      world.clock.move(30 * DAY);
      world.fake.endPeriod(id, "paid");
      world.clock.move(30 * DAY);
      world.fake.endPeriod(id, "failed");
      world.clock.move(7 * DAY);
      world.fake.giveUp(id, outcome);
      await world.deliver(shuffled(world.fresh(), 3));
      const row = world.store.row("user_1")!;
      expect(row.status).toBe(outcome);
      expect(entitlement(row, POLICY, world.clock.now())).toMatchObject({ tier: false, reason: outcome });
    });
  }

  it("gives Free when the grace ends, the retries having left it past_due for ever", async () => {
    const world = setUp();
    const { id } = await world.checkout();
    world.clock.move(30 * DAY);
    world.fake.endPeriod(id, "failed");
    world.clock.move(7 * DAY);
    world.fake.giveUp(id, "past_due");
    await world.deliver(world.fresh());
    const row = world.store.row("user_1")!;
    // The renewal failed at day 30; the grace is 14 days.
    expect(hasTier(row, POLICY, new Date(T0.getTime() + 43 * DAY))).toBe(true);
    expect(hasTier(row, POLICY, new Date(T0.getTime() + 44 * DAY))).toBe(false);
  });
});

describe("the reconciliation", () => {
  it("recovers dropped events: a renewal's failure never delivered is found and recorded", async () => {
    const world = setUp();
    const { id } = await world.checkout();
    await world.deliver(world.fresh());
    world.clock.move(30 * DAY);
    world.fake.endPeriod(id, "failed");
    world.fresh(); // dropped
    expect(world.store.row("user_1")!.status).toBe("active");

    const report = await reconcile(world.fake, world.store, world.clock.now(), POLICY);
    expect(report).toEqual({ checked: 1, corrected: 1, failed: [] });
    expect(world.store.row("user_1")).toMatchObject({ status: "past_due", currentPeriodEnd: new Date(T0.getTime() + 60 * DAY) });
    expect(
      world.store
        .historyOf("user_1")
        .filter((entry) => entry.source === "reconcile")
        .map((entry) => entry.kind)
    ).toEqual(["status", "period", "failure"]);
    expect(await reconcile(world.fake, world.store, world.clock.now(), POLICY)).toEqual({ checked: 1, corrected: 0, failed: [] });
  });

  it("leaves an ended subscription alone, and reports one it cannot read", async () => {
    const world = setUp();
    const { id } = await world.checkout();
    await world.deliver(world.fresh());
    world.fake.unavailable = true;
    expect((await reconcile(world.fake, world.store, world.clock.now(), POLICY)).failed).toEqual([
      { id, error: "the fake provider is set unavailable" },
    ]);
    world.fake.unavailable = false;
    await world.fake.cancelSubscription(id, { atPeriodEnd: false });
    await world.deliver(world.fresh());
    expect(await reconcile(world.fake, world.store, world.clock.now(), POLICY)).toEqual({ checked: 0, corrected: 0, failed: [] });
  });
});

describe("one live subscription a person", () => {
  it("detects a second one, ends it at its period's end at the provider, and records it on the person's row", async () => {
    const world = setUp();
    const first = await world.checkout();
    const second = await world.checkout();
    const answers = await world.deliver(world.fresh());
    expect(answers.some((answer) => answer.status === 200 && answer.outcome.kind === "second")).toBe(true);
    expect(world.store.row("user_1")!.stripeSubscriptionId).toBe(first.id);
    expect(await world.fake.fetchSubscription(second.id)).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
    // The cancellation's own event, and any later one, records nothing more.
    await world.deliver(world.fresh());
    expect(
      world.store
        .historyOf("user_1")
        .filter((entry) => entry.kind === "second")
        .map((entry) => [entry.before, entry.after])
    ).toEqual([[first.id, second.id]]);
  });

  it("lets a new subscription take the row of one that has ended, and ends an unpaid one still open", async () => {
    const world = setUp();
    const old = await world.checkout();
    world.clock.move(30 * DAY);
    world.fake.endPeriod(old.id, "failed");
    world.fake.giveUp(old.id, "unpaid");
    await world.deliver(world.fresh());
    const renewed = await world.checkout("user_1", old.customerId);
    await world.deliver(world.fresh());
    expect(world.store.row("user_1")).toMatchObject({ stripeSubscriptionId: renewed.id, status: "active" });
    expect(world.store.historyOf("user_1").find((entry) => entry.kind === "replaced")).toMatchObject({ before: old.id, after: renewed.id });
    expect(await world.fake.fetchSubscription(old.id)).toMatchObject({ status: "canceled" });
  });

  it("lets a bought subscription take the row of a tier given by hand, which it then decides alone (D379)", async () => {
    const world = setUp();
    const grant = grantRow(null, { userId: "user_1", tierId: "tier_given", tierName: "Given", until: new Date(T0.getTime() + 60 * DAY) });
    world.store.state.subscriptions.push({ id: "row_grant", ...grant.fields });
    const bought = await world.checkout();
    await world.deliver(world.fresh());
    expect(world.store.row("user_1")).toMatchObject({
      id: "row_grant",
      kind: "stripe",
      tierId: PRICE_ROW.tierId,
      stripeSubscriptionId: bought.id,
      status: "active",
    });
    expect(world.store.historyOf("user_1").find((entry) => entry.kind === "replaced")).toMatchObject({ before: "grant", after: bought.id });
  });
});

describe("what the webhook refuses or cannot place", () => {
  it("answers 400 to a bad signature or a body that is not JSON, recording nothing", async () => {
    const world = setUp();
    await world.checkout();
    const [event] = world.fresh();
    expect(await handleWebhook(world.fake, world.store, event.rawBody, "t=1,v1=00", world.clock.now(), POLICY)).toMatchObject({
      status: 400,
    });
    const body = "not json";
    const { signature } = world.fake.delivery({ ...event, rawBody: body });
    expect(await handleWebhook(world.fake, world.store, body, signature, world.clock.now(), POLICY)).toMatchObject({ status: 400 });
    expect(world.store.state.events.size).toBe(0);
  });

  it("fails, recording nothing, while the provider is unreachable or the price unknown, so the event is retried", async () => {
    const world = setUp();
    await world.checkout();
    const events = world.fresh();
    world.fake.unavailable = true;
    await expect(world.deliver(events)).rejects.toBeInstanceOf(BillingUnavailableError);
    world.fake.unavailable = false;
    world.store.prices.clear();
    await expect(world.deliver(events)).rejects.toBeInstanceOf(UnknownPriceError);
    expect(world.store.state.events.size).toBe(0);
    expect(world.store.row("user_1")).toBeUndefined();
    world.store.prices.set(world.price.id, PRICE_ROW);
    await world.deliver(events);
    expect(world.store.row("user_1")?.status).toBe("active");
  });

  it("records, and stores nothing for, a subscription of nobody on this site", async () => {
    const world = setUp();
    await world.checkout("user_unknown");
    const answers = await world.deliver(world.fresh());
    expect(answers.map((answer) => answer.status === 200 && answer.outcome.kind)).toEqual(["ignored", "ignored", "ignored"]);
    expect(world.store.state.subscriptions).toEqual([]);
  });
});

describe("planSync, the decision alone", () => {
  const snapshot = {
    id: "sub_new",
    customerId: "cus_1",
    status: "active",
    priceId: "price_1",
    startedAt: T0,
    scheduledPriceId: null,
    currentPeriodEnd: T0,
    cancelAtPeriodEnd: false,
    endedAt: null,
    firstFailedAt: null,
    nextAttemptAt: null,
    payUrl: null,
    actionNeeded: false,
    canceledFor: null,
    userId: "user_1",
    consentId: null,
  };
  it("stores a subscription that ended before it was seen, which then gives Free", () => {
    expect(
      planSync({
        snapshot: { ...snapshot, status: "canceled", endedAt: T0 },
        byProviderId: null,
        byUser: null,
        userId: "user_1",
        price: PRICE_ROW,
      })
    ).toMatchObject({ kind: "save", id: null, fields: { status: "canceled", endedAt: T0 } });
  });
});
