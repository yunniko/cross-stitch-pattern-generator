"use server";

import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fakeBillingGateway, currentBillingSettings } from "@/lib/billing/gateway";
import { deliverFakeEvents } from "@/lib/billing/fake-delivery";

/**
 * What the person does on the fake provider's pages (G-106 M3, D373): pay a Checkout, cancel in the Portal, and — the
 * one thing no real page offers — end the period now, so a test need not wait a month. Each answers only while the fake
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
