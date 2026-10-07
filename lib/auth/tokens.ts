import { createHash, randomBytes } from "node:crypto";

/**
 * The links that confirm an address and set a new password carry a token (G-113, D343). One rule for both:
 *
 * - the link carries 32 random bytes; the database keeps only their SHA-256, so a copy of the table opens nothing;
 * - a token belongs to one purpose and one account, written into its identifier, so a confirmation link cannot set a password;
 * - it expires, and it works once: using it deletes it, and issuing a new one deletes the account's earlier ones of that purpose.
 *
 * SHA-256 and not bcrypt: the token is 256 random bits, not a password a person chose, so there is nothing to slow a guess
 * down against, and the lookup must be by the hash itself.
 */

export const TOKEN_PURPOSES = {
  confirm: { lifetimeMs: 48 * 60 * 60_000 },
  reset: { lifetimeMs: 60 * 60_000 },
} as const;

export type TokenPurpose = keyof typeof TOKEN_PURPOSES;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function tokenIdentifier(purpose: TokenPurpose, userId: string): string {
  return `${purpose}:${userId}`;
}

export interface NewToken {
  /** Goes into the link, and nowhere else. */
  raw: string;
  /** What is stored. */
  hash: string;
  identifier: string;
  expires: Date;
}

export function newToken(purpose: TokenPurpose, userId: string, now: Date, random: (size: number) => Buffer = randomBytes): NewToken {
  const raw = random(32).toString("base64url");
  return {
    raw,
    hash: hashToken(raw),
    identifier: tokenIdentifier(purpose, userId),
    expires: new Date(now.getTime() + TOKEN_PURPOSES[purpose].lifetimeMs),
  };
}

/** A token as it reads in a link: base64url of 32 bytes. Anything else is refused before the database is asked. */
export function wellFormedToken(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{43}$/.test(raw);
}

export type TokenVerdict = { ok: true; userId: string } | { ok: false; reason: "unknown" | "expired" };

/**
 * What a stored token found by its hash allows. `record` is null when no token has that hash: never issued, already used,
 * or replaced by a newer one, which the reader cannot tell apart and need not.
 */
export function judgeToken(record: { identifier: string; expires: Date } | null, purpose: TokenPurpose, now: Date): TokenVerdict {
  if (!record) return { ok: false, reason: "unknown" };
  const prefix = `${purpose}:`;
  if (!record.identifier.startsWith(prefix) || record.identifier.length === prefix.length) return { ok: false, reason: "unknown" };
  if (record.expires.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, userId: record.identifier.slice(prefix.length) };
}
