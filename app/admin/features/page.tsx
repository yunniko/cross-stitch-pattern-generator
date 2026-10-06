import { prisma } from "@/lib/prisma";
import type { FeatureState } from "@/lib/features/features";
import { FeaturesAdmin } from "./features-admin";

/**
 * `/admin/features` (G-102 M3): every feature in its group with the state it has for the site, the feature sets a tier
 * can point at, the tiers, and the latest changes. The list itself is the client's (`app/features/registry.ts`, which
 * the tools' modules are part of); this page reads the rows and hands them over.
 */
export const dynamic = "force-dynamic";

const STATE: Record<"ON" | "LOCKED" | "HIDDEN", FeatureState> = { ON: "on", LOCKED: "locked", HIDDEN: "hidden" };

export default async function AdminFeaturesPage() {
  const [siteRows, sets, tiers, changes] = await Promise.all([
    prisma.featureState.findMany(),
    prisma.featureSet.findMany({ orderBy: { name: "asc" }, include: { entries: true, tiers: { select: { id: true, name: true } } } }),
    prisma.tier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, featureSetId: true, _count: { select: { subscriptions: true } } },
    }),
    prisma.featureChange.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return (
    <FeaturesAdmin
      site={Object.fromEntries(siteRows.map((row) => [row.featureId, STATE[row.state]]))}
      sets={sets.map((set) => ({
        id: set.id,
        name: set.name,
        entries: Object.fromEntries(set.entries.map((entry) => [entry.featureId, STATE[entry.state]])),
        tiers: set.tiers.map((tier) => tier.name),
      }))}
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
