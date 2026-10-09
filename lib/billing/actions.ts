"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { featureUsable } from "@/lib/features/features";
import { featureStatesFor } from "@/lib/features/server";
import { currentLegalVersions } from "@/lib/legal/server";
import { prisma } from "@/lib/prisma";
import { consentRefusal } from "./consent";
import { BillingUnavailableError } from "./contract";
import { billingGateway, currentBillingSettings } from "./gateway";
import { BUYING_FEATURE, CHECKOUT_REFUSED, checkoutRefusal } from "./purchase";

/**
 * The Plan section's two actions (G-106 M3): start Checkout for a price, open the Portal. Each sends the person to the
 * provider's own page, so no card data reaches this server (Acceptance 8). Who is buying is the session's, never a
 * field's; the price is our row's id, looked up and checked here.
 */

export interface BillingActionState {
  error?: string;
}

const PLAN_PATH = "/account/plan";

export async function startCheckoutAction(_prev: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/login");
  const userId = session.user.id;
  const field = (name: string) => (typeof formData.get(name) === "string" ? (formData.get(name) as string) : "");
  const priceId = field("priceId");

  const [gateway, states, price, stored, documents] = await Promise.all([
    billingGateway(),
    featureStatesFor(userId),
    priceId ? prisma.price.findUnique({ where: { id: priceId }, select: { stripePriceId: true, current: true } }) : null,
    prisma.subscription.findUnique({
      where: { userId },
      select: { kind: true, status: true, currentPeriodEnd: true, endedAt: true, stripeCustomerId: true },
    }),
    currentLegalVersions(),
  ]);
  const settings = currentBillingSettings();
  const refusal = checkoutRefusal({
    billingOn: gateway !== null && settings.on,
    buyingUsable: featureUsable(states, BUYING_FEATURE),
    price,
    stored,
    now: new Date(),
  });
  if (refusal || !gateway || !settings.on || !price) return { error: refusal ?? CHECKOUT_REFUSED.off };

  // The consent is checked against the versions in force and recorded before the provider is asked (D384).
  const posted = {
    agreedTerms: field("agreeTerms") === "on",
    agreedWithdrawal: field("agreeWithdrawal") === "on",
    termsVersionId: field("termsVersionId"),
    withdrawalVersionId: field("withdrawalVersionId"),
  };
  const current = { terms: documents.terms ?? null, privacy: documents.privacy ?? null, withdrawal: documents.withdrawal ?? null };
  const unconsented = consentRefusal(current, posted);
  if (unconsented) return { error: unconsented };
  const consent = await prisma.purchaseConsent.create({
    data: { userId, priceId, termsVersionId: posted.termsVersionId, withdrawalVersionId: posted.withdrawalVersionId },
    select: { id: true },
  });

  let url: string;
  try {
    ({ url } = await gateway.startCheckout({
      priceId: price.stripePriceId,
      userId,
      email: session.user.email,
      customerId: stored?.stripeCustomerId ?? null,
      consentId: consent.id,
      successUrl: `${settings.siteUrl}${PLAN_PATH}?checkout=done`,
      cancelUrl: `${settings.siteUrl}${PLAN_PATH}?checkout=cancelled`,
    }));
  } catch (error) {
    if (error instanceof BillingUnavailableError) return { error: CHECKOUT_REFUSED.unavailable };
    throw error;
  }
  redirect(url);
}

/**
 * The Portal, for anyone with a customer at the provider: not under the buying feature, since a person who bought must
 * always be able to change their card or cancel, whatever is on sale.
 */
export async function openPortalAction(): Promise<BillingActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [gateway, stored] = await Promise.all([
    billingGateway(),
    prisma.subscription.findUnique({ where: { userId: session.user.id }, select: { stripeCustomerId: true } }),
  ]);
  const settings = currentBillingSettings();
  if (!gateway || !settings.on) return { error: "Billing cannot be managed just now. Please try again later." };
  if (!stored?.stripeCustomerId) return { error: "There is no billing to manage on this account." };

  let url: string;
  try {
    ({ url } = await gateway.openPortal({ customerId: stored.stripeCustomerId, returnUrl: `${settings.siteUrl}${PLAN_PATH}` }));
  } catch (error) {
    if (error instanceof BillingUnavailableError)
      return { error: "The billing page could not be opened just now. Please try again in a few minutes." };
    throw error;
  }
  redirect(url);
}
