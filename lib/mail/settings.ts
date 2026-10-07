/**
 * Whether the app sends email, read from the environment once and decided in one place (G-113, D342).
 *
 * Sending is on only when a transport is named, that transport has what it needs, and both the sender and the site's
 * address are set: a link in a message must name the site, and the site's address must never be read from the request
 * (a forged Host header would put someone else's address in a password-reset link). Anything less is off, and off means
 * the app behaves as it did before G-113: no message is sent and none is claimed.
 */

export type TransportId = "file" | "resend";

export type MailSettings =
  | { on: true; transport: TransportId; from: string; siteUrl: string; outboxDir: string; resendApiKey: string }
  | { on: false; reason: string };

/** `||` not `??` throughout: a copied `.env.example` leaves these as empty strings. */
export function mailSettings(env: Record<string, string | undefined>): MailSettings {
  const transport = env.MAIL_TRANSPORT || "";
  if (!transport) return { on: false, reason: "MAIL_TRANSPORT is not set" };
  if (transport !== "file" && transport !== "resend") return { on: false, reason: `MAIL_TRANSPORT "${transport}" is not a transport` };
  const from = env.MAIL_FROM || "";
  if (!from) return { on: false, reason: "MAIL_FROM is not set" };
  const siteUrl = (env.AUTH_URL || env.APP_URL || "").replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+$/.test(siteUrl)) return { on: false, reason: "AUTH_URL or APP_URL must be the site's address" };
  const resendApiKey = env.RESEND_API_KEY || "";
  if (transport === "resend" && !resendApiKey) return { on: false, reason: "RESEND_API_KEY is not set" };
  return { on: true, transport, from, siteUrl, outboxDir: env.MAIL_OUTBOX_DIR || "mail-outbox", resendApiKey };
}
