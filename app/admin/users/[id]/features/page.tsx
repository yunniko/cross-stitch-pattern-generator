import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { FeatureState } from "@/lib/features/features";
import { subscriptionLive } from "@/lib/account/plan";
import { layerOver, limitDefaults, limitValuesOf } from "@/lib/limits/limits";
import { LimitsEditor } from "@/app/admin/features/limits-editor";
import { UserFeatures } from "./user-features";

/**
 * `/admin/users/<id>/features` (G-102 M3): one person's own feature states, beside what the site and their tier say; and
 * their own limits, beside what they get without them (G-108 M1).
 */
export const dynamic = "force-dynamic";

const STATE: Record<"ON" | "LOCKED" | "HIDDEN", FeatureState> = { ON: "on", LOCKED: "locked", HIDDEN: "hidden" };

export default async function AdminUserFeaturesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, siteRows, siteLimits, accountLimits] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        features: true,
        limits: true,
        subscription: {
          select: { status: true, tier: { select: { name: true, limits: true, featureSet: { select: { name: true, entries: true } } } } },
        },
      },
    }),
    prisma.featureState.findMany(),
    prisma.siteLimit.findMany(),
    prisma.audienceLimit.findMany({ where: { audience: "accounts" } }),
  ]);
  if (!user) notFound();
  const tier = user.subscription?.tier ?? null;
  const accounts = layerOver(layerOver(limitDefaults(), limitValuesOf(siteLimits)), limitValuesOf(accountLimits));
  const withoutOwn = tier && subscriptionLive(user.subscription!.status) ? layerOver(accounts, limitValuesOf(tier.limits)) : accounts;
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[13px]">
        <Link href="/admin/users" className="text-muted hover:text-ink hover:underline">
          ← Users
        </Link>
      </p>
      <h1 className="m-0 text-lg font-semibold text-ink">
        Features of {user.name?.trim() || user.email}
        {user.name?.trim() && <span className="ml-2 text-sm font-normal text-muted">{user.email}</span>}
      </h1>
      <p className="m-0 text-[13px] text-muted" data-testid="user-tier">
        {tier
          ? `On the tier "${tier.name}" (${user.subscription!.status})${tier.featureSet ? `, which gives the set "${tier.featureSet.name}"` : ", which gives no set"}.`
          : "On no tier."}{" "}
        A state set here wins over the tier and the site; &ldquo;As the site&rdquo; is no state of their own.
      </p>
      <UserFeatures
        userId={user.id}
        states={Object.fromEntries(user.features.map((row) => [row.featureId, STATE[row.state]]))}
        site={Object.fromEntries(siteRows.map((row) => [row.featureId, STATE[row.state]]))}
      />
      <h2 className="m-0 mt-4 text-base font-semibold text-ink">Limits</h2>
      <LimitsEditor
        testId="user-limits"
        rows={[
          {
            key: "user",
            label: user.name?.trim() || user.email,
            note: "Their own value wins over their tier, accounts and the site.",
            layer: { kind: "user", userId: user.id },
            own: limitValuesOf(user.limits),
            follows: withoutOwn,
          },
        ]}
      />
    </div>
  );
}
