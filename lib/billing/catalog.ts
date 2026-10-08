import type { BillingInterval } from "./contract";

/**
 * The admin's prices (G-127 M1, D380): reading an amount as typed, and which rows a new price retires. A price is never
 * edited: a new one for a tier and period becomes the current one, the one it replaces stops being offered, and the
 * subscriptions on the old one keep it (D368). Pure, so the rule is tested without a database or a provider.
 */

/** The currencies the admin can price in: two-decimal currencies Stripe charges in, the euro first. */
export const PRICE_CURRENCIES = ["eur", "czk", "usd", "gbp"] as const;
export type PriceCurrency = (typeof PRICE_CURRENCIES)[number];

export function isPriceCurrency(value: unknown): value is PriceCurrency {
  return typeof value === "string" && (PRICE_CURRENCIES as readonly string[]).includes(value);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "MONTH" || value === "YEAR";
}

/** The largest amount accepted, in major units: a guard against a slipped key, not a business limit. */
export const MAX_PRICE = 10_000;

/** "4.99" or "4,99" to 499; whole numbers and one or two decimals, more than zero and at most `MAX_PRICE`. */
export function parseAmount(text: string): { amount: number } | { error: string } {
  const trimmed = text.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(trimmed)) return { error: "Enter an amount such as 4.99." };
  const [whole, fraction = ""] = trimmed.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (amount <= 0) return { error: "A price is more than zero." };
  if (amount > MAX_PRICE * 100) return { error: `A price is at most ${MAX_PRICE.toLocaleString("en-GB")}.` };
  return { amount };
}

export interface CatalogPrice {
  id: string;
  tierId: string;
  interval: BillingInterval;
  current: boolean;
}

/** The rows a price made current for a tier and period takes the place of: every other current one of that pair. */
export function pricesRetiredBy(
  prices: readonly CatalogPrice[],
  made: { id?: string; tierId: string; interval: BillingInterval }
): string[] {
  return prices
    .filter((price) => price.current && price.tierId === made.tierId && price.interval === made.interval && price.id !== made.id)
    .map((price) => price.id);
}
