import { NextResponse } from "next/server";

/**
 * What stands between the open internet and the processor (G-034 M2).
 *
 * The processor itself has no published port, so every request to it arrives through these Route Handlers. A public
 * endpoint that spends seconds of CPU is an easy denial-of-service target on a shared host, so state-changing requests
 * must come from this site's own pages, and each address gets a bounded rate. The caps behind this (pool of three,
 * queue of twelve) bound the damage even when both checks pass; nginx `limit_req` is the layer above.
 *
 * Reads of a job the caller already holds the id of are not Origin-checked: the id is an unguessable UUID, and an
 * `EventSource` does not send `Origin` on a same-origin GET.
 */

/** Generations per minute per address, refilled continuously rather than in steps. */
const CAPACITY = 6;
const REFILL_PER_MS = CAPACITY / 60_000;
/** Bounds the map itself, so a spray of forged addresses cannot grow it without limit. */
const MAX_TRACKED = 5000;

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

function allowedOrigins(req: Request): string[] {
  const configured = process.env.APP_URL;
  const origins = [new URL(req.url).origin];
  if (configured) {
    try {
      origins.push(new URL(configured).origin);
    } catch {
      // A malformed APP_URL must not open the check up; the request origin above still applies.
    }
  }
  return origins;
}

/**
 * Refuses a state-changing request that did not come from this site. A missing `Origin` is refused too: browsers send
 * it on every cross-origin POST, so its absence means the request did not come from a page of ours.
 */
export function originRejected(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (origin && allowedOrigins(req).includes(origin)) return null;
  return NextResponse.json({ error: "This endpoint only serves this site." }, { status: 403 });
}

/** Spends one token for this address, or refuses with the seconds until the next one is available. */
export function rateLimited(req: Request): NextResponse | null {
  const ip = clientIp(req);
  const now = Date.now();
  if (buckets.size >= MAX_TRACKED && !buckets.has(ip)) {
    for (const [key, bucket] of buckets) {
      if (bucket.tokens >= CAPACITY) buckets.delete(key);
      if (buckets.size < MAX_TRACKED) break;
    }
  }
  const bucket = buckets.get(ip) ?? { tokens: CAPACITY, updated: now };
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + (now - bucket.updated) * REFILL_PER_MS);
  bucket.updated = now;
  if (bucket.tokens < 1) {
    const waitSeconds = Math.ceil((1 - bucket.tokens) / REFILL_PER_MS / 1000);
    buckets.set(ip, bucket);
    return NextResponse.json(
      { error: "Too many requests from this address; wait a moment and try again." },
      { status: 429, headers: { "retry-after": String(waitSeconds) } }
    );
  }
  bucket.tokens -= 1;
  buckets.set(ip, bucket);
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
