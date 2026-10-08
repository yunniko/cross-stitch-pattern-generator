import type { BillingPolicy } from "@/lib/billing/entitlement";

/**
 * The site's settings (G-126 M1, D374): single whole numbers the admin sets for the whole site, each one entry of
 * `SITE_SETTINGS`. A setting with no row in `SiteSetting` takes its default here. Pure: the database half is `server.ts`.
 *
 * Unlike a limit (`lib/limits/`), a setting has no layers: it is the site's, not a guest's, a tier's or a person's.
 */

export interface SiteSettingDefinition {
  id: string;
  label: string;
  /** What the admin is told about it, one sentence. */
  note: string;
  unit: "days";
  default: number;
  min: number;
  max: number;
}

export const SITE_SETTINGS = [
  {
    id: "billing.graceDays",
    label: "Grace after a failed renewal",
    note: "How long a person keeps their paid plan after a renewal payment first fails, while the payment is retried. Counted from the first failed attempt; a later payment ends it at once.",
    unit: "days",
    // The Owner's to settle (G-126 (a)); 14 is about the span of the provider's default retries.
    default: 14,
    min: 0,
    max: 60,
  },
] as const satisfies readonly SiteSettingDefinition[];

export type SiteSettingId = (typeof SITE_SETTINGS)[number]["id"];
export type SiteSettings = Record<SiteSettingId, number>;

export function siteSettingDefinition(id: string): SiteSettingDefinition | undefined {
  return SITE_SETTINGS.find((setting) => setting.id === id);
}

/** The settings from the stored rows: a row that is missing, of no setting, or out of range gives way to the default. */
export function resolveSiteSettings(rows: ReadonlyArray<{ key: string; value: number }>): SiteSettings {
  const settings = Object.fromEntries(SITE_SETTINGS.map((setting) => [setting.id, setting.default])) as SiteSettings;
  for (const row of rows) {
    const definition = siteSettingDefinition(row.key);
    if (definition && Number.isInteger(row.value) && row.value >= definition.min && row.value <= definition.max)
      settings[definition.id as SiteSettingId] = row.value;
  }
  return settings;
}

/** An admin's entry, checked: the whole number to store, or what is wrong with it in words. */
export function parseSiteSetting(id: string, input: string): { value: number } | { error: string } {
  const definition = siteSettingDefinition(id);
  if (!definition) return { error: "There is no such setting." };
  const text = input.trim();
  if (!/^\d+$/.test(text)) return { error: `Enter a whole number of ${definition.unit}.` };
  const value = Number(text);
  if (value < definition.min || value > definition.max)
    return { error: `Enter between ${definition.min} and ${definition.max} ${definition.unit}.` };
  return { value };
}

/** What the entitlement rule needs from the settings. */
export const policyOf = (settings: SiteSettings): BillingPolicy => ({ graceDays: settings["billing.graceDays"] });
