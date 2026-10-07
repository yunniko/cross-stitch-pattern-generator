import { describe, expect, it } from "vitest";
import { accountRecheckMs, sessionEnded, type RecheckedAccount } from "@/lib/auth/session-rule";

const RESET_AT = new Date("2026-10-07T12:00:00Z");
const fine: RecheckedAccount = { disabled: false, emailVerified: RESET_AT, sessionsValidFrom: null };

describe("sessionEnded (D335, D344, D345)", () => {
  it("ends the session of an account that is gone or disabled", () => {
    expect(sessionEnded(null, Date.now(), true)).toBe(true);
    expect(sessionEnded({ ...fine, disabled: true }, Date.now(), false)).toBe(true);
  });

  it("ends an unconfirmed account's session only while sending is on", () => {
    const unconfirmed = { ...fine, emailVerified: null };
    expect(sessionEnded(unconfirmed, Date.now(), true)).toBe(true);
    expect(sessionEnded(unconfirmed, Date.now(), false)).toBe(false);
  });

  it("ends sessions signed in before a reset and keeps those signed in after it", () => {
    const reset = { ...fine, sessionsValidFrom: RESET_AT };
    expect(sessionEnded(reset, RESET_AT.getTime() - 1, true)).toBe(true);
    expect(sessionEnded(reset, RESET_AT.getTime(), true)).toBe(false);
    expect(sessionEnded(reset, RESET_AT.getTime() + 60_000, false)).toBe(false);
  });

  it("treats a session with no recorded sign-in time as older than any reset", () => {
    expect(sessionEnded({ ...fine, sessionsValidFrom: RESET_AT }, undefined, true)).toBe(true);
    expect(sessionEnded(fine, undefined, true)).toBe(false);
  });
});

describe("accountRecheckMs", () => {
  it("is five minutes unless ACCOUNT_RECHECK_SECONDS says otherwise", () => {
    expect(accountRecheckMs({})).toBe(300_000);
    expect(accountRecheckMs({ ACCOUNT_RECHECK_SECONDS: "" })).toBe(300_000);
    expect(accountRecheckMs({ ACCOUNT_RECHECK_SECONDS: "0" })).toBe(0);
    expect(accountRecheckMs({ ACCOUNT_RECHECK_SECONDS: "30" })).toBe(30_000);
  });

  it("ignores a value that is not a non-negative number", () => {
    expect(accountRecheckMs({ ACCOUNT_RECHECK_SECONDS: "soon" })).toBe(300_000);
    expect(accountRecheckMs({ ACCOUNT_RECHECK_SECONDS: "-5" })).toBe(300_000);
  });
});
