import { BillingSignatureError, type BillingEventRead, type BillingGateway, type SubscriptionSnapshot } from "./contract";
import { isGrant, type BillingPolicy } from "./entitlement";
import { planConfirmation, type ConsentRecord } from "./consent";
import { planNotices, type NoticeSlot, type PlannedNotice } from "./notices";

/**
 * The one write path of a subscription (G-106 M2, D369): the webhook and the reconciliation both come here. An event
 * only names a subscription; the subscription is fetched from the provider under a lock on its id, and the stored row
 * is brought to that snapshot. So a duplicated, late or shuffled event ends in the same row, and a dropped one is made
 * good by the next reconciliation.
 *
 * The decisions are `planSync`'s, a pure function; the database is behind `BillingStore` (`prisma-store.ts` in the app,
 * an in-memory one in the unit tests).
 */

/** A subscription row as the app stores it. */
export interface StoredSubscription {
  id: string;
  userId: string;
  /** "stripe", or "grant" for a tier an admin gave by hand (D379). */
  kind: string;
  tierId: string;
  priceId: string | null;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** When the provider's subscription began (D387); null for a grant, and for a row synced before it was kept. */
  startedAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  endedAt: Date | null;
  firstFailedAt: Date | null;
  nextAttemptAt: Date | null;
  payUrl: string | null;
  actionNeeded: boolean;
}

export type SubscriptionFields = Omit<StoredSubscription, "id">;

export type HistoryKind =
  | "created"
  | "status"
  | "period"
  | "cancel"
  | "price"
  | "failure"
  | "ended"
  | "replaced"
  | "second"
  | "dispute"
  | "refund"
  /** The admin asked the provider for a refund (G-127 M2); the provider's own "refund" line follows by the webhook. */
  | "refund-asked"
  | "granted"
  | "grant-ended"
  /** The person withdrew from the contract within its 14 days (G-129 M2, D387); `after` says what was given back. */
  | "withdrawal";
/** Who wrote a line: the provider's event, the hourly pass, an admin, or the person on their Plan page. */
export type HistorySource = "webhook" | "reconcile" | "admin" | "person";

/** One line of a subscription's history (`SubscriptionEvent`). */
export interface HistoryEntry {
  kind: HistoryKind;
  before: string | null;
  after: string | null;
}

/** The store's side of one locked unit of work. */
export interface BillingTx {
  eventSeen(id: string): Promise<boolean>;
  recordEvent(id: string, type: string): Promise<void>;
  subscriptionByProviderId(id: string): Promise<StoredSubscription | null>;
  subscriptionByUser(userId: string): Promise<StoredSubscription | null>;
  /** The newest row of a provider customer: where a dispute or a refund is recorded. */
  subscriptionByCustomer(customerId: string): Promise<StoredSubscription | null>;
  userExists(userId: string): Promise<boolean>;
  /** The app's price row for a provider price id, with the tier it belongs to. */
  priceByProviderId(id: string): Promise<{ id: string; tierId: string } | null>;
  /** Writes the person's one row (creating it when `id` is null) and appends its history; returns the row's id. */
  save(id: string | null, fields: SubscriptionFields, history: HistoryEntry[], meta: HistoryMeta): Promise<string>;
  /** The notices queued for a row, sent or not: what `planNotices` must not queue again. */
  noticesOf(subscriptionId: string): Promise<{ failedAt: Date; slot: NoticeSlot }[]>;
  /** Queues notices for delivery after the transaction. */
  queueNotices(subscriptionId: string, notices: PlannedNotice[]): Promise<void>;
  /** Appends history to a row without changing it. */
  appendHistory(id: string, history: HistoryEntry[], meta: HistoryMeta): Promise<void>;
  /** The person's consent a Checkout was started with (D384); null when it is not theirs or not found. */
  consentFor(id: string, userId: string): Promise<ConsentRecord | null>;
  /** Ties a consent to the subscription row its Checkout made. */
  linkConsent(id: string, subscriptionId: string): Promise<void>;
}

