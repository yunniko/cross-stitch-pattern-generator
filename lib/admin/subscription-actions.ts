"use server";

import { revalidatePath } from "next/cache";
import { adminAction, type Admin } from "@/lib/admin/admin-action";
import { logChange } from "@/lib/admin/change-log-data";
import { BILLING_SCOPE } from "@/lib/admin/change-log";
import { formatMoney, moveRefusal } from "@/lib/billing/admin-view";
import { BillingUnavailableError, type BillingGateway } from "@/lib/billing/contract";
import { billingGateway, deliverFakeEvents } from "@/lib/billing/gateway";
import { formatDay, formatPrice } from "@/lib/billing/notices";
import { refundAmount, type RefundAsk } from "@/lib/billing/refund-rule";
import { prismaBillingStore } from "@/lib/billing/prisma-store";
import { syncSubscription } from "@/lib/billing/sync";
import { prisma } from "@/lib/prisma";
import { billingPolicy } from "@/lib/settings/server";

/**
 * The admin's actions on people's subscriptions (G-127 M2): a refund through the contract, and moving subscribers to
 * their tier's current price (D381). Each checks the caller is an admin, refuses the caller's own subscription (as
 * `user-actions.ts` refuses their own role), logs a line under BILLING and writes the person's history. A refusal
 * travels as `error`, never thrown.
 */

export type SubscriptionActionResult = { error?: string; done?: string };

const OFF = "Billing is off on this server, so nothing can be changed at the payment provider.";
const UNAVAILABLE = "The payment provider could not be reached. Nothing was changed; please try again in a few minutes.";
const OWN = "Your own subscription is not changed here; another admin changes it.";

function attempt(work: (admin: Admin) => Promise<string | void>): Promise<SubscriptionActionResult> {
  return adminAction(
    async (admin): Promise<SubscriptionActionResult> => {
      const done = await work(admin);
      return done ? { done } : {};
    },
    { explain: (error) => (error instanceof BillingUnavailableError ? UNAVAILABLE : undefined) }
  );
}

async function gatewayOrRefuse(): Promise<BillingGateway> {
  const gateway = await billingGateway();
  if (!gateway) throw new Error(OFF);
  return gateway;
}

function revalidateSubscriptions(userId?: string) {
  revalidatePath("/admin/billing");
  revalidatePath("/admin/users");
  if (userId) revalidatePath(`/admin/users/${userId}/billing`);
  revalidatePath("/admin/changes");
  revalidatePath("/account/plan");
}

/**
 * Gives back part or all of one of the person's payments (G-129 M1, D386): all that is left, the unused part of the
 * period it paid for (worked out now, not when the page was read), or an amount the admin enters. The provider's
 * "refunded" event follows by the webhook.
 */
export async function refundPaymentAction(
  userId: string,
  paymentId: string,
  requestKey: string,
  ask: RefundAsk
): Promise<SubscriptionActionResult> {
  return attempt(async (admin) => {
    if (userId === admin.id) throw new Error(OWN);
    if (!/^[A-Za-z0-9-]{8,64}$/.test(requestKey)) throw new Error("The page is out of date; reload it.");
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, subscription: { select: { id: true, stripeCustomerId: true } } },
    });
    const customerId = user?.subscription?.stripeCustomerId;
    if (!user || !user.subscription || !customerId) throw new Error("This person has made no payment here.");
    const gateway = await gatewayOrRefuse();
    const payment = (await gateway.listPayments(customerId)).find((candidate) => candidate.id === paymentId);
    if (!payment) throw new Error("That payment is not one of this person's latest.");
    const decided = refundAmount(payment, ask, new Date());
    if ("refusal" in decided) throw new Error(decided.refusal);
    const given = formatMoney(decided.amount, payment.currency);
    await gateway.refundPayment(paymentId, requestKey, decided.amount);
    const part = ask.kind === "unused" ? " (the unused part)" : "";
    const said = `${given}${part} of the payment of ${formatDay(payment.paidAt)} (${paymentId})`;
    await prisma.subscriptionEvent.create({
      data: { subscriptionId: user.subscription.id, kind: "refund-asked", before: null, after: said, source: "admin", eventId: null },
    });
    await logChange(admin, BILLING_SCOPE, userId, `${user.email}: refund of ${said}`);
    await deliverFakeEvents();
    revalidateSubscriptions(userId);
    return `Refund of ${given}${part} asked.`;
  });
}

