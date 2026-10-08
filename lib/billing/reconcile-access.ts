import { timingSafeEqual } from "node:crypto";

/**
 * Who may start the reconciliation (G-106 M2): only the compose service beside the app, on the internal network.
 * A request through nginx carries `x-real-ip`, which the vhost sets, and is refused; the shared token
 * (`BILLING_RECONCILE_TOKEN`, at least 32 characters) is checked in constant time. Unset, the pass is off.
 */

export const MIN_TOKEN_LENGTH = 32;

export function reconcileRefusal(headers: Headers, token: string | undefined): { status: 403 | 404; error: string } | null {
  if (!token || token.length < MIN_TOKEN_LENGTH) return { status: 404, error: "reconciliation is off" };
  if (headers.has("x-real-ip")) return { status: 403, error: "not from outside" };
  const given = Buffer.from(headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(token);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { status: 403, error: "wrong token" };
  return null;
}
