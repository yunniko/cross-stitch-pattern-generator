import { versionLine, type LegalKind } from "@/lib/legal/documents";
import type { BillingInterval } from "./contract";
import { formatPrice, type NoticeSlot, type NoticeValues, type PlannedNotice } from "./notices";

/**
 * A buyer's consent before paying (G-128 M2, D384; G-129 M4, D389): the terms in force agreed to, and the request that the
 * plan start at once, within the 14 days of withdrawal, beside the withdrawal information. `consentRefusal` decides whether
 * Checkout, or an upgrade charged now, may start; the record is written before the provider is asked, and
 * `planConfirmation` and `upgradeConfirmation` queue the mail that repeats it, with the full texts, once the plan has
 * started or changed. Pure, so the server actions, the sync and the tests ask the same questions.
 */

export const CONSENT_REFUSED = {
  unpublished: "Plans cannot be bought until the site's terms are published.",
  unticked: "Agree to the terms and ask for the plan to start at once before choosing a plan.",
  changed: "The terms changed while this page was open. Read the current version, then agree again.",
} as const;

/** The versions in force of what a buyer must have been shown: each null while none is published. */
export interface DocumentsInForce {
  terms: { id: string } | null;
  privacy: { id: string } | null;
  withdrawal: { id: string } | null;
  earlyStart: { id: string } | null;
}

/** What the Plan page posted with the choice of a price. */
export interface PostedConsent {
  agreedTerms: boolean;
  /** The early-start request's box. */
  requestedEarlyStart: boolean;
  /** The versions the page showed, so a buyer never agrees to text they were not shown. */
  termsVersionId: string;
  withdrawalVersionId: string;
  earlyStartVersionId: string;
}

/** The posted consent, read from a form's fields as `ConsentFields` writes them. */
export function postedConsent(field: (name: string) => string): PostedConsent {
  return {
    agreedTerms: field("agreeTerms") === "on",
    requestedEarlyStart: field("requestEarlyStart") === "on",
    termsVersionId: field("termsVersionId"),
    withdrawalVersionId: field("withdrawalVersionId"),
    earlyStartVersionId: field("earlyStartVersionId"),
  };
}

/** The documents in force as the consent asks for them, from `currentLegalVersions()`. */
export function documentsInForce(documents: Partial<Record<LegalKind, { id: string }>>): DocumentsInForce {
  return {
    terms: documents.terms ?? null,
    privacy: documents.privacy ?? null,
    withdrawal: documents.withdrawal ?? null,
    earlyStart: documents["early-start"] ?? null,
  };
}

/** Why Checkout may not start for want of consent, or null when it may. */
export function consentRefusal(current: DocumentsInForce, posted: PostedConsent): string | null {
  if (!current.terms || !current.privacy || !current.withdrawal || !current.earlyStart) return CONSENT_REFUSED.unpublished;
  if (!posted.agreedTerms || !posted.requestedEarlyStart) return CONSENT_REFUSED.unticked;
  if (
    posted.termsVersionId !== current.terms.id ||
    posted.withdrawalVersionId !== current.withdrawal.id ||
    posted.earlyStartVersionId !== current.earlyStart.id
  )
    return CONSENT_REFUSED.changed;
  return null;
}

/** A published version as a consent names it: its number, when it came into force, and its text. */
export interface AgreedVersion {
  version: number;
  publishedAt: Date;
  body: string;
}

/** A consent as the sync reads it, with what the confirmation names and repeats. */
export interface ConsentRecord {
  id: string;
  createdAt: Date;
  /** The subscription row it is tied to; null until the first sync of the subscription its Checkout made. */
  subscriptionId: string | null;
  tierName: string;
  /** The price chosen; null if it has since been deleted. */
  price: { amount: number; currency: string; interval: BillingInterval } | null;
  terms: AgreedVersion;
  withdrawal: AgreedVersion;
  /** The early-start request's text. */
  request: string;
}

const STARTED: ReadonlySet<string> = new Set(["trialing", "active"]);

/** "version 3, in force since 1 October 2026", as the mails write it inside a sentence. */
const inlineVersion = (version: AgreedVersion) => versionLine(version.version, version.publishedAt).replace(/^Version/, "version");

/** What a confirmation repeats: the plan, the request word for word, and both documents in full with their versions. */
function agreementValues(consent: ConsentRecord): NoticeValues {
  return {
    plan: consent.price ? `${consent.tierName}, ${formatPrice(consent.price)}` : consent.tierName,
    termsVersion: consent.terms.version,
    termsLine: inlineVersion(consent.terms),
    terms: consent.terms.body,
    withdrawalVersion: consent.withdrawal.version,
    withdrawalLine: inlineVersion(consent.withdrawal),
    withdrawal: consent.withdrawal.body,
    request: consent.request,
  };
}

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
  return { slot: "confirmed", message: "purchase-confirmed", failedAt: consent.createdAt, values: agreementValues(consent) };
}

/**
 * The confirmation of an upgrade charged now, once the provider has applied it: keyed by its consent's time, as a
 * purchase's is, so the same consent is confirmed once.
 */
export function upgradeConfirmation(consent: ConsentRecord): PlannedNotice {
  return { slot: "confirmed", message: "upgrade-confirmed", failedAt: consent.createdAt, values: agreementValues(consent) };
}

/** How long a consent whose Checkout was never completed is kept: long enough for a late webhook, then pruned. */
export const UNLINKED_CONSENT_MS = 2 * 24 * 3_600_000;
