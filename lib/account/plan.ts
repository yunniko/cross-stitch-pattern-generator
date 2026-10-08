import { hasTier, type EntitlementInput } from "@/lib/billing/entitlement";

/**
 * A person's plan (G-107 M2): Free, or the tier their subscription gives now. Whether it gives one is the entitlement
 * rule's to say (G-106, D367); the feature states and the limits ask the same rule.
 */

export const FREE_PLAN = "Free";

/** The plan's name: the tier's while the subscription gives it, Free otherwise. */
export function planName(subscription: (EntitlementInput & { tier: { name: string } }) | null | undefined, now = new Date()): string {
  return subscription && hasTier(subscription, now) ? subscription.tier.name : FREE_PLAN;
}
