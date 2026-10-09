import type { BillingInterval } from "./contract";
import { entitlement, type BillingPolicy, type EntitlementInput } from "./entitlement";

/**
 * What the person is told while a renewal fails (G-126 M2, D377). `planNotices` decides, from the row before and after
 * one sync, which messages are due; it is pure, and the sync stores its answer in the same transaction as the row, so a
 * notice is queued exactly when the change it speaks of is written. `deliverNotices` sends the queue afterwards.
 *
 * Each failure is one key: its first failed attempt, which the stored row keeps while the subscription stays failing
 * (D375). A slot is sent at most once per key, so a shuffled, repeated or late event, or the hourly reconciliation,
 * cannot send a message twice.
 */

export type NoticeMessage =
  | "payment-failed"
  | "action-needed"
  | "last-notice"
  | "moved-to-free"
  | "payment-recovered"
  /** A purchase has started (G-128 M2, D384); queued by `planConfirmation` in `consent.ts`. */
  | "purchase-confirmed"
  /** An upgrade charged now has been applied (G-129 M4, D389); queued by `upgradeConfirmation` in `consent.ts`. */
  | "upgrade-confirmed"
  /** A withdrawal has been received (G-129 M4, D389); queued by `withdrawalReceipt` in `withdrawal.ts`. */
  | "withdrawal-received";
/**
 * What is sent once per failure: the first notice is one slot whichever of its two messages it is. "confirmed" is a
 * purchase's or an upgrade's, keyed by its consent's time rather than a failure's; "withdrawn" is a withdrawal's, keyed
 * by when it was received.
 */
export type NoticeSlot = "failed" | "last" | "free" | "recovered" | "confirmed" | "withdrawn";

/** What a message is built from at delivery; dates as ISO text, as the queue's JSON keeps them. */
export interface NoticeValues {
  until?: string;
  nextAttemptAt?: string | null;
  payUrl?: string | null;
  /**
   * A purchase's or an upgrade's confirmation: the plan, the early-start request word for word, and the terms and the
   * withdrawal information agreed to, each with its version and in full.
   */
  plan?: string;
  termsVersion?: number;
  termsLine?: string;
  terms?: string;
  withdrawalVersion?: number;
  withdrawalLine?: string;
  withdrawal?: string;
  request?: string;
  /** A withdrawal's acknowledgment, its lines joined by blank lines. */
  receipt?: string;
}

export interface PlannedNotice {
  slot: NoticeSlot;
  message: NoticeMessage;
  failedAt: Date;
  values: NoticeValues;
}

/** The stored fields the planner reads, before and after the sync. */
export interface NoticeRow extends EntitlementInput {
  cancelAtPeriodEnd: boolean;
  endedAt: Date | null;
  nextAttemptAt: Date | null;
  payUrl: string | null;
  actionNeeded: boolean;
}

/** How close to the end of the tier the last notice is sent, and how much longer than that the grace must be for it. */
export const LAST_NOTICE_MS = 3 * 24 * 3_600_000;

const GOOD_STANDING: ReadonlySet<string> = new Set(["trialing", "active"]);

export function planNotices(facts: {
  before: NoticeRow | null;
  after: NoticeRow;
  /** Why the provider ended the subscription, when it has (`SubscriptionSnapshot.canceledFor`). */
  canceledFor: "request" | "payment" | null;
  /** The notices already queued for this subscription, sent or not. */
  queued: readonly { failedAt: Date; slot: NoticeSlot }[];
  policy: BillingPolicy;
  now: Date;
}): PlannedNotice[] {
  const { before, after, canceledFor, queued, policy, now } = facts;
  const has = (failedAt: Date, slot: NoticeSlot) =>
    queued.some((row) => row.failedAt.getTime() === failedAt.getTime() && row.slot === slot);
  const given = entitlement(after, policy, now);
  const key = after.firstFailedAt ?? before?.firstFailedAt ?? null;
  const notices: PlannedNotice[] = [];

  // The person has said the plan should end: being chased for its payment, or told it has ended, would contradict them.
  const dunning = !after.cancelAtPeriodEnd && canceledFor !== "request";

  if (given.tier && given.status === "past_due" && after.firstFailedAt && dunning) {
    const until = given.until.toISOString();
    if (!has(after.firstFailedAt, "failed")) {
      notices.push({
        slot: "failed",
        message: after.actionNeeded ? "action-needed" : "payment-failed",
        failedAt: after.firstFailedAt,
        values: { until, nextAttemptAt: after.nextAttemptAt?.toISOString() ?? null, payUrl: after.payUrl },
      });
    } else if (
      !has(after.firstFailedAt, "last") &&
      given.until.getTime() - now.getTime() <= LAST_NOTICE_MS &&
      // A tier that was never to last much longer than the notice's lead gets the first notice only.
      given.until.getTime() - after.firstFailedAt.getTime() > LAST_NOTICE_MS
    ) {
      notices.push({ slot: "last", message: "last-notice", failedAt: after.firstFailedAt, values: { until, payUrl: after.payUrl } });
    }
  }

  const freeForPayment =
    !given.tier &&
    (given.reason === "grace-ended" || given.reason === "unpaid" || (given.reason === "canceled" && canceledFor === "payment"));
  const freeKey = key ?? after.endedAt ?? after.currentPeriodEnd;
  if (freeForPayment && dunning && freeKey && !has(freeKey, "free"))
    notices.push({ slot: "free", message: "moved-to-free", failedAt: freeKey, values: {} });

  // Told only to someone who was told of the failure: a failure healed before any notice needs no word.
  const healed = before?.firstFailedAt ?? null;
  if (healed && GOOD_STANDING.has(after.status) && !after.firstFailedAt && has(healed, "failed") && !has(healed, "recovered"))
    notices.push({ slot: "recovered", message: "payment-recovered", failedAt: healed, values: {} });

  return notices;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "8 October 2026", as every billing text writes a day. */
export const formatDay = (date: Date): string => DAY_FORMAT.format(date);

/** "€10.00 a month": the amount is in the currency's minor unit, as Stripe keeps it. */
export function formatPrice(price: { amount: number; currency: string; interval: BillingInterval }): string {
  const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency: price.currency.toUpperCase() }).format(price.amount / 100);
  return `${amount} a ${price.interval === "MONTH" ? "month" : "year"}`;
}

