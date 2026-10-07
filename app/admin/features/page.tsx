import { prisma } from "@/lib/prisma";
import type { FeatureState } from "@/lib/features/features";
import { FEATURE_SCOPES } from "@/lib/admin/change-log";
import { latestChanges } from "@/lib/admin/change-log-data";
import { layerOver, limitDefaults, limitValuesOf } from "@/lib/limits/limits";
import { FeaturesAdmin } from "./features-admin";
import type { LimitLayerRow } from "./limits-editor";

/**
 * `/admin/features` (G-102 M3): every feature in its group with the state it has for the site, the feature sets a tier
 * can point at, the tiers, the limits each layer gives (G-108 M1), and the latest changes. The list itself is the client's (`app/features/registry.ts`, which
 * the tools' modules are part of); this page reads the rows and hands them over.
 */
export const dynamic = "force-dynamic";

const STATE: Record<"ON" | "LOCKED" | "HIDDEN", FeatureState> = { ON: "on", LOCKED: "locked", HIDDEN: "hidden" };

export default async function AdminFeaturesPage() {
  const [siteRows, sets, tiers, changes, audiences, siteLimits, audienceLimits] = await Promise.all([
    prisma.featureState.findMany(),
    prisma.featureSet.findMany({
      orderBy: { name: "asc" },
      include: { entries: true, tiers: { select: { id: true, name: true } }, audiences: { select: { audience: true } } },
    }),
    prisma.tier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, featureSetId: true, limits: true, _count: { select: { subscriptions: true } } },
    }),
    // The feature changes only; roles and logins are in the Change log (D348).
    latestChanges(FEATURE_SCOPES, 30),
    prisma.audienceSet.findMany(),
    prisma.siteLimit.findMany(),
    prisma.audienceLimit.findMany(),
  ]);
  const siteOwn = limitValuesOf(siteLimits);
  const site = layerOver(limitDefaults(), siteOwn);
  const audienceOwn = (audience: string) => limitValuesOf(audienceLimits.filter((row) => row.audience === audience));
  const accounts = layerOver(site, audienceOwn("accounts"));
  const limitRows: LimitLayerRow[] = [
    { key: "site", label: "The site", layer: { kind: "site" }, own: siteOwn, follows: limitDefaults() },
    {
      key: "guests",
      label: "Guests (not signed in)",
      note: "No effect while what a limit counts needs an account.",
      layer: { kind: "audience", audience: "guests" },
      own: audienceOwn("guests"),
      follows: site,
    },
    {
      key: "accounts",
      label: "Signed-in accounts",
      layer: { kind: "audience", audience: "accounts" },
      own: audienceOwn("accounts"),
      follows: site,
    },
    ...tiers.map((tier) => ({
      key: `tier:${tier.name}`,
      label: `Tier ${tier.name}`,
      note: "For a live subscription; over signed-in accounts.",
      layer: { kind: "tier" as const, tierId: tier.id },
      own: limitValuesOf(tier.limits),
      follows: accounts,
    })),
  ];
  return (
    <FeaturesAdmin
      site={Object.fromEntries(siteRows.map((row) => [row.featureId, STATE[row.state]]))}
      sets={sets.map((set) => ({
        id: set.id,
        name: set.name,
        entries: Object.fromEntries(set.entries.map((entry) => [entry.featureId, STATE[entry.state]])),
        tiers: set.tiers.map((tier) => tier.name),
        audiences: set.audiences.map((entry) => entry.audience),
      }))}
      limits={limitRows}
      audiences={Object.fromEntries(audiences.map((entry) => [entry.audience, entry.featureSetId]))}
      tiers={tiers.map((tier) => ({ id: tier.id, name: tier.name, featureSetId: tier.featureSetId, people: tier._count.subscriptions }))}
      changes={changes.map((change) => ({
        id: change.id,
        scope: change.scope,
        change: change.change,
        by: change.byEmail,
        at: change.createdAt.toISOString(),
      }))}
    />
  );
}
