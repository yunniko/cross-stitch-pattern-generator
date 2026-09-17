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
 * Requests per minute per address, refilled continuously rather than in steps. Previews get a larger allowance than
 * generations because trying several modes in a row is normal use and costs the server far less (G-034 M3).
 */
export type RateKind = "job" | "preview";
const DEFAULT_CAPACITY: Record<RateKind, number> = { job: 6, preview: 30 };
const CAPACITY_ENV: Record<RateKind, string> = {
  job: "RATE_LIMIT_JOBS_PER_MINUTE",
  preview: "RATE_LIMIT_PREVIEWS_PER_MINUTE",
};

/**
 * The production allowance is the default. It is overridable by environment variable for one reason: the e2e suite
 * drives far more generations per minute than any person would, and would otherwise spend the whole run being
 * correctly refused. The limit's own behaviour is covered by unit tests rather than by the browser suite.
 */
function capacityFor(kind: RateKind): number {
  const override = Number(process.env[CAPACITY_ENV[kind]]);
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_CAPACITY[kind];
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

/** Makes room in the bucket map by dropping the addresses least likely to still be active. */
function makeRoom(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.updated > STALE_MS) buckets.delete(key);
  }
  if (buckets.size < MAX_TRACKED) return;
  const oldest = [...buckets.entries()].sort((a, b) => a[1].updated - b[1].updated);
  for (const [key] of oldest.slice(0, Math.ceil(MAX_TRACKED / 10))) buckets.delete(key);
}

/** Spends one token of this kind for this address, or refuses with the seconds until the next one is available. */
export function rateLimited(req: Request, kind: RateKind = "job"): NextResponse | null {
  const capacity = capacityFor(kind);
  const refillPerMs = capacity / 60_000;
  const key = `${kind}:${clientIp(req)}`;
  const now = Date.now();

  if (buckets.size >= MAX_TRACKED && !buckets.has(key)) makeRoom(now);

  const bucket = buckets.get(key) ?? { tokens: capacity, updated: now };
  bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.updated) * refillPerMs);
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
export function guardMutation(req: Request, kind: RateKind = "job"): NextResponse | null {
  return originRejected(req) ?? rateLimited(req, kind);
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
