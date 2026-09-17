import { beforeEach, describe, expect, it } from "vitest";
import { clientIp, guardMutation, originRejected, rateLimited, resetRateLimits } from "@/lib/server/request-guard";

/**
 * The two checks standing in front of the processor (G-034 M2, acceptance criterion 6): a state-changing request must
 * come from this site, and one address may not spend the pool at will.
 */

const SITE = "http://localhost:3000";

function request(init: { origin?: string | null; ip?: string; method?: string } = {}): Request {
  const headers = new Headers();
  if (init.origin) headers.set("origin", init.origin);
  if (init.ip) headers.set("x-forwarded-for", init.ip);
  return new Request(`${SITE}/api/jobs`, { method: init.method ?? "POST", headers });
}

beforeEach(() => {
  resetRateLimits();
});

describe("origin check", () => {
  it("allows a request from the site's own origin", () => {
    expect(originRejected(request({ origin: SITE }))).toBeNull();
  });

  it("refuses a request from another origin", () => {
    const refused = originRejected(request({ origin: "https://not-this-site.example" }));
    expect(refused?.status).toBe(403);
  });

  it("refuses a request with no Origin at all", () => {
    // Browsers send Origin on every cross-origin POST, so its absence means the request did not come from a page here.
    expect(originRejected(request({ origin: null }))?.status).toBe(403);
  });
});

describe("rate limit", () => {
  it("allows a burst up to the bucket's capacity, then refuses with Retry-After", () => {
    const allowed: number[] = [];
    for (let i = 0; i < 6; i++) {
      if (rateLimited(request({ ip: "203.0.113.7" })) === null) allowed.push(i);
    }
    expect(allowed).toHaveLength(6);

    const refused = rateLimited(request({ ip: "203.0.113.7" }));
    expect(refused?.status).toBe(429);
    expect(Number(refused?.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("counts each address separately", () => {
    for (let i = 0; i < 6; i++) rateLimited(request({ ip: "203.0.113.7" }));
    expect(rateLimited(request({ ip: "203.0.113.7" }))?.status).toBe(429);
    expect(rateLimited(request({ ip: "198.51.100.4" }))).toBeNull();
  });

  it("reads the client address from the first x-forwarded-for entry", () => {
    // Behind nginx the header is "client, proxy1, proxy2" -- taking the last entry would rate-limit the proxy instead.
    expect(clientIp(request({ ip: "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
});

describe("guardMutation", () => {
  it("refuses a foreign origin before spending a token", () => {
    expect(guardMutation(request({ origin: "https://not-this-site.example", ip: "203.0.113.9" }))?.status).toBe(403);
    // The bucket is untouched, so a legitimate request from that address still has its full burst.
    const allowed = Array.from({ length: 6 }, () => rateLimited(request({ ip: "203.0.113.9" })));
    expect(allowed.every((result) => result === null)).toBe(true);
  });

  it("passes a same-origin request within its rate", () => {
    expect(guardMutation(request({ origin: SITE, ip: "203.0.113.11" }))).toBeNull();
  });
});
