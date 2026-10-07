"use server";

import { prisma } from "@/lib/prisma";
import { authRateLimited } from "@/lib/server/request-guard";
import { emailError, normalizeEmail } from "@/lib/auth/validation";
import { requestAddress, sendConfirmationLink } from "@/lib/auth/links";
import { mailOn } from "@/lib/mail/send";

/**
 * The actions that send a link by mail (G-113). Each answers the same whether or not the address has an account, or one
 * in the state the link is for: what happened at an address is told only to that address's mailbox.
 */

export interface LinkFormState {
  error?: string;
  fieldErrors?: Partial<Record<"email", string>>;
  values?: { email?: string };
  /** The address the answer speaks of; whether a message really went there is not said. */
  sent?: string;
}

const NOT_AVAILABLE = "Email is not available on this site yet.";
const TOO_MANY = "Too many attempts. Try again in a few minutes.";

/** Shared first steps: sending on, the address's attempts, the email's shape. Returns the refusal, or the email. */
async function emailFrom(formData: FormData): Promise<{ refusal: LinkFormState } | { email: string }> {
  const email = normalizeEmail(formData.get("email"));
  if (!mailOn()) return { refusal: { error: NOT_AVAILABLE, values: { email } } };
  if (!authRateLimited(await requestAddress()).ok) return { refusal: { error: TOO_MANY, values: { email } } };
  const invalid = emailError(email);
  if (invalid) return { refusal: { fieldErrors: { email: invalid }, values: { email } } };
  return { email };
}

export async function resendConfirmationAction(_prev: LinkFormState, formData: FormData): Promise<LinkFormState> {
  const checked = await emailFrom(formData);
  if ("refusal" in checked) return checked.refusal;
  const account = await prisma.user.findUnique({ where: { email: checked.email }, select: { id: true, emailVerified: true } });
  if (account && account.emailVerified === null) await sendConfirmationLink(account.id, checked.email);
  return { sent: checked.email };
}
