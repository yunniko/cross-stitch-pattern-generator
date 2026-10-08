/**
 * The admin Change log's groups (G-107 M3, D348). Every admin change is one `FeatureChange` row with a stored scope; the
 * log groups those scopes the way an admin looks for them. Pure, so the grouping is tested without a database.
 */

/** A role or a login changed by an admin. */
export const ACCOUNT_SCOPE = "ACCOUNT";
/** A site setting changed by an admin (G-126 M2, D374). */
export const SETTING_SCOPE = "SETTING";

export const CHANGE_GROUPS = [
  { id: "users", label: "Users", scopes: [ACCOUNT_SCOPE, "USER"] },
  { id: "features", label: "Features", scopes: ["SITE", "SET", "AUDIENCE"] },
  { id: "tiers", label: "Tiers", scopes: ["TIER"] },
  { id: "settings", label: "Settings", scopes: [SETTING_SCOPE] },
] as const;

export type ChangeGroupId = (typeof CHANGE_GROUPS)[number]["id"];

/** The group a `?scope=` asks for; null (all) for anything else. */
export function parseChangeGroup(value: string | undefined): ChangeGroupId | null {
  return CHANGE_GROUPS.find((group) => group.id === value)?.id ?? null;
}

/** The stored scopes a group shows; null for all of them. */
export function scopesOf(group: ChangeGroupId | null): string[] | null {
  return group === null ? null : [...CHANGE_GROUPS.find((entry) => entry.id === group)!.scopes];
}

/** The group a stored scope is shown under; a scope from no group is shown as itself. */
export function groupLabelOf(scope: string): string {
  return CHANGE_GROUPS.find((group) => (group.scopes as readonly string[]).includes(scope))?.label ?? scope;
}

/** The scopes of the switches, which the Features page's own Changes tab shows: every one but a role, a login or a setting. */
export const FEATURE_SCOPES: readonly string[] = CHANGE_GROUPS.flatMap((group) => group.scopes).filter(
  (scope) => scope !== ACCOUNT_SCOPE && scope !== SETTING_SCOPE
);

/** "2026-10-07 16:58", in UTC, as the log lists a change. */
export function changeTime(at: Date): string {
  return at.toISOString().replace("T", " ").slice(0, 16);
}
