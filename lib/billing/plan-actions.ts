"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { featureUsable } from "@/lib/features/features";
import { featureStatesFor } from "@/lib/features/server";
import { currentLegalVersions } from "@/lib/legal/server";
import { prisma } from "@/lib/prisma";
import { billingPolicy } from "@/lib/settings/server";
import { consentRefusal } from "./consent";
import { BillingUnavailableError, type BillingGateway } from "./contract";
import { deliverFakeEvents } from "./fake-delivery";
import { billingGateway, currentBillingSettings, fakeBillingGateway } from "./gateway";
import { deliverQueuedNotices } from "./notice-delivery";
import { CANCEL_REFUSED, CHANGE_REFUSED, cancelRefusal, changeKind, changeRefusal, targetRefusal } from "./plan-change";
import { prismaBillingStore } from "./prisma-store";
import { BUYING_FEATURE, CHECKOUT_REFUSED } from "./purchase";
import { isFinal, syncSubscription } from "./sync";

/**
 * The Plan page's changes to a plan (G-129 M3, D388): move to another price, cancel at the period's end, take the
 * cancellation back, and drop a change waiting for the renewal. Who acts is the session's. Each runs under a lock on the
 * subscription and reads the row afresh inside it, so a double submit finds the first one's result and does nothing
 * more; each then syncs the subscription, as its event would.
 */

export interface PlanActionState {
  error?: string;
  done?: boolean;
}

const PLAN_PATH = "/account/plan";

const ROW_SELECT = {
  id: true,
  kind: true,
  status: true,
  endedAt: true,
  cancelAtPeriodEnd: true,
  stripeSubscriptionId: true,
  priceId: true,
  scheduledPriceId: true,
} as const;

type Row = { id: string; kind: string; status: string; endedAt: Date | null; cancelAtPeriodEnd: boolean } & {
  stripeSubscriptionId: string | null;
  priceId: string | null;
  scheduledPriceId: string | null;
};

const rowOf = (userId: string): Promise<Row | null> => prisma.subscription.findUnique({ where: { userId }, select: ROW_SELECT });

async function sync(gateway: BillingGateway, subscriptionId: string): Promise<void> {
  await syncSubscription(gateway, prismaBillingStore, subscriptionId, {
    source: "person",
    event: null,
    userIdHint: null,
    policy: await billingPolicy(),
    now: new Date(),
  });
}

/**
 * Runs one change under the subscription's lock: `work` gets the row as it is now and returns a refusal, or null once
 * done. The provider's being unreachable is a refusal in words; on a local run the fake's events reach the webhook after.
 */
async function underLock(
  refused: { unavailable: string; none: string; gate?: (userId: string) => Promise<string | null> },
  work: (gateway: BillingGateway, userId: string, row: Row | null) => Promise<string | null>
): Promise<PlanActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const [gateway, stored] = await Promise.all([billingGateway(), rowOf(userId)]);
  const settings = currentBillingSettings();
  if (!gateway || !settings.on) return { error: CHANGE_REFUSED.off };
  const gated = await refused.gate?.(userId);
  if (gated) return { error: gated };
  if (!stored?.stripeSubscriptionId) return { error: refused.none };
  const unavailable = refused.unavailable;
  try {
    const refusal = await prismaBillingStore.locked(`plan:${stored.stripeSubscriptionId}`, async () =>
      work(gateway, userId, await rowOf(userId))
    );
    if (refusal) return { error: refusal };
  } catch (error) {
    if (error instanceof BillingUnavailableError) return { error: unavailable };
    throw error;
  }
  const fake = await fakeBillingGateway();
  if (fake) await deliverFakeEvents(fake, settings.siteUrl);
  await deliverQueuedNotices(new Date());
  revalidatePath(PLAN_PATH);
  return { done: true };
}

const PRICE_SELECT = { id: true, stripePriceId: true, amount: true, currency: true, interval: true, current: true } as const;

/**
 * Moves the plan to another price: at once with the difference charged for more, at the renewal for less (D388). A
 * change made now is an agreement to pay, so it takes the same consent as a purchase, recorded before the provider is asked.
 */
