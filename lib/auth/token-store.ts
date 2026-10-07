import { prisma } from "@/lib/prisma";
import { hashToken, judgeToken, newToken, tokenIdentifier, wellFormedToken, type TokenPurpose, type TokenVerdict } from "./tokens";

/**
 * Where the tokens of `lib/auth/tokens.ts` are kept: the `VerificationToken` table Auth.js's schema already has (G-113,
 * D343). The rule is in that module; this one only reads and writes.
 */

/** A new token for this account and purpose; the account's earlier ones of the same purpose stop working. */
export async function issueToken(purpose: TokenPurpose, userId: string): Promise<string> {
  const token = newToken(purpose, userId, new Date());
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: tokenIdentifier(purpose, userId) } }),
    prisma.verificationToken.create({ data: { identifier: token.identifier, token: token.hash, expires: token.expires } }),
  ]);
  return token.raw;
}

/**
 * Uses a token: whatever it allows, it is gone afterwards. Deleting by its hash is what makes "once" hold when the same
 * link is opened twice at the same moment: only one of the two deletes finds the row.
 */
export async function useToken(purpose: TokenPurpose, raw: unknown): Promise<TokenVerdict> {
  if (!wellFormedToken(raw)) return { ok: false, reason: "unknown" };
  const hash = hashToken(raw);
  const record = await prisma.verificationToken.findUnique({ where: { token: hash } });
  const verdict = judgeToken(record, purpose, new Date());
  // A token of another purpose is left alone: a confirmation link opened on the reset page must still confirm.
  if (!record || (!verdict.ok && verdict.reason === "unknown")) return verdict;
  const { count } = await prisma.verificationToken.deleteMany({ where: { token: hash } });
  return count === 1 ? verdict : { ok: false, reason: "unknown" };
}

/** Whether a token would be accepted, without using it: the page that asks for a new password checks before it asks. */
export async function peekToken(purpose: TokenPurpose, raw: unknown): Promise<TokenVerdict> {
  if (!wellFormedToken(raw)) return { ok: false, reason: "unknown" };
  const record = await prisma.verificationToken.findUnique({ where: { token: hashToken(raw) } });
  return judgeToken(record, purpose, new Date());
}
