import { NextResponse } from "next/server";

/**
 * What stands between the open internet and the processor (G-034 M2, M3).
 *
 * The processor itself has no published port, so every request to it arrives through these Route Handlers. A public
 * endpoint that spends real CPU is an easy denial-of-service target on a shared host, so state-changing requests must
 * come from this site's own pages, and each address gets a bounded rate. The caps behind this (pool of three, queue of
 * twelve) bound the damage even when both checks pass; nginx `limit_req` is the layer above.
 *
 * Reads of a job the caller already holds the id of are not Origin-checked: the id is an unguessable UUID, and an
 * `EventSource` does not send `Origin` on a same-origin GET.
 */

/**
 * Tokens per address, refilled continuously rather than in steps, per `kind` -- each with its own bucket,
 * capacity and window, so spending a generation does not spend a login attempt (there was a second kind for
 * photo previews until G-074 M4 removed it entirely, D240; `auth` is the first since).
 *
 * `job`'s window is a minute, matching how often a person actually presses Generate. `auth`'s is fifteen
 * minutes at a much smaller capacity: brute-forcing a password is the threat, not a reader who mistypes it
 * twice, and a fast-refilling bucket does nothing against a script patient enough to stay under it.
 */
export type RateKind = "job" | "auth" | "authAccount" | "prediction" | "ditherPreview";
const CONFIG: Record<RateKind, { capacity: number; windowMs: number; env: string }> = {
  job: { capacity: 6, windowMs: 60_000, env: "RATE_LIMIT_JOBS_PER_MINUTE" },
  auth: { capacity: 8, windowMs: 15 * 60_000, env: "RATE_LIMIT_AUTH_PER_15MIN" },
  // Per account as well as per address (G-117, D334), so guesses spread over many addresses still meet a limit. Larger
  // than `auth`, so one address cannot lock a person out of their own account.
  authAccount: { capacity: 20, windowMs: 15 * 60_000, env: "RATE_LIMIT_AUTH_ACCOUNT_PER_15MIN" },
  // A prediction (G-087) is a few milliseconds of work asked for after each pause in changing a setting, so it has a bucket of its
  // own: sharing `job`'s six a minute would let the hint use up the reader's Generates.
  prediction: { capacity: 90, windowMs: 60_000, env: "RATE_LIMIT_PREDICTIONS_PER_MINUTE" },
  // A drawn pattern's preview (G-100) is asked for the same way, after each pause on a texture slider, and is as short;
  // a bucket of its own, so a reader shaping marks does not use up the colour recommendation.
  ditherPreview: { capacity: 90, windowMs: 60_000, env: "RATE_LIMIT_DITHER_PREVIEWS_PER_MINUTE" },
};

/**
 * The production allowance is the default. It is overridable by environment variable for one reason: the e2e suite
 * drives far more generations per minute than any person would, and would otherwise spend the whole run being
 * correctly refused. The limit's own behaviour is covered by unit tests rather than by the browser suite.
 */
function capacity(kind: RateKind): number {
  const override = Number(process.env[CONFIG[kind].env]);
  return Number.isFinite(override) && override > 0 ? override : CONFIG[kind].capacity;
}
/** Bounds the map itself, so a spray of forged addresses cannot grow it without limit. */
const MAX_TRACKED = 5000;
/** A bucket untouched for this long is worth dropping: it has refilled to full anyway. */
const STALE_MS = 2 * 60_000;

interface Bucket {
  tokens: number;
  updated: number;
}

const buckets = new Map<string, Bucket>();

/**
 * The address the connection came from. Behind nginx it is `x-real-ip`, which the vhost sets from the connection itself
 * and so overwrites whatever a client sent. Without it, only the last `x-forwarded-for` entry was added by a proxy;
 * every entry before it is the client's own claim (G-117, D334).
 */
export function clientIp(req: Request | Headers): string {
  const headers = req instanceof Headers ? req : req.headers;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || "unknown";
}

/** The spellings a browser may use for this machine. They address one site, so the check must read them as one. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * One comparable form per origin, so the same site matches however it was spelled. Only the loopback host is
 * rewritten: scheme and port still tell origins apart, and a real host is never folded into loopback. Anything
 * unparseable — a malformed `APP_URL`, or the literal "null" a sandboxed frame sends — returns null and is dropped
 * rather than compared, so it can never widen what is allowed.
 */
function canonicalOrigin(origin: string): string | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  const host = LOOPBACK_HOSTS.has(url.hostname) ? "loopback" : url.hostname;
  // `url.port` is empty for a scheme's default port, so :80 and an omitted port compare equal, as they should.
  return `${url.protocol}//${host}:${url.port}`;
}