/** A queued notice as delivery reads it. */
export interface PendingNotice {
  id: string;
  message: NoticeMessage;
  values: NoticeValues;
  /** The person's address; null when the account has none to send to. */
  email: string | null;
}

export interface NoticeQueue {
  /** Unsent notices still worth sending: newer than `NOTICE_MAX_AGE_MS` and tried fewer than `NOTICE_MAX_ATTEMPTS` times. */
  pending(now: Date): Promise<PendingNotice[]>;
  /** Takes a notice for sending; false when another delivery took it first. */
  claim(id: string, now: Date): Promise<boolean>;
  /** Gives a notice that could not be sent back to the queue, one attempt the older. */
  release(id: string): Promise<void>;
}

/** A notice not sent within this long is given up: news of a failure days old would mislead. */
export const NOTICE_MAX_AGE_MS = 3 * 24 * 3_600_000;
export const NOTICE_MAX_ATTEMPTS = 5;

/** The message's values in words. Links into the site are made by the caller, as only it knows the site's address. */
export function messageValues(notice: PendingNotice, planLink: string): Record<string, string> {
  const until = notice.values.until ? formatDay(new Date(notice.values.until)) : "";
  const next = notice.values.nextAttemptAt;
  switch (notice.message) {
    case "payment-failed":
      return {
        until,
        nextTry: next ? `The card will be tried again on ${formatDay(new Date(next))}.` : "No further try is planned.",
        link: planLink,
      };
    case "action-needed":
      // The provider's page for the invoice is where the bank's check is done; the Plan page is the way there otherwise.
      return { until, link: notice.values.payUrl || planLink };
    case "last-notice":
      return { until, link: planLink };
    case "moved-to-free":
    case "payment-recovered":
      return { link: planLink };
    case "purchase-confirmed":
    case "upgrade-confirmed":
      return {
        plan: notice.values.plan ?? "",
        termsLine: notice.values.termsLine ?? "",
        // The versions agreed to, on the same site as the Plan page.
        termsLink: new URL(`/terms?version=${notice.values.termsVersion}`, planLink).toString(),
        terms: notice.values.terms ?? "",
        withdrawalLine: notice.values.withdrawalLine ?? "",
        withdrawalLink: new URL(`/withdrawal?version=${notice.values.withdrawalVersion}`, planLink).toString(),
        withdrawal: notice.values.withdrawal ?? "",
        request: notice.values.request ?? "",
        link: planLink,
      };
    case "withdrawal-received":
      return { receipt: notice.values.receipt ?? "", link: planLink };
  }
}

/**
 * Sends what is queued, each notice claimed first so two deliveries at once send it once. A failed send is released for
 * the next delivery. Returns how many were sent.
 */
export async function deliverNotices(
  queue: NoticeQueue,
  send: (message: NoticeMessage, to: string, values: Record<string, string>) => Promise<boolean>,
  planLink: string,
  now: Date
): Promise<number> {
  let sent = 0;
  for (const notice of await queue.pending(now)) {
    if (!notice.email || !(await queue.claim(notice.id, now))) continue;
    if (await send(notice.message, notice.email, messageValues(notice, planLink))) sent += 1;
    else await queue.release(notice.id);
  }
  return sent;
}
