import { prisma } from "@/lib/prisma";
import type { BillingPolicy } from "@/lib/billing/entitlement";
import { policyOf, resolveSiteSettings, type SiteSettings } from "./site-settings";

/**
 * The site's settings read from the database (G-126 M1, D374). Read on each request that needs one, uncached: the table
 * holds a row a setting, and a change in the admin then counts from the next request in every process.
 */
export async function siteSettings(): Promise<SiteSettings> {
  return resolveSiteSettings(await prisma.siteSetting.findMany({ select: { key: true, value: true } }));
}

/** What the entitlement rule needs from the settings. */
export async function billingPolicy(): Promise<BillingPolicy> {
  return policyOf(await siteSettings());
}
