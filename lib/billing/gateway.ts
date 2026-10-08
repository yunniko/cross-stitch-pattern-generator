import type { BillingGateway } from "./contract";
import { FakeBilling } from "./fake";
import { billingSettings, type BillingSettings } from "./settings";

/**
 * The billing adapter the server uses (G-106 M1), chosen by `billingSettings` from the environment; null while billing
 * is off. The Stripe adapter is loaded only when chosen, so a server without keys never loads the `stripe` package.
 */

export function currentBillingSettings(): BillingSettings {
  return billingSettings(process.env);
}

let cached: { key: string; gateway: Promise<BillingGateway | null> } | null = null;

export function billingGateway(): Promise<BillingGateway | null> {
  const settings = currentBillingSettings();
  const key = JSON.stringify(settings);
  if (cached?.key !== key) cached = { key, gateway: build(settings) };
  return cached.gateway;
}

async function build(settings: BillingSettings): Promise<BillingGateway | null> {
  if (!settings.on) return null;
  if (settings.gateway === "fake") return new FakeBilling(settings.webhookSecret, settings.siteUrl);
  const { createStripeGateway } = await import("./stripe-adapter");
  return createStripeGateway(settings);
}
