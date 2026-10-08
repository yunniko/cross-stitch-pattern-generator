import { describe, expect, it } from "vitest";
import { ACCOUNT_LIMITS, countedLimits, limitById, resolveLimits, type LimitValue } from "../../lib/limits/limits";
import { decideQuota, limitUse, limitsInForce, lookbackMs, refusalMessage, retryAfterSeconds, waitWords } from "../../lib/limits/quota";

/** G-109: counted limits over rolling periods, decided from the times of a person's uses. */

const NOW = new Date("2026-10-08T12:00:00Z");
const HOUR = 3_600_000;
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);
const DAY = limitById("generations.24h")!;
const MONTH = limitById("generations.30d")!;
const limitsWith = (values: Record<string, LimitValue>) => resolveLimits({ site: values });

describe("the counted limits in the list", () => {
  it("count generations and server exports over 24 hours and 30 days, unlimited until the admin sets them", () => {
    expect(countedLimits("GENERATE").map((limit) => limit.id)).toEqual(["generations.24h", "generations.30d"]);
    expect(countedLimits("EXPORT").map((limit) => limit.id)).toEqual(["exports.24h", "exports.30d"]);
    for (const limit of ACCOUNT_LIMITS.filter((limit) => limit.counted)) expect(limit.siteDefault).toBe("unlimited");
  });

  it("puts nothing in force by default", () => {
    expect(limitsInForce("GENERATE", resolveLimits({ site: {} }))).toEqual([]);
    expect(decideQuota("GENERATE", resolveLimits({ site: {} }), false, [], NOW)).toEqual({ allowed: true });
  });

  it("reads back as far as the longest period in force", () => {
    expect(lookbackMs(limitsInForce("GENERATE", limitsWith({ "generations.24h": 5 })))).toBe(24 * HOUR);
    expect(lookbackMs(limitsInForce("GENERATE", limitsWith({ "generations.24h": 5, "generations.30d": 50 })))).toBe(720 * HOUR);
  });
});

describe("one limit's use in a rolling period", () => {
  it("counts only the uses inside the period that ends now", () => {
    const use = limitUse(DAY, 3, [ago(1), ago(23.9), ago(24), ago(30)], NOW);
    expect(use).toMatchObject({ used: 2, left: 1, nextAt: null });
  });

  it("allows the next one when the oldest counted use leaves the period", () => {
    const use = limitUse(DAY, 2, [ago(5), ago(20)], NOW);
    expect(use.left).toBe(0);
    expect(use.nextAt).toEqual(new Date(ago(20).getTime() + 24 * HOUR));
  });

  it("waits for enough of the oldest to leave when the admin lowered the value under what was used", () => {
    // Four uses, a limit of 2: one more is allowed once three have left, so at the third oldest plus the period.
    const use = limitUse(DAY, 2, [ago(1), ago(10), ago(15), ago(22)], NOW);
    expect(use).toMatchObject({ used: 4, left: 0 });
    expect(use.nextAt).toEqual(new Date(ago(10).getTime() + 24 * HOUR));
  });

  it("never allows one with a value of 0", () => {
    expect(limitUse(DAY, 0, [], NOW)).toMatchObject({ used: 0, left: 0, nextAt: null });
  });

  it("takes the uses in any order", () => {
    expect(limitUse(DAY, 2, [ago(20), ago(5)], NOW).nextAt).toEqual(limitUse(DAY, 2, [ago(5), ago(20)], NOW).nextAt);
  });
});

describe("deciding a request", () => {
  it("allows while every limit in force has some left", () => {
    expect(decideQuota("GENERATE", limitsWith({ "generations.24h": 2 }), true, [ago(1)], NOW)).toEqual({ allowed: true });
  });

  it("refuses a guest whenever a limit is in force, without counting anything", () => {
    expect(decideQuota("EXPORT", limitsWith({ "exports.30d": 100 }), false, [], NOW)).toEqual({
      allowed: false,
      reason: "sign-in",
      action: "EXPORT",
    });
  });

  it("names the limit that keeps the person waiting longest", () => {
    const uses = [ago(2), ago(100), ago(200)];
    const decision = decideQuota("GENERATE", limitsWith({ "generations.24h": 1, "generations.30d": 3 }), true, uses, NOW);
    expect(decision.allowed).toBe(false);
    if (decision.allowed || decision.reason !== "used-up") throw new Error("expected used-up");
    expect(decision.use.limit).toBe(MONTH);
    expect(decision.use.nextAt).toEqual(new Date(ago(200).getTime() + 720 * HOUR));
  });

  it("does not limit one action by the other's limits", () => {
    expect(decideQuota("EXPORT", limitsWith({ "generations.24h": 0 }), true, [], NOW)).toEqual({ allowed: true });
  });
});

describe("the refusal", () => {
  it("tells a guest to sign in", () => {
    const decision = decideQuota("GENERATE", limitsWith({ "generations.24h": 5 }), false, [], NOW);
    if (decision.allowed) throw new Error("expected a refusal");
    expect(refusalMessage(decision, NOW)).toBe("Generating a chart needs an account: sign in, or create one.");
    expect(retryAfterSeconds(decision, NOW)).toBeNull();
  });

  it("names the limit, when the next is available, and the plans that give more", () => {
    const decision = decideQuota("GENERATE", limitsWith({ "generations.24h": 2 }), true, [ago(1), ago(21)], NOW);
    if (decision.allowed) throw new Error("expected a refusal");
    expect(refusalMessage(decision, NOW, ["Personal", "Professional"])).toBe(
      "You have used all 2 generations allowed in 24 hours. The next is available in 3 hours. Plans give more: Personal, Professional."
    );
    expect(retryAfterSeconds(decision, NOW)).toBe(3 * 3600);
  });

  it("speaks of one use, and of days for the 30-day period", () => {
    const decision = decideQuota("EXPORT", limitsWith({ "exports.30d": 1 }), true, [ago(24 * 20)], NOW);
    if (decision.allowed) throw new Error("expected a refusal");
    expect(refusalMessage(decision, NOW)).toBe("You have used all 1 export allowed in 30 days. The next is available in 10 days.");
  });

  it("says plainly when an action is not available at all", () => {
    const decision = decideQuota("EXPORT", limitsWith({ "exports.24h": 0 }), true, [], NOW);
    if (decision.allowed) throw new Error("expected a refusal");
    expect(refusalMessage(decision, NOW, ["Personal"])).toBe(
      "Exporting from the server is not available to your account. A plan gives more: Personal."
    );
    expect(retryAfterSeconds(decision, NOW)).toBeNull();
  });

  it("rounds the wait up, never telling the person to come back too early", () => {
    expect(waitWords(1)).toBe("in 1 minute");
    expect(waitWords(61 * 60_000)).toBe("in 2 hours");
    expect(waitWords(47 * HOUR)).toBe("in 47 hours");
    expect(waitWords(49 * HOUR)).toBe("in 3 days");
  });
});
