/**
 * Whether the app takes payments, and through which adapter, read from the environment and decided in one place
 * (G-106 M1), as `lib/mail/settings.ts` decides for email.
 *
 * Billing is on only when an adapter is named and has what it needs. Two guards are kept here, not left to whoever
 * writes the `.env`:
 * - a live Stripe key is refused unless STRIPE_LIVE is "on": live mode is the Owner's step (G-128), and a key pasted
 *   early must not start charging;
 * - the fake adapter, which grants subscriptions without payment, runs only where the site's address is this machine.
 */

export type BillingSettings =
  | { on: true; gateway: "stripe"; secretKey: string; webhookSecret: string; siteUrl: string }
  | { on: true; gateway: "fake"; webhookSecret: string; siteUrl: string }
  | { on: false; reason: string };

/** The signing secret the fake uses when none is set: it guards nothing, as the fake runs only on this machine. */
export const FAKE_WEBHOOK_SECRET = "whsec_fake_local_only";

const LOCAL_SITE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** `||` not `??` throughout: a copied `.env.example` leaves these as empty strings. */
export function billingSettings(env: Record<string, string | undefined>): BillingSettings {
  const gateway = env.BILLING_GATEWAY || "";
  if (!gateway) return { on: false, reason: "BILLING_GATEWAY is not set" };
  const siteUrl = (env.AUTH_URL || env.APP_URL || "").replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+$/.test(siteUrl)) return { on: false, reason: "AUTH_URL or APP_URL must be the site's address" };

  if (gateway === "fake") {
    if (!LOCAL_SITE.test(siteUrl)) return { on: false, reason: "the fake billing adapter runs only on a local address" };
    return { on: true, gateway, webhookSecret: env.STRIPE_WEBHOOK_SECRET || FAKE_WEBHOOK_SECRET, siteUrl };
  }
  if (gateway !== "stripe") return { on: false, reason: `BILLING_GATEWAY "${gateway}" is not an adapter` };

  const secretKey = env.STRIPE_SECRET_KEY || "";
  if (!/^(sk|rk)_(test|live)_/.test(secretKey)) return { on: false, reason: "STRIPE_SECRET_KEY is not set, or is not a secret key" };
  if (/^(sk|rk)_live_/.test(secretKey) && env.STRIPE_LIVE !== "on")
    return { on: false, reason: "STRIPE_SECRET_KEY is a live key and STRIPE_LIVE is not on" };
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || "";
  if (!webhookSecret.startsWith("whsec_")) return { on: false, reason: "STRIPE_WEBHOOK_SECRET is not set" };
  return { on: true, gateway, secretKey, webhookSecret, siteUrl };
}
