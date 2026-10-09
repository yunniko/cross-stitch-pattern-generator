/**
 * The documents the site publishes (G-128 M1, D383): the terms, the privacy policy, and the acknowledgment of losing the
 * right of withdrawal that a buyer agrees to before Checkout (M2). Their text is the Owner's, written by an admin in the
 * app; each publish is a new version, and a published one is never changed. Pure, so the rules are tested without a
 * database.
 */

export const LEGAL_KINDS = ["terms", "privacy", "withdrawal"] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

export function isLegalKind(value: unknown): value is LegalKind {
  return typeof value === "string" && (LEGAL_KINDS as readonly string[]).includes(value);
}

export interface LegalKindInfo {
  label: string;
  /** Its public page; the withdrawal wording has none, it is shown where a buyer agrees to it. */
  path: string | null;
  note: string;
}

export const LEGAL_INFO: Record<LegalKind, LegalKindInfo> = {
  terms: {
    label: "Terms of service",
    path: "/terms",
    note: "Shown at /terms. A buyer agrees to the version in force before Checkout.",
  },
  privacy: {
    label: "Privacy policy",
    path: "/privacy",
    note: "Shown at /privacy and linked where an account is made. It names who processes payments.",
  },
  withdrawal: {
    label: "Withdrawal acknowledgment",
    path: null,
    note: "The words a buyer agrees to before Checkout: that the plan starts at once and they lose the 14-day right of withdrawal. One or two sentences.",
  },
};

/** The longest document accepted: a guard against a pasted file, not a limit on the Owner's text. */
export const MAX_LEGAL_LENGTH = 100_000;

export interface PublishFacts {
  body: string;
  /** The version the admin's text was written over: 0 when there was none. */
  basedOn: number;
  /** The kind's latest version and its text, or null when none is published. */
  latest: { version: number; body: string } | null;
}

export const PUBLISH_REFUSED = {
  empty: "Write the text before publishing.",
  long: `A document is at most ${MAX_LEGAL_LENGTH.toLocaleString("en-GB")} characters.`,
  stale: "A newer version was published while this one was written. Reload the page and start from it.",
  same: "The text is the same as the version in force: there is nothing new to publish.",
} as const;

/** Why a version may not be published, or null with the number it takes. Line endings are kept as LF. */
export function publishCheck(facts: PublishFacts): { error: string } | { version: number; body: string } {
  const body = facts.body.replace(/\r\n?/g, "\n").trim();
  if (body === "") return { error: PUBLISH_REFUSED.empty };
  if (body.length > MAX_LEGAL_LENGTH) return { error: PUBLISH_REFUSED.long };
  const latest = facts.latest?.version ?? 0;
  if (facts.basedOn !== latest) return { error: PUBLISH_REFUSED.stale };
  if (facts.latest && facts.latest.body === body) return { error: PUBLISH_REFUSED.same };
  return { version: latest + 1, body };
}

/** "Version 3, in force since 9 October 2026", read as a calendar date in UTC. */
export function versionLine(version: number, publishedAt: Date): string {
  const day = publishedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return `Version ${version}, in force since ${day}`;
}

/** The version a `?version=` asks for, or null for the one in force. */
export function parseVersion(value: string | undefined): number | null {
  return value !== undefined && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null;
}
