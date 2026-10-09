"use server";

import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fakeBillingGateway, currentBillingSettings } from "@/lib/billing/gateway";
import { deliverFakeEvents } from "@/lib/billing/fake-delivery";
import { deliverQueuedNotices } from "@/lib/billing/notice-delivery";
import { prismaBillingStore } from "@/lib/billing/prisma-store";
import { reconcile } from "@/lib/billing/sync";
import { billingPolicy } from "@/lib/settings/server";

/**
 * What the person does on the fake provider's pages (G-106 M3, D373): pay a Checkout, cancel in the Portal, pay a failing
 * invoice (G-126 M2), and what no real page offers — end the period now, with its renewal paid or failing, and move a
 * failure back past the grace — so a test need not wait a month. Each answers only while the fake
 * is the adapter, which `settings.ts` allows on a local address alone; anywhere else they are not found.
 */

async function fake() {
  const gateway = await fakeBillingGateway();
  const settings = currentBillingSettings();
  if (!gateway || !settings.on) notFound();
  return { gateway, siteUrl: settings.siteUrl };
}

async function signedInUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

export async function payFakeCheckoutAction(formData: FormData): Promise<void> {
  const { gateway, siteUrl } = await fake();
  const userId = await signedInUserId();
  const session = String(formData.get("session") ?? "");
  const open = gateway.openSession(session);
  if (!open || open.input.userId !== userId) notFound();
  gateway.completeCheckout(session);
  await deliverFakeEvents(gateway, siteUrl);
  redirect(open.input.successUrl);
}

/** The subscription named, when it belongs to the signed-in person's customer. */
async function ownSubscription(formData: FormData) {
  const { gateway, siteUrl } = await fake();
  const userId = await signedInUserId();
  const stored = await prisma.subscription.findUnique({ where: { userId }, select: { stripeCustomerId: true } });
  const id = String(formData.get("subscription") ?? "");
  const subscription = await gateway.fetchSubscription(id);
  if (!subscription || !stored?.stripeCustomerId || subscription.customerId !== stored.stripeCustomerId) notFound();
  return { gateway, siteUrl, id };
}

export async function cancelFakeSubscriptionAction(formData: FormData): Promise<void> {
  const { gateway, siteUrl, id } = await ownSubscription(formData);
  await gateway.cancelSubscription(id, { atPeriodEnd: true });
  await deliverFakeEvents(gateway, siteUrl);
  redirect("/account/plan");
}

export async function endFakePeriodAction(formData: FormData): Promise<void> {
  const { gateway, siteUrl, id } = await ownSubscription(formData);
  gateway.endPeriod(id, "paid");
  await deliverFakeEvents(gateway, siteUrl);
  redirect("/account/plan");
}

export async function failFakeRenewalAction(formData: FormData): Promise<void> {
  const { gateway, siteUrl, id } = await ownSubscription(formData);
  gateway.endPeriod(id, "failed");
  await deliverFakeEvents(gateway, siteUrl);
  redirect("/account/plan");
}

export async function payFakeInvoiceAction(formData: FormData): Promise<void> {
  const { gateway, siteUrl, id } = await ownSubscription(formData);
  gateway.pay(id);
  await deliverFakeEvents(gateway, siteUrl);
  redirect("/account/plan");
}

/**
 * The failure moved back a day past the grace, as if that time had passed: the notices already queued for it move with
 * it, as they are keyed by its date (D377). No event comes of it, so the app reconciles as its hourly pass would.
 */
export async function backdateFakeFailureAction(formData: FormData): Promise<void> {
  const { gateway, id } = await ownSubscription(formData);
  const policy = await billingPolicy();
  const failedAt = (await gateway.fetchSubscription(id))?.firstFailedAt;
  if (!failedAt) notFound();
  const moved = gateway.backdateFailure(id, policy.graceDays + 1).firstFailedAt!;
  await prisma.billingNotice.updateMany({
    where: { failedAt, subscription: { stripeSubscriptionId: id } },
    data: { failedAt: moved },
  });
  const now = new Date();
  await reconcile(gateway, prismaBillingStore, now, policy);
  await deliverQueuedNotices(now);
  redirect("/account/plan");
}

/**
 * The subscription moved back the days posted (3 or 15), as if it had begun then (G-129 M2): a withdrawal's refund and
 * its 14 days are tried without waiting. No event comes of it, so the app reconciles as its hourly pass would.
 */
export async function backdateFakeStartAction(formData: FormData): Promise<void> {
  const { gateway, id } = await ownSubscription(formData);
  const days = Number(formData.get("days"));
  if (days !== 3 && days !== 15) notFound();
  gateway.backdateStart(id, days);
  await reconcile(gateway, prismaBillingStore, new Date(), await billingPolicy());
  redirect("/account/plan");
}