/** The current price of the same tier and period as `priceId`'s, if there is one. */
async function currentPriceFor(priceId: string | null) {
  if (!priceId) return null;
  const price = await prisma.price.findUnique({ where: { id: priceId }, select: { tierId: true, interval: true } });
  if (!price) return null;
  return prisma.price.findFirst({
    where: { tierId: price.tierId, interval: price.interval, current: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, stripePriceId: true, amount: true, currency: true, interval: true, tier: { select: { name: true } } },
  });
}

/** Moves one person's subscription to its tier's current price and syncs it; throws the refusal when it may not. */
async function moveOne(gateway: BillingGateway, admin: { id: string; email: string }, userId: string): Promise<void> {
  if (userId === admin.id) throw new Error(OWN);
  const stored = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      kind: true,
      status: true,
      endedAt: true,
      firstFailedAt: true,
      stripeSubscriptionId: true,
      priceId: true,
      price: { select: { amount: true, currency: true, interval: true } },
      user: { select: { email: true } },
    },
  });
  if (!stored) throw new Error("This person has no subscription.");
  const target = await currentPriceFor(stored.priceId);
  const refusal = moveRefusal(stored, target);
  if (refusal) throw new Error(refusal);
  await gateway.movePrice(stored.stripeSubscriptionId!, target!.stripePriceId);
  const now = new Date();
  await syncSubscription(gateway, prismaBillingStore, stored.stripeSubscriptionId!, {
    source: "admin",
    event: null,
    userIdHint: null,
    policy: await billingPolicy(),
    now,
  });
  const from = stored.price ? formatPrice(stored.price) : "its price";
  await logChange(
    admin,
    BILLING_SCOPE,
    userId,
    `${stored.user.email}: moved from ${from} to ${formatPrice(target!)} from the next renewal`
  );
}

/** Moves one person to their tier's current price for the same period, from their next renewal. */
export async function movePersonPriceAction(userId: string): Promise<SubscriptionActionResult> {
  return attempt(async (admin) => {
    await moveOne(await gatewayOrRefuse(), admin, userId);
    await deliverFakeEvents();
    revalidateSubscriptions(userId);
    return "Moved to the price offered now, from the next renewal.";
  });
}

/**
 * Moves everyone on a price no longer offered to the tier's current price for the same period. Each is moved alone; a
 * subscription that may not move (a failing payment, say) is left on its price and counted.
 */
export async function movePriceHoldersAction(priceId: string): Promise<SubscriptionActionResult> {
  return attempt(async (admin) => {
    const gateway = await gatewayOrRefuse();
    const holders = await prisma.subscription.findMany({
      where: { priceId, kind: "stripe", endedAt: null },
      select: { userId: true },
    });
    let moved = 0;
    let untried = 0;
    const left: string[] = [];
    for (const [index, { userId }] of holders.entries()) {
      try {
        await moveOne(gateway, admin, userId);
        moved += 1;
      } catch (error) {
        // The provider gone: those already moved stay moved, and the rest are not tried.
        if (error instanceof BillingUnavailableError) {
          untried = holders.length - index;
          break;
        }
        left.push(error instanceof Error ? error.message : String(error));
      }
    }
    await deliverFakeEvents();
    revalidateSubscriptions();
    const kept = left.length > 0 ? `; ${left.length} left on their price (${[...new Set(left)].join(" ")})` : "";
    const stopped = untried > 0 ? `; the payment provider stopped answering, so ${untried} were not tried` : "";
    return `Moved ${moved} ${moved === 1 ? "person" : "people"}${kept}${stopped}.`;
  });
}