/**
 * The origins a request may claim: the one it arrived at, and `APP_URL` when set. Unset means nothing extra is
 * trusted, which is the deployed default — the site's own origin is what a browser sends anyway.
 */
function allowedOrigins(req: Request): string[] {
  const configured = process.env.APP_URL;
  return configured ? [new URL(req.url).origin, configured] : [new URL(req.url).origin];
}

/**
 * Refuses a state-changing request that did not come from this site. A missing `Origin` is refused too: browsers send
 * it on every cross-origin POST, so its absence means the request did not come from a page of ours.
 */
export function originRejected(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  const claimed = origin ? canonicalOrigin(origin) : null;
  if (claimed) {
    const allowed = allowedOrigins(req).map(canonicalOrigin);
    if (allowed.includes(claimed)) return null;
  }
  return NextResponse.json({ error: "This endpoint only serves this site." }, { status: 403 });
}

/** Makes room in the bucket map by dropping the addresses least likely to still be active. */
function makeRoom(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.updated > STALE_MS) buckets.delete(key);
  }
  if (buckets.size < MAX_TRACKED) return;
  const oldest = [...buckets.entries()].sort((a, b) => a[1].updated - b[1].updated);
  for (const [key] of oldest.slice(0, Math.ceil(MAX_TRACKED / 10))) buckets.delete(key);
}

type SpendResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** The bucket mechanics alone, shared by the `Request`-based check below and `authRateLimited`. */
function spend(key: string, kind: RateKind): SpendResult {
  const allowance = capacity(kind);
  const refillPerMs = allowance / CONFIG[kind].windowMs;
  const now = Date.now();

  if (buckets.size >= MAX_TRACKED && !buckets.has(key)) makeRoom(now);

  const bucket = buckets.get(key) ?? { tokens: allowance, updated: now };
  bucket.tokens = Math.min(allowance, bucket.tokens + (now - bucket.updated) * refillPerMs);
  bucket.updated = now;
  buckets.set(key, bucket);

  if (bucket.tokens < 1) {
    return { ok: false, retryAfterSeconds: Math.ceil((1 - bucket.tokens) / refillPerMs / 1000) };
  }
  bucket.tokens -= 1;
  return { ok: true };
}

/** Spends one token of `kind` for this address, or refuses with the seconds until the next one is available. */
export function rateLimited(req: Request, kind: RateKind = "job"): NextResponse | null {
  const result = spend(`${kind}:${clientIp(req)}`, kind);
  if (result.ok) return null;
  return NextResponse.json(
    { error: "Too many requests from this address; wait a moment and try again." },
    { status: 429, headers: { "retry-after": String(result.retryAfterSeconds) } }
  );
}

/** Both checks, in the order a state-changing request needs them. Returns the refusal to send, or null to proceed. */
export function guardMutation(req: Request, kind: RateKind = "job"): NextResponse | null {
  return originRejected(req) ?? rateLimited(req, kind);
}

/**
 * The `auth` bucket alone, for a server action rather than a Route Handler (G-075: register/login are
 * actions, D245, so there is no `Request` for `originRejected` to read -- a same-origin form's POST is
 * already outside a script's reach without the browser's own cross-origin rules getting in the way first).
 * `address` is read by the caller from `headers()`, the same way `clientIp` reads it from a `Request`.
 */
export function authRateLimited(address: string): SpendResult {
  return spend(`auth:${address}`, "auth");
}

/**
 * One password check: a token from the address and one from the account (G-117, D334). Every way into `authorize()`
 * spends it, the login form and Auth.js's own callback route alike. The account's token is not spent once the address
 * is refused, so a single address cannot use up someone else's account.
 */
export function signInRateLimited(address: string, email: string): SpendResult {
  const byAddress = spend(`auth:${address}`, "auth");
  if (!byAddress.ok) return byAddress;
  return spend(`authAccount:${email}`, "authAccount");
}

/** Where the processor lives on the internal network; only these handlers ever address it. */
export function processorUrl(path: string): string {
  const base = process.env.PROCESSOR_URL ?? "http://127.0.0.1:8081";
  return `${base.replace(/\/$/, "")}${path}`;
}

/** The processor being unreachable is an outage, not a client error: the same shape of message either way. */
export function processorUnreachable(): NextResponse {
  return NextResponse.json({ error: "The pattern service is unavailable right now." }, { status: 503 });
}

/** Test seam: the bucket map is module state, which would otherwise leak between cases. */
export function resetRateLimits(): void {
  buckets.clear();
}
