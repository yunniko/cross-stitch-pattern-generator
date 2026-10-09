import { versionLine } from "@/lib/legal/documents";
import type { BillingInterval } from "./contract";
import { formatPrice, type NoticeSlot, type PlannedNotice } from "./notices";

/**
 * A buyer's consent before Checkout (G-128 M2, D384): the terms in force agreed to, and the acknowledgment that the plan
 * starts at once and the right of withdrawal is lost. `consentRefusal` decides whether Checkout may start; the record is
 * written before the provider is asked, and `planConfirmation` queues the mail that repeats it once the plan has
 * started. Pure, so the server action, the sync and the tests ask the same questions.
 */

export const CONSENT_REFUSED = {
  unpublished: "Plans cannot be bought until the site's terms are published.",
  unticked: "Agree to the terms and to the plan starting at once before choosing a plan.",
  changed: "The terms changed while this page was open. Read the current version, then agree again.",
} as const;

/** The versions in force of what a buyer must have been shown: each null while none is published. */
export interface DocumentsInForce {
  terms: { id: string } | null;
  privacy: { id: string } | null;
  withdrawal: { id: string } | null;
}

/** What the Plan page posted with the choice of a price. */
export interface PostedConsent {
  agreedTerms: boolean;
  agreedWithdrawal: boolean;
  /** The versions the page showed, so a buyer never agrees to text they were not shown. */
  termsVersionId: string;
  withdrawalVersionId: string;
}

/** Why Checkout may not start for want of consent, or null when it may. */
export function consentRefusal(current: DocumentsInForce, posted: PostedConsent): string | null {
  if (!current.terms || !current.privacy || !current.withdrawal) return CONSENT_REFUSED.unpublished;
  if (!posted.agreedTerms || !posted.agreedWithdrawal) return CONSENT_REFUSED.unticked;
  if (posted.termsVersionId !== current.terms.id || posted.withdrawalVersionId !== current.withdrawal.id) return CONSENT_REFUSED.changed;
  return null;
}

/** A consent as the sync reads it, with what the confirmation names. */
export interface ConsentRecord {
  id: string;
  createdAt: Date;
  /** The subscription row it is tied to; null until the first sync of the subscription its Checkout made. */
  subscriptionId: string | null;
  tierName: string;
  /** The price chosen; null if it has since been deleted. */
  price: { amount: number; currency: string; interval: BillingInterval } | null;
  termsVersion: number;
  termsPublishedAt: Date;
  acknowledgment: string;
}

const STARTED: ReadonlySet<string> = new Set(["trialing", "active"]);

/**
 * The confirmation a purchase is due, or null: once, when the subscription its Checkout made has started, keyed by the
 * consent's time, so a repeated or late sync cannot send it twice. A consent tied to another row is not this one's.
 */
export function planConfirmation(facts: {
  consent: ConsentRecord;
  rowId: string;
  status: string;
  queued: readonly { failedAt: Date; slot: NoticeSlot }[];
}): PlannedNotice | null {
  const { consent, rowId, status, queued } = facts;
  if (consent.subscriptionId !== null && consent.subscriptionId !== rowId) return null;
  if (!STARTED.has(status)) return null;
  if (queued.some((row) => row.slot === "confirmed" && row.failedAt.getTime() === consent.createdAt.getTime())) return null;
  return {
    slot: "confirmed",
    message: "purchase-confirmed",
    failedAt: consent.createdAt,
    values: {
      plan: consent.price ? `${consent.tierName}, ${formatPrice(consent.price)}` : consent.tierName,
      termsVersion: consent.termsVersion,
      termsLine: versionLine(consent.termsVersion, consent.termsPublishedAt).replace(/^Version/, "version"),
      acknowledgment: consent.acknowledgment,
    },
  };
}

/** How long a consent whose Checkout was never completed is kept: long enough for a late webhook, then pruned. */
export const UNLINKED_CONSENT_MS = 2 * 24 * 3_600_000;
