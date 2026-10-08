import type { FeatureSwitch } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ENTITLEMENT_SELECT, hasTier } from "@/lib/billing/entitlement";
import { billingPolicy } from "@/lib/settings/server";
import { EVERYTHING_ON, type FeatureState, type FeatureStates } from "./features";
import { resolveFeatures } from "./resolve";

/**
 * The feature states of a requester, read from the database (G-102 M2, D307): the site's rows, the set for guests or for
 * accounts, the set of the person's tier and the person's own rows, resolved person > tier > guests or accounts > site.
 *
 * Read on every page load and every generate or export request. If the database cannot be read, everything is on: a
 * database fault must not take the editor down for people whose features are all on anyway, and the admin pages will
 * show the fault on their own.
 */

const STATE_OF: Record<FeatureSwitch, FeatureState> = { ON: "on", LOCKED: "locked", HIDDEN: "hidden" };

const toStates = (rows: ReadonlyArray<{ featureId: string; state: FeatureSwitch }>): FeatureStates =>
  Object.fromEntries(rows.map((row) => [row.featureId, STATE_OF[row.state]]));

export async function featureStatesFor(userId: string | null): Promise<FeatureStates> {
  try {
    const [site, audience, person, policy] = await Promise.all([
      prisma.featureState.findMany(),
      // The set for guests, or for accounts (D307).
      prisma.audienceSet.findUnique({
        where: { audience: userId ? "accounts" : "guests" },
        select: { set: { select: { entries: true } } },
      }),
      userId
        ? prisma.user.findUnique({
            where: { id: userId },
            select: {
              features: true,
              subscription: { select: { ...ENTITLEMENT_SELECT, tier: { select: { featureSet: { select: { entries: true } } } } } },
            },
          })
        : null,
      billingPolicy(),
    ]);
    // A tier's set counts while the subscription gives the tier (`hasTier`, D367, the rule the Plan section shows by).
    const live = hasTier(person?.subscription, policy);
    return resolveFeatures(
      {
        site: toStates(site),
        audience: audience ? toStates(audience.set.entries) : undefined,
        tier: live ? toStates(person!.subscription!.tier.featureSet?.entries ?? []) : undefined,
        person: person ? toStates(person.features) : undefined,
      }
      // A row for a feature that no longer exists is harmless here: nothing asks for its id.
    );
  } catch (error) {
    console.error("feature states could not be read; everything on:", error);
    return EVERYTHING_ON;
  }
}
