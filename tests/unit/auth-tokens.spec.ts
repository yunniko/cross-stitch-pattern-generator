import { describe, expect, it } from "vitest";
import { hashToken, judgeToken, newToken, TOKEN_PURPOSES, tokenIdentifier, wellFormedToken } from "@/lib/auth/tokens";

/** G-113, D343: the links' tokens are random, stored hashed, bound to a purpose and an account, and expire. */

const NOW = new Date("2026-10-07T12:00:00Z");

describe("newToken", () => {
  it("puts the random value in the link and only its hash in the record", () => {
    const token = newToken("reset", "user-1", NOW);
    expect(wellFormedToken(token.raw)).toBe(true);
    expect(token.hash).toBe(hashToken(token.raw));
    expect(token.hash).not.toContain(token.raw);
    expect(token.identifier).toBe("reset:user-1");
  });

  it("expires after its purpose's lifetime: a reset within the hour, a confirmation within two days", () => {
    expect(newToken("reset", "u", NOW).expires.getTime() - NOW.getTime()).toBe(TOKEN_PURPOSES.reset.lifetimeMs);
    expect(newToken("confirm", "u", NOW).expires.getTime() - NOW.getTime()).toBe(TOKEN_PURPOSES.confirm.lifetimeMs);
    expect(TOKEN_PURPOSES.reset.lifetimeMs).toBe(60 * 60_000);
  });

  it("differs every time", () => {
    expect(newToken("confirm", "u", NOW).raw).not.toBe(newToken("confirm", "u", NOW).raw);
  });
});

describe("wellFormedToken", () => {
  it("accepts only what newToken makes", () => {
    expect(wellFormedToken("a".repeat(43))).toBe(true);
    for (const bad of [undefined, null, 42, "", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)}/`]) {
      expect(wellFormedToken(bad)).toBe(false);
    }
  });
});

describe("judgeToken", () => {
  const record = (purpose: "confirm" | "reset", expires: Date) => ({ identifier: tokenIdentifier(purpose, "user-1"), expires });
  const later = new Date(NOW.getTime() + 1000);

  it("names the account for a token of the right purpose that has not expired", () => {
    expect(judgeToken(record("reset", later), "reset", NOW)).toEqual({ ok: true, userId: "user-1" });
  });

  it("refuses a token that is not there: never issued, used, or replaced", () => {
    expect(judgeToken(null, "reset", NOW)).toEqual({ ok: false, reason: "unknown" });
  });

  it("refuses a token of the other purpose, so a confirmation link cannot set a password", () => {
    expect(judgeToken(record("confirm", later), "reset", NOW)).toEqual({ ok: false, reason: "unknown" });
    expect(judgeToken({ identifier: "reset:", expires: later }, "reset", NOW)).toEqual({ ok: false, reason: "unknown" });
  });

  it("refuses a token at its expiry and after it", () => {
    expect(judgeToken(record("reset", NOW), "reset", NOW)).toEqual({ ok: false, reason: "expired" });
  });
});
