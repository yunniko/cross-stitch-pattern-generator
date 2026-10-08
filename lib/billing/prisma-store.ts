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

/**
 * The billing write path's store in Postgres (G-106 M2). One transaction per sync, holding an advisory lock on the
 * provider's subscription id, as the counted limits lock per person (D364). The transaction's timeout allows for the
 * provider calls made inside it (a fetch, and at most one cancellation; each is limited to 20 s by the adapter).
 */

const TRANSACTION_TIMEOUT_MS = 60_000;

const STORED_SELECT = {
  id: true,
  userId: true,
  tierId: true,
  priceId: true,
  status: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  endedAt: true,
  firstFailedAt: true,
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
    userExists: async (userId) => (await tx.user.findUnique({ where: { id: userId }, select: { id: true } })) !== null,
    priceByProviderId: (id) => tx.price.findUnique({ where: { stripePriceId: id }, select: { id: true, tierId: true } }),
    save: async (id: string | null, fields: SubscriptionFields, entries: HistoryEntry[], meta: HistoryMeta) => {
      const data = { ...fields, syncedAt: meta.at };
      const row = id
        ? await tx.subscription.update({ where: { id }, data, select: { id: true } })
        : await tx.subscription.create({ data, select: { id: true } });
      await history(row.id, entries, meta);
    },
    appendHistory: history,
  };
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
