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
 * Requests per minute per address, refilled continuously rather than in steps.
 *
 * There was a second, larger allowance for photo previews until G-074 M4: the four sliders draw the preview
 * in the browser, so nothing asks the server for one (D240).
 */
const CAPACITY = 6;
const CAPACITY_ENV = "RATE_LIMIT_JOBS_PER_MINUTE";

/**
 * The production allowance is the default. It is overridable by environment variable for one reason: the e2e suite
 * drives far more generations per minute than any person would, and would otherwise spend the whole run being
 * correctly refused. The limit's own behaviour is covered by unit tests rather than by the browser suite.
 */
function capacity(): number {
  const override = Number(process.env[CAPACITY_ENV]);
  return Number.isFinite(override) && override > 0 ? override : CAPACITY;
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

/** Behind nginx the real address is in `x-forwarded-for`; its first entry is the client, the rest are proxies. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
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

/** Spends one token for this address, or refuses with the seconds until the next one is available. */
export function rateLimited(req: Request): NextResponse | null {
  const allowance = capacity();
  const refillPerMs = allowance / 60_000;
  const key = clientIp(req);
  const now = Date.now();

  if (buckets.size >= MAX_TRACKED && !buckets.has(key)) makeRoom(now);

  const bucket = buckets.get(key) ?? { tokens: allowance, updated: now };
  bucket.tokens = Math.min(allowance, bucket.tokens + (now - bucket.updated) * refillPerMs);
  bucket.updated = now;
  buckets.set(key, bucket);

  if (bucket.tokens < 1) {
    const waitSeconds = Math.ceil((1 - bucket.tokens) / refillPerMs / 1000);
    return NextResponse.json(
      { error: "Too many requests from this address; wait a moment and try again." },
      { status: 429, headers: { "retry-after": String(waitSeconds) } }
    );
  }
  bucket.tokens -= 1;
  return null;
}

/** Both checks, in the order a state-changing request needs them. Returns the refusal to send, or null to proceed. */
export function guardMutation(req: Request): NextResponse | null {
  return originRejected(req) ?? rateLimited(req);
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
