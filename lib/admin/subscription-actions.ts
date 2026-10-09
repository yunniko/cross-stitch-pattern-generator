"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { logChange } from "@/lib/admin/change-log-data";
import { BILLING_SCOPE } from "@/lib/admin/change-log";
import { formatMoney, moveRefusal } from "@/lib/billing/admin-view";
import { BillingUnavailableError, type BillingGateway } from "@/lib/billing/contract";
import { deliverFakeEvents } from "@/lib/billing/fake-delivery";
import { billingGateway, currentBillingSettings, fakeBillingGateway } from "@/lib/billing/gateway";
import { formatDay, formatPrice } from "@/lib/billing/notices";
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

async function attempt(work: () => Promise<string | void>): Promise<SubscriptionActionResult> {
  try {
    const done = await work();
    return done ? { done } : {};
  } catch (error) {
    if (error instanceof BillingUnavailableError) return { error: UNAVAILABLE };
    return { error: error instanceof Error ? error.message : "The change was refused." };
  }
}

async function gatewayOrRefuse(): Promise<BillingGateway> {
  const gateway = await billingGateway();
  if (!gateway) throw new Error(OFF);
  return gateway;
}

/** On a local run, the fake's events go to this server's webhook now, as Stripe would send its own. */
async function deliverIfFake() {
  const fake = await fakeBillingGateway();
  const settings = currentBillingSettings();
  if (fake && settings.on) await deliverFakeEvents(fake, settings.siteUrl);
}

function revalidateSubscriptions(userId?: string) {
  revalidatePath("/admin/billing");
  revalidatePath("/admin/users");
  if (userId) revalidatePath(`/admin/users/${userId}/billing`);
  revalidatePath("/admin/changes");
  revalidatePath("/account/plan");
}

/** Gives back what is left of one of the person's payments. The provider's "refunded" event follows by the webhook. */
export async function refundPaymentAction(userId: string, paymentId: string, requestKey: string): Promise<SubscriptionActionResult> {
  return attempt(async () => {
    const admin = await requireAdmin();
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
    if (payment.refunded >= payment.amount) throw new Error("That payment has already been refunded.");
    const left = formatMoney(payment.amount - payment.refunded, payment.currency);
    await gateway.refundPayment(paymentId, requestKey);
    const said = `${left} of the payment of ${formatDay(payment.paidAt)} (${paymentId})`;
    await prisma.subscriptionEvent.create({
      data: { subscriptionId: user.subscription.id, kind: "refund-asked", before: null, after: said, source: "admin", eventId: null },
    });
    await logChange(admin, BILLING_SCOPE, userId, `${user.email}: refund of ${said}`);
    await deliverIfFake();
    revalidateSubscriptions(userId);
    return `Refund of ${left} asked.`;
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
  return attempt(async () => {
    const admin = await requireAdmin();
    await moveOne(await gatewayOrRefuse(), admin, userId);
    await deliverIfFake();
    revalidateSubscriptions(userId);
    return "Moved to the price offered now, from the next renewal.";
  });
}

/**
 * Moves everyone on a price no longer offered to the tier's current price for the same period. Each is moved alone; a
 * subscription that may not move (a failing payment, say) is left on its price and counted.
 */
export async function movePriceHoldersAction(priceId: string): Promise<SubscriptionActionResult> {
  return attempt(async () => {
    const admin = await requireAdmin();
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
    await deliverIfFake();
    revalidateSubscriptions();
    const kept = left.length > 0 ? `; ${left.length} left on their price (${[...new Set(left)].join(" ")})` : "";
    const stopped = untried > 0 ? `; the payment provider stopped answering, so ${untried} were not tried` : "";
    return `Moved ${moved} ${moved === 1 ? "person" : "people"}${kept}${stopped}.`;
  });
}
