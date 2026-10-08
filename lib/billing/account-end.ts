import { BillingUnavailableError, type BillingGateway } from "./contract";
import { isFinal } from "./sync";

/**
 * Before an account is deleted, its subscriptions at the provider are ended (G-106 M2, Acceptance 7): the stored one,
 * and any other of the same customer not ended (a second one from two tabs). If any needs ending and the provider
 * cannot be reached, or billing is off, the account is not deleted: a person must never go on paying for an account
 * that no longer exists.
 */

export interface StoredForDeletion {
  status: string;
  endedAt: Date | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}

export const DELETION_REFUSED =
  "Your subscription could not be cancelled just now, so your account was not deleted. Please try again in a few minutes.";

export async function endSubscriptionsBeforeDeletion(
  gateway: BillingGateway | null,
  stored: StoredForDeletion | null
): Promise<{ ok: true; cancelled: string[] } | { ok: false; error: string }> {
  if (!stored || (!stored.stripeSubscriptionId && !stored.stripeCustomerId)) return { ok: true, cancelled: [] };
  const storedOpen = stored.stripeSubscriptionId && !isFinal(stored) ? stored.stripeSubscriptionId : null;
  if (!gateway) {
    // Off: nothing can be asked of the provider. A stored subscription still open is refused rather than left charging.
    return storedOpen ? { ok: false, error: DELETION_REFUSED } : { ok: true, cancelled: [] };
  }
  try {
    const open = new Set<string>(storedOpen ? [storedOpen] : []);
    if (stored.stripeCustomerId) {
      for (const subscription of await gateway.listSubscriptions(stored.stripeCustomerId)) {
        if (!isFinal(subscription)) open.add(subscription.id);
      }
    }
    for (const id of open) await gateway.cancelSubscription(id, { atPeriodEnd: false });
    return { ok: true, cancelled: [...open] };
  } catch (error) {
    if (error instanceof BillingUnavailableError) return { ok: false, error: DELETION_REFUSED };
    throw error;
  }
}
