import { prisma } from "@/lib/prisma";
import { ENTITLEMENT_SELECT, hasTier } from "@/lib/billing/entitlement";
import { billingPolicy } from "@/lib/settings/server";
import { limitValuesOf, resolveLimits, type ResolvedLimits } from "./limits";

/**
 * A requester's limits, read from the database (G-108 M1, D353): the site's rows, the rows for guests or for accounts,
 * the rows of the person's tier while their subscription gives it (`hasTier`, D367), and the person's own, resolved as feature states are.
 *
 * Unlike `featureStatesFor`, a database fault is not papered over: this throws, and the caller refuses the request
 * (Owner, 2026-10-06, under G-109: a limit that cannot be read refuses).
 */
export async function limitsFor(userId: string | null): Promise<ResolvedLimits> {
  const [site, audience, person, policy] = await Promise.all([
    prisma.siteLimit.findMany(),
    prisma.audienceLimit.findMany({ where: { audience: userId ? "accounts" : "guests" } }),
    userId
      ? prisma.user.findUnique({
          where: { id: userId },
          select: { limits: true, subscription: { select: { ...ENTITLEMENT_SELECT, tier: { select: { limits: true } } } } },
        })
      : null,
    billingPolicy(),
  ]);
  const live = hasTier(person?.subscription, policy);
  return resolveLimits({
    site: limitValuesOf(site),
    audience: limitValuesOf(audience),
    tier: live ? limitValuesOf(person!.subscription!.tier.limits) : undefined,
    person: person ? limitValuesOf(person.limits) : undefined,
  });
}
