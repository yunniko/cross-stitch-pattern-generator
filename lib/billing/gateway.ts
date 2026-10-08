import type { BillingGateway, ProviderPrice } from "./contract";
import { FakeBilling } from "./fake";
import { billingSettings, type BillingSettings } from "./settings";

/**
 * The billing adapter the server uses (G-106 M1), chosen by `billingSettings` from the environment; null while billing
 * is off. The Stripe adapter is loaded only when chosen, so a server without keys never loads the `stripe` package.
 *
 * One adapter per server process, kept on `globalThis` rather than in this module: the fake holds its subscriptions in
 * memory, and the webhook route, the pages and the server actions must all see the same ones even where the bundler
 * gives them separate copies of this module (G-106 M3).
 */

export function currentBillingSettings(): BillingSettings {
  return billingSettings(process.env);
}

interface Cached {
  key: string;
  gateway: Promise<BillingGateway | null>;
}

const holder = globalThis as typeof globalThis & { __crossStitchBillingGateway?: Cached };

export function billingGateway(): Promise<BillingGateway | null> {
  const settings = currentBillingSettings();
  const key = JSON.stringify(settings);
  if (holder.__crossStitchBillingGateway?.key !== key) holder.__crossStitchBillingGateway = { key, gateway: build(settings) };
  return holder.__crossStitchBillingGateway.gateway;
}

/** The fake, when it is the adapter in use; null otherwise. Its own pages and actions answer only while it is. */
export async function fakeBillingGateway(): Promise<FakeBilling | null> {
  const gateway = await billingGateway();
  return gateway instanceof FakeBilling ? gateway : null;
}

/** A `Price` row as the fake's provider price: the fake sells what the admin has attached (`FakeBilling`). */
async function priceFromDatabase(id: string): Promise<ProviderPrice | null> {
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.price.findUnique({
    where: { stripePriceId: id },
    select: { current: true, amount: true, currency: true, interval: true, tier: { select: { name: true } } },
  });
  return row
    ? { id, active: row.current, amount: row.amount, currency: row.currency, interval: row.interval, productName: row.tier.name }
    : null;
}

async function build(settings: BillingSettings): Promise<BillingGateway | null> {
  if (!settings.on) return null;
  if (settings.gateway === "fake") return new FakeBilling(settings.webhookSecret, settings.siteUrl, undefined, priceFromDatabase);
  const { createStripeGateway } = await import("./stripe-adapter");
  return createStripeGateway(settings);
}
