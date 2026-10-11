"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { billingPolicy } from "@/lib/settings/server";
import { BillingUnavailableError, type BillingGateway } from "./contract";
import { billingGateway, currentBillingSettings, deliverFakeEvents } from "./gateway";
import { deliverQueuedNotices } from "./notice-delivery";
import { prismaBillingStore } from "./prisma-store";
import { isFinal, syncSubscription } from "./sync";
import {
  readRefunds,
  refundTotal,
  WITHDRAWAL_REFUSED,
  withdrawalOpenUntil,
  withdrawalReceipt,
  withdrawalRefunds,
  type PlannedRefund,
} from "./withdrawal";

/**
 * The person's withdrawal from their subscription (G-129 M2, D387), from the Plan page's confirmation step. Who withdraws
 * is the session's. The withdrawal is recorded first, with the refunds decided at that moment; then the subscription is
 * ended at once and each refund asked under a key made from the record's id. A double submit or a retry finds the record
 * and finishes the same withdrawal, so nothing is ended or given back twice.
 */

export interface WithdrawalActionState {
  error?: string;
  done?: boolean;
}

const PLAN_PATH = "/account/plan";

type Recorded = { id: string; stripeSubscriptionId: string; refunds: PlannedRefund[]; completedAt: Date | null };

async function recordOf(stripeSubscriptionId: string): Promise<Recorded | null> {
  const row = await prisma.withdrawal.findUnique({
    where: { stripeSubscriptionId },
    select: { id: true, stripeSubscriptionId: true, refunds: true, completedAt: true },
  });
  return row ? { ...row, refunds: readRefunds(row.refunds) } : null;
}

/** Ends the subscription now and asks each refund; marks the record done and writes the history once. */
async function finish(gateway: BillingGateway, record: Recorded, subscriptionRowId: string): Promise<void> {
  const snapshot = await gateway.fetchSubscription(record.stripeSubscriptionId);
  if (snapshot && !isFinal(snapshot)) await gateway.cancelSubscription(record.stripeSubscriptionId, { atPeriodEnd: false });
  for (const refund of record.refunds)
    await gateway.refundPayment(refund.paymentId, `withdrawal-${record.id}-${refund.paymentId}`, refund.amount);
  const now = new Date();
  await syncSubscription(gateway, prismaBillingStore, record.stripeSubscriptionId, {
    source: "person",
    event: null,
    userIdHint: null,
    policy: await billingPolicy(),
    now,
  });
  const marked = await prisma.withdrawal.updateMany({ where: { id: record.id, completedAt: null }, data: { completedAt: now } });
  if (marked.count === 1) {
    await prisma.subscriptionEvent.create({
      data: {
        subscriptionId: subscriptionRowId,
        kind: "withdrawal",
        before: null,
        after: `${refundTotal(record.refunds)} given back`,
        source: "person",
        eventId: null,
        at: now,
      },
    });
  }
}

export async function withdrawAction(): Promise<WithdrawalActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const [gateway, stored] = await Promise.all([
    billingGateway(),
    prisma.subscription.findUnique({
      where: { userId },
      select: { id: true, kind: true, status: true, endedAt: true, startedAt: true, stripeSubscriptionId: true, stripeCustomerId: true },
    }),
  ]);
  const settings = currentBillingSettings();
  if (!gateway || !settings.on) return { error: WITHDRAWAL_REFUSED.off };
  if (!stored?.stripeSubscriptionId || !stored.stripeCustomerId) return { error: WITHDRAWAL_REFUSED.none };

  const subscriptionId = stored.stripeSubscriptionId;
  const customerId = stored.stripeCustomerId;
  let recorded = false;
  try {
    // One request at a time per subscription: a double submit waits, then finds the withdrawal finished.
    const refusal = await prismaBillingStore.locked(`withdrawal:${subscriptionId}`, async () => {
      let record = await recordOf(subscriptionId);
      if (!record) {
        const now = new Date();
        if (!withdrawalOpenUntil(stored, now)) return stored.startedAt ? WITHDRAWAL_REFUSED.over : WITHDRAWAL_REFUSED.none;
        const refunds = withdrawalRefunds(await gateway.listPayments(customerId), stored.startedAt!, now);
        // Written outside the lock's transaction, so it stands even when a later step fails and is retried; its
        // acknowledgment by mail is queued with it.
        const receipt = withdrawalReceipt({ requestedAt: now, refunds });
        await prisma.$transaction([
          prisma.withdrawal.create({
            data: { userId, stripeSubscriptionId: subscriptionId, refunds: refunds as unknown as Prisma.InputJsonArray, requestedAt: now },
          }),
          prisma.billingNotice.createMany({
            data: [
              {
                subscriptionId: stored.id,
                failedAt: receipt.failedAt,
                slot: receipt.slot,
                message: receipt.message,
                values: receipt.values as Prisma.InputJsonObject,
              },
            ],
            skipDuplicates: true,
          }),
        ]);
        record = await recordOf(subscriptionId);
        if (!record) throw new Error("the withdrawal was not recorded");
      }
      recorded = true;
      if (!record.completedAt) await finish(gateway, record, stored.id);
      return null;
    });
    if (refusal) return { error: refusal };
  } catch (error) {
    if (!(error instanceof BillingUnavailableError)) throw error;
    if (!recorded) return { error: WITHDRAWAL_REFUSED.unavailable };
    // Received all the same: its acknowledgment goes now, and only finishing it waits for the provider.
    await deliverQueuedNotices(new Date());
    revalidatePath(PLAN_PATH);
    return { error: WITHDRAWAL_REFUSED.unfinished };
  }
  // On a local run, the fake's events reach this server's webhook now; the acknowledgment goes either way.
  await deliverFakeEvents();
  await deliverQueuedNotices(new Date());
  revalidatePath(PLAN_PATH);
  return { done: true };
}
