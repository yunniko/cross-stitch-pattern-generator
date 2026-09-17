import { beforeEach, describe, expect, it } from "vitest";
import { clientIp, guardMutation, originRejected, rateLimited, resetRateLimits } from "@/lib/server/request-guard";

/**
 * The two checks standing in front of the processor (G-034 M2, acceptance criterion 6): a state-changing request must
 * come from this site, and one address may not spend the pool at will. Previews carry their own, larger allowance
 * (G-034 M3), because switching modes several times is normal use.
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

  it("gives previews their own, larger allowance", () => {
    // Spending the whole generation budget must not stop the same person from looking at enhancement modes.
    for (let i = 0; i < 6; i++) rateLimited(request({ ip: "203.0.113.8" }));
    expect(rateLimited(request({ ip: "203.0.113.8" }))?.status).toBe(429);

    const previews = Array.from({ length: 30 }, () => rateLimited(request({ ip: "203.0.113.8" }), "preview"));
    expect(previews.every((result) => result === null)).toBe(true);
    expect(rateLimited(request({ ip: "203.0.113.8" }), "preview")?.status).toBe(429);
  });
});

describe("configurable capacity", () => {
  it("uses the production default when no override is set", () => {
    delete process.env.RATE_LIMIT_JOBS_PER_MINUTE;
    const results = Array.from({ length: 7 }, () => rateLimited(request({ ip: "203.0.113.20" })));
    expect(results.filter((r) => r === null)).toHaveLength(6);
    expect(results[6]?.status).toBe(429);
  });

  it("honours an override, so a test run is not refused for behaving unlike a person", () => {
    process.env.RATE_LIMIT_JOBS_PER_MINUTE = "50";
    try {
      const results = Array.from({ length: 20 }, () => rateLimited(request({ ip: "203.0.113.21" })));
      expect(results.every((r) => r === null)).toBe(true);
    } finally {
      delete process.env.RATE_LIMIT_JOBS_PER_MINUTE;
    }
  });

  it("ignores a nonsensical override rather than disabling the limit", () => {
    for (const bad of ["0", "-5", "not-a-number", ""]) {
      process.env.RATE_LIMIT_JOBS_PER_MINUTE = bad;
      resetRateLimits();
      try {
        const results = Array.from({ length: 7 }, () => rateLimited(request({ ip: "203.0.113.22" })));
        expect(results.filter((r) => r === null), `override ${JSON.stringify(bad)}`).toHaveLength(6);
      } finally {
        delete process.env.RATE_LIMIT_JOBS_PER_MINUTE;
      }
    }
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

  it("applies the preview allowance when asked for one", () => {
    const allowed = Array.from({ length: 30 }, () => guardMutation(request({ origin: SITE, ip: "203.0.113.12" }), "preview"));
    expect(allowed.every((result) => result === null)).toBe(true);
    expect(guardMutation(request({ origin: SITE, ip: "203.0.113.12" }), "preview")?.status).toBe(429);
  });
});
