import { resolveLayers, type Layers } from "@/lib/features/resolve";

/**
 * Limits (G-108 M1, D353; the list G-109 adds its counted limits to): how much of something the server lets a person
 * have. The admin sets a value for the site, for guests, for signed-in accounts, for each tier and for one person, and
 * the person's own wins over their tier's, over guests' or accounts', over the site's: the order feature states have.
 *
 * Every limit is one entry in `ACCOUNT_LIMITS`; the admin pages, the routes that obey a limit and the account page all read it,
 * so a new limit appears in the admin by being added here. Pure: the database half is `server.ts`.
 */

/** A limit's value: a whole number in the limit's unit, or no limit at all. */
export type LimitValue = number | "unlimited";

export interface Limit {
  /** Stable and dotted, as a feature id is: `storage.charts`. */
  id: string;
  label: string;
  /** What the admin is told about it, one sentence. */
  note: string;
  unit: "MB";
  /** The site's value while the admin has set none. */
  siteDefault: LimitValue;
  /** The largest number the admin may type: the column holds a 32-bit integer. */
  max: number;
}

export const ACCOUNT_LIMITS: readonly Limit[] = [
  {
    id: "storage.charts",
    label: "Space for saved charts",
    note: "The charts a person saves to their account, with their photos, may take up to this much in all.",
    unit: "MB",
    siteDefault: 50,
    max: 1_000_000,
  },
];

/** A megabyte as the editor counts one elsewhere (`EDITED_PHOTO_MAX_BYTES`): 1024 × 1024 bytes. */
export const BYTES_PER_MB = 1024 * 1024;

export function limitById(id: string): Limit | undefined {
  return ACCOUNT_LIMITS.find((limit) => limit.id === id);
}

export function isLimitId(id: unknown): id is string {
  return typeof id === "string" && limitById(id) !== undefined;
}

/** The value one layer has for each limit it sets, by limit id. A limit a layer has no value for is not in it. */
export type LimitValues = Readonly<Record<string, LimitValue>>;

/** A person's limits: every limit in the list, each with the value that won. */
export type ResolvedLimits = Readonly<Record<string, LimitValue>>;

/** A stored value: the column holds a number, and null for "unlimited" (no row means the layer sets nothing). */
export function fromColumn(value: number | null): LimitValue {
  return value === null ? "unlimited" : value;
}

export function toColumn(value: LimitValue): number | null {
  return value === "unlimited" ? null : value;
}

/** A layer's rows as the values it sets; a row for a limit no longer in the list is dropped. */
export function limitValuesOf(rows: ReadonlyArray<{ limitId: string; value: number | null }>): LimitValues {
  return Object.fromEntries(rows.filter((row) => isLimitId(row.limitId)).map((row) => [row.limitId, fromColumn(row.value)]));
}

/** Every limit in the list for a person, resolved person > tier > guests or accounts > site > the list's default. */
export function resolveLimits(layers: Partial<Layers<LimitValue>>): ResolvedLimits {
  return resolveLayers({ ...layers, site: { ...limitDefaults(), ...(layers.site ?? {}) } }, isLimitId);
}

/** The list's own defaults: what the site has while it sets nothing. */
export function limitDefaults(): ResolvedLimits {
  return Object.fromEntries(ACCOUNT_LIMITS.map((limit) => [limit.id, limit.siteDefault]));
}

/** What a layer ends up with: its own values over what the layer below it ends up with. For the admin's "what they get". */
export function layerOver(below: ResolvedLimits, own: LimitValues): ResolvedLimits {
  return { ...below, ...own };
}

/** The value a person has for one limit; the list's default if the map does not hold it. */
export function limitValue(limits: ResolvedLimits, id: string): LimitValue {
  const value = limits[id];
  if (value !== undefined) return value;
  const limit = limitById(id);
  if (!limit) throw new Error(`Unknown limit "${id}"`);
  return limit.siteDefault;
}

/** "50 MB", or "Unlimited". */
export function formatLimit(limit: Limit, value: LimitValue): string {
  return value === "unlimited" ? "Unlimited" : `${value.toLocaleString("en")} ${limit.unit}`;
}

/** A size limit in bytes; Infinity for unlimited. */
export function limitBytes(value: LimitValue): number {
  return value === "unlimited" ? Infinity : value * BYTES_PER_MB;
}

/**
 * What the admin typed for a limit: "unlimited" (any case) or a whole number from 0 to the limit's largest. Anything else
 * is refused with a sentence saying what is allowed.
 */
export function parseLimitInput(limit: Limit, input: unknown): { value: LimitValue } | { error: string } {
  if (input === "unlimited") return { value: "unlimited" };
  const text = typeof input === "number" ? String(input) : typeof input === "string" ? input.trim() : "";
  if (/^unlimited$/i.test(text)) return { value: "unlimited" };
  if (!/^\d{1,9}$/.test(text)) return { error: `${limit.label}: a whole number of ${limit.unit}, or "unlimited".` };
  const value = Number(text);
  if (value > limit.max) return { error: `${limit.label}: at most ${limit.max.toLocaleString("en")} ${limit.unit}.` };
  return { value };
}
