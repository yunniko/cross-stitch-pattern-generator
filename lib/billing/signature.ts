import { createHmac, timingSafeEqual } from "node:crypto";
import { BillingSignatureError } from "./contract";

/**
 * Stripe's webhook signature scheme, for the fake adapter (G-106 M1): `t=<seconds>,v1=<hex>` over `<t>.<raw body>` with
 * HMAC-SHA256, checked in constant time, refused when older than the tolerance. Stripe's own adapter uses the `stripe`
 * package's check instead; this one exists so the fake's events pass through the webhook exactly as Stripe's would.
 * Scheme: docs/reviews/2026-10-08-stripe-billing-reference.md.
 */

/** Stripe's libraries' default, five minutes. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signPayload(rawBody: string, secret: string, at: Date): string {
  const t = Math.floor(at.getTime() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

export function verifySignature(rawBody: string, header: string | null, secret: string, now: Date): void {
  if (!header) throw new BillingSignatureError("no signature");
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && /^\d+$/.test(value ?? "")) timestamp = Number(value);
    // Only v1: Stripe's advice, against a downgrade to a weaker scheme.
    else if (key === "v1" && /^[0-9a-f]{64}$/.test(value ?? "")) signatures.push(value);
  }
  if (timestamp === null || signatures.length === 0) throw new BillingSignatureError("malformed signature");
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"));
  if (!signatures.some((signature) => timingSafeEqual(Buffer.from(signature), expected)))
    throw new BillingSignatureError("signature does not match");
  if (Math.abs(now.getTime() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) throw new BillingSignatureError("signature too old");
}
