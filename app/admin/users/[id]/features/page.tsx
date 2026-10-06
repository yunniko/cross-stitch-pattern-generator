import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { FeatureState } from "@/lib/features/features";
import { UserFeatures } from "./user-features";

/**
 * `/admin/users/<id>/features` (G-102 M3): one person's own feature states, beside what the site and their tier say.
 */
export const dynamic = "force-dynamic";

const STATE: Record<"ON" | "LOCKED" | "HIDDEN", FeatureState> = { ON: "on", LOCKED: "locked", HIDDEN: "hidden" };

export default async function AdminUserFeaturesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, siteRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        features: true,
        subscription: { select: { status: true, tier: { select: { name: true, featureSet: { select: { name: true, entries: true } } } } } },
      },
    }),
    prisma.featureState.findMany(),
  ]);
  if (!user) notFound();
  const tier = user.subscription?.tier ?? null;
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
    </div>
  );
}
