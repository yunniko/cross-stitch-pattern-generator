import { describe, expect, it } from "vitest";
import {
  deliverNotices,
  formatDay,
  messageValues,
  NOTICE_MAX_ATTEMPTS,
  planNotices,
  type NoticeRow,
  type NoticeSlot,
  type PendingNotice,
} from "../../lib/billing/notices";
import { MESSAGES, renderMessage, type MessageId } from "../../lib/mail/messages";
import { MemoryBillingStore } from "./helpers/memory-billing-store";

/** G-126 M2 (D377): which message a failing subscription is due, once per failure; and its delivery. */

const DAY = 24 * 3_600_000;
const T0 = new Date("2026-03-01T12:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const POLICY = { graceDays: 14 };

const ACTIVE: NoticeRow = {
  status: "active",
  currentPeriodEnd: at(30),
  firstFailedAt: null,
  cancelAtPeriodEnd: false,
  endedAt: null,
  nextAttemptAt: null,
  payUrl: null,
  actionNeeded: false,
};
/** Renewed on day 0 and failing since: the period runs to day 30, the grace to day 14. */
const FAILING: NoticeRow = { ...ACTIVE, status: "past_due", firstFailedAt: T0, nextAttemptAt: at(3), payUrl: "https://pay.example/in_1" };

const plan = (facts: Partial<Parameters<typeof planNotices>[0]> & { after: NoticeRow }) =>
  planNotices({ before: null, canceledFor: null, queued: [], policy: POLICY, now: T0, ...facts }).map((notice) => [
    notice.slot,
    notice.message,
    notice.failedAt.toISOString().slice(0, 10),
  ]);
const queued = (...slots: NoticeSlot[]) => slots.map((slot) => ({ failedAt: T0, slot }));

describe("the notices a failing subscription is due (G-126 M2)", () => {
  it("tells of a failure once, as a decline or as the bank's check, with the grace's end and the next try", () => {
    const [notice] = planNotices({ before: ACTIVE, after: FAILING, canceledFor: null, queued: [], policy: POLICY, now: T0 });
    expect(notice).toMatchObject({ slot: "failed", message: "payment-failed", failedAt: T0 });
    expect(notice.values).toEqual({ until: at(14).toISOString(), nextAttemptAt: at(3).toISOString(), payUrl: "https://pay.example/in_1" });
    expect(plan({ before: ACTIVE, after: { ...FAILING, actionNeeded: true } })).toEqual([["failed", "action-needed", "2026-03-01"]]);
    expect(plan({ before: FAILING, after: FAILING, queued: queued("failed"), now: at(2) })).toEqual([]);
  });

  it("gives the last notice three days before the tier ends, once, and not on top of the first", () => {
    expect(plan({ before: FAILING, after: FAILING, queued: queued("failed"), now: at(10.9) })).toEqual([]);
    expect(plan({ before: FAILING, after: FAILING, queued: queued("failed"), now: at(11) })).toEqual([
      ["last", "last-notice", "2026-03-01"],
    ]);
    expect(plan({ before: FAILING, after: FAILING, queued: queued("failed", "last"), now: at(12) })).toEqual([]);
    // Found failing only on day 12: the first notice alone, which already names the end.
    expect(plan({ before: ACTIVE, after: FAILING, now: at(12) })).toEqual([["failed", "payment-failed", "2026-03-01"]]);
    // A grace no longer than the notice's lead: the first notice is the last.
    expect(plan({ before: FAILING, after: FAILING, queued: queued("failed"), policy: { graceDays: 3 }, now: at(1) })).toEqual([]);
  });

  it("says the account is on Free when the grace ends, the retries end unpaid, or a failed payment ends it", () => {
    expect(plan({ before: FAILING, after: FAILING, queued: queued("failed"), now: at(14) })).toEqual([
      ["free", "moved-to-free", "2026-03-01"],
    ]);
    expect(plan({ before: FAILING, after: { ...FAILING, status: "unpaid" }, queued: queued("failed"), now: at(5) })).toEqual([
      ["free", "moved-to-free", "2026-03-01"],
    ]);
    const canceled = { ...FAILING, status: "canceled", endedAt: at(5) };
    expect(plan({ before: FAILING, after: canceled, canceledFor: "payment", queued: queued("failed"), now: at(5) })).toEqual([
      ["free", "moved-to-free", "2026-03-01"],
    ]);
    // Seen only after it ended, with no failure date kept: keyed by the end, and still said once.
    const late = { ...ACTIVE, status: "canceled", endedAt: at(5) };
    expect(plan({ after: late, canceledFor: "payment", now: at(5) })).toEqual([["free", "moved-to-free", "2026-03-06"]]);
    expect(plan({ before: FAILING, after: FAILING, queued: queued("failed", "free"), now: at(20) })).toEqual([]);
  });

  it("says nothing to someone who asked for the plan to end", () => {
    expect(plan({ before: ACTIVE, after: { ...FAILING, cancelAtPeriodEnd: true } })).toEqual([]);
    const ended = { ...FAILING, status: "canceled", endedAt: at(2) };
    expect(plan({ before: FAILING, after: ended, canceledFor: "request", queued: queued("failed"), now: at(2) })).toEqual([]);
    expect(plan({ before: FAILING, after: { ...FAILING, cancelAtPeriodEnd: true }, queued: queued("failed"), now: at(14) })).toEqual([]);
    // A plan that ended for another reason (a dispute) is not called a failed payment.
    expect(plan({ before: FAILING, after: ended, canceledFor: null, queued: queued("failed"), now: at(2) })).toEqual([]);
  });

  it("says the payment went through only to someone told it had failed, once", () => {
    const paid = { ...ACTIVE, currentPeriodEnd: at(30) };
    expect(plan({ before: FAILING, after: paid, queued: queued("failed"), now: at(4) })).toEqual([
      ["recovered", "payment-recovered", "2026-03-01"],
    ]);
    expect(plan({ before: FAILING, after: paid, queued: [], now: at(4) })).toEqual([]);
    expect(plan({ before: FAILING, after: paid, queued: queued("failed", "recovered"), now: at(4) })).toEqual([]);
    // Paid from Free, after the grace: the same news.
    expect(plan({ before: FAILING, after: paid, queued: queued("failed", "free"), now: at(20) })).toEqual([
      ["recovered", "payment-recovered", "2026-03-01"],
    ]);
  });

  it("keys a failure by its first failed attempt, so a second failure is told afresh", () => {
    const second = { ...FAILING, firstFailedAt: at(30), currentPeriodEnd: at(60) };
    expect(plan({ before: ACTIVE, after: second, queued: queued("failed", "recovered"), now: at(30) })).toEqual([
      ["failed", "payment-failed", "2026-03-31"],
    ]);
  });
});

describe("a notice's message", () => {
  const notice = (message: PendingNotice["message"], values: PendingNotice["values"] = {}): PendingNotice => ({
    id: "n1",
    message,
    values,
    email: "a@example.com",
  });
  const LINK = "https://site.example/account/plan";

  it("names its days in words, the next try or that there is none, and links to the Plan page", () => {
    const values = { until: at(14).toISOString(), nextAttemptAt: at(3).toISOString() };
    expect(messageValues(notice("payment-failed", values), LINK)).toEqual({
      until: "15 March 2026",
      nextTry: "The card will be tried again on 4 March 2026.",
      link: LINK,
    });
    expect(messageValues(notice("payment-failed", { ...values, nextAttemptAt: null }), LINK).nextTry).toBe("No further try is planned.");
    expect(formatDay(at(14))).toBe("15 March 2026");
  });

  it("sends the bank's check to the provider's page for the invoice, and to the Plan page when there is none", () => {
    const values = { until: at(14).toISOString(), payUrl: "https://pay.example/in_1" };
    expect(messageValues(notice("action-needed", values), LINK).link).toBe("https://pay.example/in_1");
    expect(messageValues(notice("action-needed", { ...values, payUrl: null }), LINK).link).toBe(LINK);
  });

  it("renders every billing message whole from the values it is given", () => {
    const values = { until: at(14).toISOString(), nextAttemptAt: at(3).toISOString(), payUrl: "https://pay.example/in_1" };
    for (const message of ["payment-failed", "action-needed", "last-notice", "moved-to-free", "payment-recovered"] as const) {
      const given = messageValues(notice(message, values), LINK);
      expect(Object.keys(given).sort(), message).toEqual([...MESSAGES[message].needs].sort());
      const rendered = renderMessage(message as MessageId, "a@example.com", given as never);
      expect(rendered.text).not.toMatch(/undefined|null|\$\{/);
      if (message !== "payment-recovered") expect(rendered.text, message).toMatch(/charts are kept/);
    }
  });
});

describe("delivering the queue", () => {
  async function queueOne(store: MemoryBillingStore, now: Date) {
    store.users.add("user_1");
    store.emails.set("user_1", "a@example.com");
    store.clock = () => now;
    await store.locked("k", async (tx) => {
      const id = await tx.save(
        null,
        {
          userId: "user_1",
          tierId: "t",
          priceId: "p",
          stripeCustomerId: "c",
          stripeSubscriptionId: "s",
          startedAt: null,
          scheduledPriceId: null,
          ...FAILING,
          kind: "stripe",
        },
        [],
        { source: "webhook", eventId: null, at: now }
      );
      await tx.queueNotices(id, [{ slot: "failed", message: "payment-failed", failedAt: T0, values: { until: at(14).toISOString() } }]);
      // Queued twice, as two syncs at once would: one row.
      await tx.queueNotices(id, [{ slot: "failed", message: "payment-failed", failedAt: T0, values: {} }]);
    });
  }

  it("sends each notice once, and two deliveries at once send it once", async () => {
    const store = new MemoryBillingStore();
    await queueOne(store, T0);
    const sent: string[] = [];
    const send = async (message: string, to: string) => (sent.push(`${message} to ${to}`), true);
    const counts = await Promise.all([deliverNotices(store, send, "l", T0), deliverNotices(store, send, "l", T0)]);
    expect(counts.reduce((a, b) => a + b)).toBe(1);
    expect(await deliverNotices(store, send, "l", at(1))).toBe(0);
    expect(sent).toEqual(["payment-failed to a@example.com"]);
  });

  it("retries a send that failed, gives up after five tries or three days", async () => {
    const store = new MemoryBillingStore();
    await queueOne(store, T0);
    let tries = 0;
    const failing = async () => ((tries += 1), false);
    for (let i = 0; i < NOTICE_MAX_ATTEMPTS + 2; i += 1) await deliverNotices(store, failing, "l", T0);
    expect(tries).toBe(NOTICE_MAX_ATTEMPTS);

    const late = new MemoryBillingStore();
    await queueOne(late, T0);
    expect(await deliverNotices(late, async () => true, "l", at(3))).toBe(0);
    expect(await deliverNotices(late, async () => true, "l", at(2.9))).toBe(1);
  });
});
