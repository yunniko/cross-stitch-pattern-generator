import { headers } from "next/headers";
import { issueToken } from "@/lib/auth/token-store";
import { TOKEN_PURPOSES } from "@/lib/auth/tokens";
import { sendMessage, siteLink } from "@/lib/mail/send";
import { clientIp, mailRateLimited } from "@/lib/server/request-guard";

/**
 * Sending the links (G-113). Kept out of the `"use server"` action files on purpose: anything exported from one of those
 * is an action a browser can call, and these take an account id the caller has already settled.
 *
 * Each spends a token of the `mail` bucket for the address it writes to; past the limit nothing is sent, and the caller
 * answers exactly as if it had been, so the answer never says what happened at that address.
 */

export async function requestAddress(): Promise<string> {
  return clientIp(new Headers(await headers()));
}

const hours = (ms: number) => String(Math.round(ms / 3_600_000));
const minutes = (ms: number) => String(Math.round(ms / 60_000));

export async function sendConfirmationLink(userId: string, email: string): Promise<void> {
  if (!mailRateLimited(email).ok) return;
  const token = await issueToken("confirm", userId);
  await sendMessage("confirm-address", email, {
    link: siteLink(`/confirm-address/link?token=${token}`),
    hours: hours(TOKEN_PURPOSES.confirm.lifetimeMs),
  });
}

export async function sendAlreadyRegistered(email: string): Promise<void> {
  if (!mailRateLimited(email).ok) return;
  await sendMessage("already-registered", email, { resetLink: siteLink("/reset-password"), loginLink: siteLink("/login") });
}

export async function sendResetLink(userId: string, email: string): Promise<void> {
  if (!mailRateLimited(email).ok) return;
  const token = await issueToken("reset", userId);
  await sendMessage("reset-password", email, {
    link: siteLink(`/reset-password/new?token=${token}`),
    minutes: minutes(TOKEN_PURPOSES.reset.lifetimeMs),
  });
}