export interface HistoryMeta {
  source: HistorySource;
  eventId: string | null;
  at: Date;
}

export interface BillingStore {
  /** Runs `work` in one transaction holding a lock on the key; a second caller with the same key waits. */
  locked<T>(key: string, work: (tx: BillingTx) => Promise<T>): Promise<T>;
  eventSeen(id: string): Promise<boolean>;
  recordEvent(id: string, type: string): Promise<void>;
  /** The provider ids of every stored subscription that has not ended: what the reconciliation re-reads. */
  openSubscriptionIds(): Promise<string[]>;
}

/** The statuses whose subscription is, or may again be, charging: a second one beside it is a mistake. */
const HOLDS_THE_PLACE: ReadonlySet<string> = new Set(["trialing", "active", "past_due"]);
/** Statuses after which a subscription never changes again. */
export const FINAL_STATUSES = ["canceled", "incomplete_expired"] as const;
const FINAL: ReadonlySet<string> = new Set(FINAL_STATUSES);

/**
 * Whether a subscription bought at the provider stands in the way of another: a tier given by hand never does, so a
 * person who pays while one lasts takes their paid subscription in its place (D379).
 */
export function holdsThePlace(subscription: { kind?: string; status: string; endedAt: Date | null }): boolean {
  return !isGrant(subscription) && subscription.endedAt === null && HOLDS_THE_PLACE.has(subscription.status);
}

export function isFinal(subscription: { status: string; endedAt: Date | null }): boolean {
  return subscription.endedAt !== null || FINAL.has(subscription.status);
}

/** What `planSync` decided. */
export type SyncPlan =
  | { kind: "ignore"; reason: string }
  | { kind: "save"; id: string | null; fields: SubscriptionFields; history: HistoryEntry[]; cancelNow: string | null }
  /** A second subscription beside a live one: cancelled at its period's end, and recorded on the person's row. */
  | { kind: "second"; id: string; history: HistoryEntry[]; cancelAtPeriodEnd: string };

export interface SyncFacts {
  snapshot: SubscriptionSnapshot;
  /** The row already holding this provider subscription, if any. */
  byProviderId: StoredSubscription | null;
  /** The person's row, when the subscription is not stored yet. */
  byUser: StoredSubscription | null;
  /** The person the subscription belongs to, if it can be told. */
  userId: string | null;
  price: { id: string; tierId: string };
}

