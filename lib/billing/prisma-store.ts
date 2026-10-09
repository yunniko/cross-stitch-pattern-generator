import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  FINAL_STATUSES,
  type BillingStore,
  type BillingTx,
  type HistoryEntry,
  type HistoryMeta,
  type StoredSubscription,
  type SubscriptionFields,
} from "./sync";
import {
  NOTICE_MAX_AGE_MS,
  NOTICE_MAX_ATTEMPTS,
  type NoticeMessage,
  type NoticeQueue,
  type NoticeSlot,
  type NoticeValues,
} from "./notices";
import { UNLINKED_CONSENT_MS, type ConsentRecord } from "./consent";

/**
 * The billing write path's store in Postgres (G-106 M2). One transaction per sync, holding an advisory lock on the
 * provider's subscription id, as the counted limits lock per person (D364). The transaction's timeout allows for the
 * provider calls made inside it (a fetch, and at most one cancellation; each is limited to 20 s by the adapter).
 */

const TRANSACTION_TIMEOUT_MS = 60_000;

/** The fields of a stored subscription (`StoredSubscription`), as the sync and the admin's grants read them. */
export const STORED_SELECT = {
  id: true,
  userId: true,
  kind: true,
  tierId: true,
  priceId: true,
  status: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  endedAt: true,
  firstFailedAt: true,
  nextAttemptAt: true,
  payUrl: true,
  actionNeeded: true,
} as const;

function transactionStore(tx: Prisma.TransactionClient): BillingTx {
  const history = (subscriptionId: string, entries: HistoryEntry[], meta: HistoryMeta) =>
    entries.length === 0
      ? Promise.resolve()
      : tx.subscriptionEvent
          .createMany({
            data: entries.map((entry) => ({ subscriptionId, ...entry, source: meta.source, eventId: meta.eventId, at: meta.at })),
          })
          .then(() => undefined);

  return {
    eventSeen: async (id) => (await tx.billingEvent.findUnique({ where: { id }, select: { id: true } })) !== null,
    recordEvent: async (id, type) => {
      await tx.billingEvent.create({ data: { id, type } });
    },
    subscriptionByProviderId: (id): Promise<StoredSubscription | null> =>
      tx.subscription.findUnique({ where: { stripeSubscriptionId: id }, select: STORED_SELECT }),
    subscriptionByUser: (userId): Promise<StoredSubscription | null> =>
      tx.subscription.findUnique({ where: { userId }, select: STORED_SELECT }),
    subscriptionByCustomer: (customerId): Promise<StoredSubscription | null> =>
      tx.subscription.findFirst({ where: { stripeCustomerId: customerId }, orderBy: { updatedAt: "desc" }, select: STORED_SELECT }),
    userExists: async (userId) => (await tx.user.findUnique({ where: { id: userId }, select: { id: true } })) !== null,
    priceByProviderId: (id) => tx.price.findUnique({ where: { stripePriceId: id }, select: { id: true, tierId: true } }),
    save: async (id: string | null, fields: SubscriptionFields, entries: HistoryEntry[], meta: HistoryMeta) => {
      const data = { ...fields, syncedAt: meta.at };
      const row = id
        ? await tx.subscription.update({ where: { id }, data, select: { id: true } })
        : await tx.subscription.create({ data, select: { id: true } });
      await history(row.id, entries, meta);
      return row.id;
    },
    appendHistory: history,
    noticesOf: (subscriptionId) =>
      tx.billingNotice.findMany({ where: { subscriptionId }, select: { failedAt: true, slot: true } }) as Promise<
        { failedAt: Date; slot: NoticeSlot }[]
      >,
    queueNotices: async (subscriptionId, notices) => {
      await tx.billingNotice.createMany({
        data: notices.map((notice) => ({
          subscriptionId,
          failedAt: notice.failedAt,
          slot: notice.slot,
          message: notice.message,
          values: notice.values as Prisma.InputJsonObject,
        })),
        skipDuplicates: true,
      });
    },
    consentFor: async (id, userId): Promise<ConsentRecord | null> => {
      const row = await tx.purchaseConsent.findFirst({
        where: { id, userId },
        select: {
          id: true,
          createdAt: true,
          subscriptionId: true,
          priceId: true,
          termsVersion: { select: { version: true, publishedAt: true } },
          withdrawalVersion: { select: { body: true } },
        },
      });
      if (!row) return null;
      const price = await tx.price.findUnique({
        where: { id: row.priceId },
        select: { amount: true, currency: true, interval: true, tier: { select: { name: true } } },
      });
      return {
        id: row.id,
        createdAt: row.createdAt,
        subscriptionId: row.subscriptionId,
        tierName: price?.tier.name ?? "Your plan",
        price: price ? { amount: price.amount, currency: price.currency, interval: price.interval } : null,
        termsVersion: row.termsVersion.version,
        termsPublishedAt: row.termsVersion.publishedAt,
        acknowledgment: row.withdrawalVersion.body,
      };
    },
    linkConsent: async (id, subscriptionId) => {
      await tx.purchaseConsent.update({ where: { id }, data: { subscriptionId } });
    },
  };
}

/** Consents whose Checkout was never completed, once a late webhook could no longer tie them (D384). */
export async function pruneUnlinkedConsents(now: Date): Promise<number> {
  const { count } = await prisma.purchaseConsent.deleteMany({
    where: { subscriptionId: null, createdAt: { lt: new Date(now.getTime() - UNLINKED_CONSENT_MS) } },
  });
  return count;
}

export const prismaBillingStore: BillingStore = {
  locked: (key, work) =>
    prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${key}))`;
        return work(transactionStore(tx));
      },
      { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_TIMEOUT_MS }
    ),
  eventSeen: async (id) => (await prisma.billingEvent.findUnique({ where: { id }, select: { id: true } })) !== null,
  recordEvent: async (id, type) => {
    // Two deliveries of one event at once: the second's insert meets the first's row, which is the same outcome.
    await prisma.billingEvent.createMany({ data: [{ id, type }], skipDuplicates: true });
  },
  openSubscriptionIds: async () =>
    (
      await prisma.subscription.findMany({
        where: { endedAt: null, stripeSubscriptionId: { not: null }, status: { notIn: [...FINAL_STATUSES] } },
        select: { stripeSubscriptionId: true },
      })
    ).map((row) => row.stripeSubscriptionId!),
};

/** The notices waiting to be sent (G-126 M2, D377). */
export const prismaNoticeQueue: NoticeQueue = {
  pending: async (now) =>
    (
      await prisma.billingNotice.findMany({
        where: { sentAt: null, attempts: { lt: NOTICE_MAX_ATTEMPTS }, createdAt: { gt: new Date(now.getTime() - NOTICE_MAX_AGE_MS) } },
        orderBy: { createdAt: "asc" },
        select: { id: true, message: true, values: true, subscription: { select: { user: { select: { email: true } } } } },
      })
    ).map((row) => ({
      id: row.id,
      message: row.message as NoticeMessage,
      values: row.values as NoticeValues,
      email: row.subscription.user.email || null,
    })),
  claim: async (id, now) =>
    (await prisma.billingNotice.updateMany({ where: { id, sentAt: null }, data: { sentAt: now, attempts: { increment: 1 } } })).count === 1,
  release: async (id) => {
    await prisma.billingNotice.update({ where: { id }, data: { sentAt: null } });
  },
};