export async function changePlanAction(_prev: PlanActionState, formData: FormData): Promise<PlanActionState> {
  const field = (name: string) => (typeof formData.get(name) === "string" ? (formData.get(name) as string) : "");
  const targetId = field("priceId");
  return underLock(
    {
      unavailable: CHANGE_REFUSED.unavailable,
      none: CHANGE_REFUSED.none,
      // Buying more is buying: it is under the same feature as Checkout. Cancelling never is.
      gate: async (userId) => (featureUsable(await featureStatesFor(userId), BUYING_FEATURE) ? null : CHECKOUT_REFUSED.hidden),
    },
    async (gateway, userId, row) => {
      const refusal = changeRefusal(row);
      if (refusal || !row?.stripeSubscriptionId) return refusal ?? CHANGE_REFUSED.none;
      const [target, current] = await Promise.all([
        targetId ? prisma.price.findUnique({ where: { id: targetId }, select: PRICE_SELECT }) : null,
        row.priceId ? prisma.price.findUnique({ where: { id: row.priceId }, select: PRICE_SELECT }) : null,
      ]);
      // Already on it: a double submit, or the current price chosen while a change waits, which then goes.
      if (target && target.id === row.priceId) {
        if (row.scheduledPriceId) {
          await gateway.dropScheduledChange(row.stripeSubscriptionId);
          await sync(gateway, row.stripeSubscriptionId);
        }
        return null;
      }
      const wrong = targetRefusal(current, target);
      if (wrong || !target) return wrong ?? CHANGE_REFUSED.price;
      // A price with no record of its own falls to the renewal: nothing is charged now on a guess.
      const when = current ? changeKind(current, target) : "renewal";
      if (when === "renewal" && row.scheduledPriceId === target.id) return null;
      if (when === "now") {
        const documents = await currentLegalVersions();
        const posted = {
          agreedTerms: field("agreeTerms") === "on",
          agreedWithdrawal: field("agreeWithdrawal") === "on",
          termsVersionId: field("termsVersionId"),
          withdrawalVersionId: field("withdrawalVersionId"),
        };
        const inForce = { terms: documents.terms ?? null, privacy: documents.privacy ?? null, withdrawal: documents.withdrawal ?? null };
        const unconsented = consentRefusal(inForce, posted);
        if (unconsented) return unconsented;
        await prisma.purchaseConsent.create({
          data: {
            userId,
            priceId: target.id,
            termsVersionId: posted.termsVersionId,
            withdrawalVersionId: posted.withdrawalVersionId,
            subscriptionId: row.id,
          },
        });
      }
      const { applied } = await gateway.changePlan(row.stripeSubscriptionId, target.stripePriceId, when);
      if (!applied) return CHANGE_REFUSED.declined;
      await sync(gateway, row.stripeSubscriptionId);
      return null;
    }
  );
}

/** Sets the plan to end at the end of the period paid for; open while a payment fails. */
export async function cancelPlanAction(): Promise<PlanActionState> {
  return underLock({ unavailable: CANCEL_REFUSED.unavailable, none: CANCEL_REFUSED.none }, async (gateway, _userId, row) => {
    const refusal = cancelRefusal(row);
    if (refusal || !row?.stripeSubscriptionId) return refusal ?? CANCEL_REFUSED.none;
    if (row.cancelAtPeriodEnd) return null;
    await gateway.cancelSubscription(row.stripeSubscriptionId, { atPeriodEnd: true });
    await sync(gateway, row.stripeSubscriptionId);
    return null;
  });
}

/** Takes back a cancellation while the plan lasts: it renews again. */
export async function keepPlanAction(): Promise<PlanActionState> {
  return underLock({ unavailable: CHANGE_REFUSED.unavailable, none: CANCEL_REFUSED.none }, async (gateway, _userId, row) => {
    if (!row?.stripeSubscriptionId) return CANCEL_REFUSED.none;
    if (isFinal(row)) return CANCEL_REFUSED.ended;
    if (!row.cancelAtPeriodEnd) return null;
    await gateway.resumeSubscription(row.stripeSubscriptionId);
    await sync(gateway, row.stripeSubscriptionId);
    return null;
  });
}

/** Drops a change waiting for the renewal: the plan renews as it is. */
export async function keepCurrentPlanAction(): Promise<PlanActionState> {
  return underLock({ unavailable: CHANGE_REFUSED.unavailable, none: CANCEL_REFUSED.none }, async (gateway, _userId, row) => {
    if (!row?.stripeSubscriptionId) return CHANGE_REFUSED.none;
    if (!row.scheduledPriceId) return null;
    await gateway.dropScheduledChange(row.stripeSubscriptionId);
    await sync(gateway, row.stripeSubscriptionId);
    return null;
  });
}