const text = (value: Date | boolean | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : String(value);

function fieldsOf(snapshot: SubscriptionSnapshot, userId: string, price: { id: string; tierId: string }): SubscriptionFields {
  return {
    userId,
    kind: "stripe",
    tierId: price.tierId,
    priceId: price.id,
    status: snapshot.status,
    stripeCustomerId: snapshot.customerId,
    stripeSubscriptionId: snapshot.id,
    startedAt: snapshot.startedAt,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    endedAt: snapshot.endedAt,
    firstFailedAt: snapshot.firstFailedAt,
    nextAttemptAt: snapshot.nextAttemptAt,
    payUrl: snapshot.payUrl,
    actionNeeded: snapshot.actionNeeded,
  };
}

/** The history a change from one row to the next writes: one line per field that moved. */
export function historyOf(before: SubscriptionFields | null, after: SubscriptionFields): HistoryEntry[] {
  if (!before) return [{ kind: "created", before: null, after: after.status }];
  const lines: HistoryEntry[] = [];
  const compare = (kind: HistoryKind, a: Date | boolean | string | null, b: Date | boolean | string | null) => {
    if (text(a) !== text(b)) lines.push({ kind, before: text(a), after: text(b) });
  };
  compare("status", before.status, after.status);
  compare("period", before.currentPeriodEnd, after.currentPeriodEnd);
  compare("cancel", before.cancelAtPeriodEnd, after.cancelAtPeriodEnd);
  compare("price", before.priceId, after.priceId);
  compare("failure", before.firstFailedAt, after.firstFailedAt);
  compare("ended", before.endedAt, after.endedAt);
  return lines;
}

/** A subscription a renewal payment is failing for, retried or given up on. */
const FAILING: ReadonlySet<string> = new Set(["past_due", "unpaid"]);
/** A subscription in good standing: the only kind whose change of price is taken (D376). */
const GOOD_STANDING: ReadonlySet<string> = new Set(["trialing", "active"]);

const earliest = (a: Date | null, b: Date | null): Date | null => (a && b ? (a < b ? a : b) : (a ?? b));

/**
 * The fields to store over a row already held, where they differ from the snapshot alone:
 * - while the subscription stays failing, the failure date is the earliest seen, so a new invoice left unpaid behind an
 *   old one cannot start the grace again (D375);
 * - a change of price is taken only from a subscription in good standing: the provider applies a plan change before its
 *   payment succeeds, and a failing payment must not buy the new plan (D376).
 */
function overHeld(held: StoredSubscription, fields: SubscriptionFields): SubscriptionFields {
  const next = { ...fields };
  if (FAILING.has(held.status) && FAILING.has(fields.status) && held.firstFailedAt)
    next.firstFailedAt = earliest(held.firstFailedAt, fields.firstFailedAt);
  if (!GOOD_STANDING.has(fields.status) && held.priceId !== fields.priceId) {
    next.priceId = held.priceId;
    next.tierId = held.tierId;
  }
  return next;
}

/** Decides what one fetched snapshot does to the stored rows. Pure. */
export function planSync({ snapshot, byProviderId, byUser, userId, price }: SyncFacts): SyncPlan {
  if (byProviderId) {
    const fields = overHeld(byProviderId, fieldsOf(snapshot, byProviderId.userId, price));
    return { kind: "save", id: byProviderId.id, fields, history: historyOf(byProviderId, fields), cancelNow: null };
  }
  if (!userId) return { kind: "ignore", reason: "the subscription names no person of this site" };
  const fields = fieldsOf(snapshot, userId, price);
  // Stored even when it has already ended, as when every event arrives late: it gives Free, and the record of what
  // was paid is the admin's.
  if (!byUser) {
    return { kind: "save", id: null, fields, history: historyOf(null, fields), cancelNow: null };
  }
  if (!holdsThePlace(snapshot)) return { kind: "ignore", reason: "another subscription of the person's, not live" };
  if (holdsThePlace(byUser)) {
    if (snapshot.cancelAtPeriodEnd) return { kind: "ignore", reason: "a second subscription already set to end" };
    return {
      kind: "second",
      id: byUser.id,
      history: [{ kind: "second", before: byUser.stripeSubscriptionId, after: snapshot.id }],
      cancelAtPeriodEnd: snapshot.id,
    };
  }
  // The person's stored subscription gives nothing any more, or is a tier given by hand, and a new one is live: the new
  // one takes the row, and the old one, if the provider could still revive it, is ended.
  return {
    kind: "save",
    id: byUser.id,
    fields,
    history: [
      { kind: "replaced", before: isGrant(byUser) ? "grant" : byUser.stripeSubscriptionId, after: snapshot.id },
      ...historyOf(byUser, fields),
    ],
    cancelNow: byUser.stripeSubscriptionId && !isFinal(byUser) ? byUser.stripeSubscriptionId : null,
  };
}

/** A price the app does not know: the subscription cannot be given a tier until the admin adds it. */
export class UnknownPriceError extends Error {
  constructor(readonly providerPriceId: string | null) {
    super(`price ${providerPriceId ?? "(none)"} is not one of this site's prices`);
    this.name = "UnknownPriceError";
  }
}

export type SyncOutcome = { kind: "ignored"; reason: string } | { kind: "saved"; changes: number } | { kind: "second" };

/**
 * Re-reads one subscription from the provider and brings the stored row to it, under a lock on its id. `eventId`, when
 * given, is recorded in the same transaction, so an event is marked handled only once its change is written.
 */
export async function syncSubscription(
  gateway: BillingGateway,
  store: BillingStore,
  providerId: string,
  context: {
    source: HistorySource;
    event: { id: string; type: string } | null;
    userIdHint: string | null;
    policy: BillingPolicy;
    now: Date;
  }
): Promise<SyncOutcome> {
  const meta: HistoryMeta = { source: context.source, eventId: context.event?.id ?? null, at: context.now };
  return store.locked(`billing:${providerId}`, async (tx): Promise<SyncOutcome> => {
    if (context.event && (await tx.eventSeen(context.event.id))) return { kind: "ignored", reason: "event already handled" };
    const done = async (result: SyncOutcome) => {
      if (context.event) await tx.recordEvent(context.event.id, context.event.type);
      return result;
    };
    const snapshot = await gateway.fetchSubscription(providerId);
    if (!snapshot) return done({ kind: "ignored", reason: "the provider does not know the subscription" });
    const byProviderId = await tx.subscriptionByProviderId(snapshot.id);
    const named = snapshot.userId ?? context.userIdHint;
    const userId = byProviderId ? byProviderId.userId : named && (await tx.userExists(named)) ? named : null;
    const byUser = !byProviderId && userId ? await tx.subscriptionByUser(userId) : null;
    const price = snapshot.priceId ? await tx.priceByProviderId(snapshot.priceId) : null;
    if (!price) {
      // Nothing can be stored without a tier. Ignoring it would lose a payment; failing lets the provider retry the
      // event, and the reconciliation retry a stored row, until the admin has added the price.
      if (byProviderId || userId) throw new UnknownPriceError(snapshot.priceId);
      return done({ kind: "ignored", reason: "no tier, and nothing to store" });
    }
    const plan = planSync({ snapshot, byProviderId, byUser, userId, price });
    if (plan.kind === "ignore") return done({ kind: "ignored", reason: plan.reason });
    // A cancellation runs before the write, inside the transaction: if the provider refuses it, nothing is written and
    // the event is not marked handled, so the provider retries it. Its own events come back through the webhook.
    if (plan.kind === "second") {
      await gateway.cancelSubscription(plan.cancelAtPeriodEnd, { atPeriodEnd: true });
      await tx.appendHistory(plan.id, plan.history, meta);
      return done({ kind: "second" });
    }
    if (plan.cancelNow) await gateway.cancelSubscription(plan.cancelNow, { atPeriodEnd: false });
    const rowId = await tx.save(plan.id, plan.fields, plan.history, meta);
    // A row taken over from another subscription starts its notices afresh: the old one's failure is not this one's.
    const before = byProviderId && byProviderId.id === plan.id ? byProviderId : null;
    const notices = planNotices({
      before,
      after: plan.fields,
      canceledFor: snapshot.canceledFor,
      queued: before ? await tx.noticesOf(rowId) : [],
      policy: context.policy,
      now: context.now,
    });
    if (notices.length > 0) await tx.queueNotices(rowId, notices);
    // The consent the Checkout was started with is tied to the row, and its confirmation sent once the plan starts (D384).
    const consent = snapshot.consentId ? await tx.consentFor(snapshot.consentId, plan.fields.userId) : null;
    if (consent) {
      if (consent.subscriptionId === null) await tx.linkConsent(consent.id, rowId);
      const confirmation = planConfirmation({ consent, rowId, status: plan.fields.status, queued: await tx.noticesOf(rowId) });
      if (confirmation) await tx.queueNotices(rowId, [confirmation]);
    }
    return done({ kind: "saved", changes: plan.history.length });
  });
}

export type WebhookAnswer =
  | { status: 200; outcome: SyncOutcome | { kind: "duplicate" } | { kind: "no-subscription" } | { kind: "noted" } }
  | { status: 400; error: string };

/**
 * Events the admin is shown and nothing more (G-126, scenario 10): a dispute or a refund changes no access by itself (the
 * Owner's default until G-126 (b) is answered); the admin can take the tier by hand.
 */
const ADMIN_NOTICES: Readonly<Record<string, "dispute" | "refund">> = {
  "charge.dispute.created": "dispute",
  "charge.refunded": "refund",
};

/** Records a dispute or refund in the history of the customer's subscription; ignored when the customer has none here. */
async function noteForAdmin(
  gateway: BillingGateway,
  store: BillingStore,
  event: BillingEventRead,
  kind: "dispute" | "refund",
  now: Date
): Promise<{ kind: "noted" } | SyncOutcome> {
  const customerId = event.customerId ?? (event.chargeId ? await gateway.chargeCustomer(event.chargeId) : null);
  if (!customerId) {
    await store.recordEvent(event.id, event.type);
    return { kind: "ignored", reason: "the charge names no customer" };
  }
  return store.locked(`billing-customer:${customerId}`, async (tx) => {
    if (await tx.eventSeen(event.id)) return { kind: "ignored", reason: "event already handled" };
    const row = await tx.subscriptionByCustomer(customerId);
    if (row)
      await tx.appendHistory(row.id, [{ kind, before: null, after: event.chargeId }], { source: "webhook", eventId: event.id, at: now });
    await tx.recordEvent(event.id, event.type);
    return row ? { kind: "noted" } : { kind: "ignored", reason: "no subscription of this customer here" };
  });
}

/**
 * One delivery to the webhook: the signature is checked over the raw body, an event seen before changes nothing, and
 * an event naming a subscription syncs it. Throws when the change could not be written (the provider then retries).
 */
export async function handleWebhook(
  gateway: BillingGateway,
  store: BillingStore,
  rawBody: string,
  signature: string | null,
  now: Date,
  policy: BillingPolicy
): Promise<WebhookAnswer> {
  let event;
  try {
    event = gateway.readEvent(rawBody, signature);
  } catch (error) {
    if (error instanceof BillingSignatureError || error instanceof SyntaxError) return { status: 400, error: error.message };
    throw error;
  }
  if (await store.eventSeen(event.id)) return { status: 200, outcome: { kind: "duplicate" } };
  const notice = ADMIN_NOTICES[event.type];
  if (notice) return { status: 200, outcome: await noteForAdmin(gateway, store, event, notice, now) };
  if (!event.subscriptionId) {
    await store.recordEvent(event.id, event.type);
    return { status: 200, outcome: { kind: "no-subscription" } };
  }
  const outcome = await syncSubscription(gateway, store, event.subscriptionId, {
    source: "webhook",
    event: { id: event.id, type: event.type },
    userIdHint: event.userId,
    policy,
    now,
  });
  return { status: 200, outcome };
}

export interface ReconcileReport {
  checked: number;
  corrected: number;
  failed: { id: string; error: string }[];
}

/**
 * Re-reads every stored subscription that has not ended and corrects what differs (Acceptance 4). It is also what moves
 * time on: a grace that has run out, or a last notice now due, is written and queued here when no event comes (D377).
 */
export async function reconcile(gateway: BillingGateway, store: BillingStore, now: Date, policy: BillingPolicy): Promise<ReconcileReport> {
  const report: ReconcileReport = { checked: 0, corrected: 0, failed: [] };
  for (const id of await store.openSubscriptionIds()) {
    report.checked += 1;
    try {
      const outcome = await syncSubscription(gateway, store, id, { source: "reconcile", event: null, userIdHint: null, policy, now });
      if ((outcome.kind === "saved" && outcome.changes > 0) || outcome.kind === "second") report.corrected += 1;
    } catch (error) {
      report.failed.push({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}
