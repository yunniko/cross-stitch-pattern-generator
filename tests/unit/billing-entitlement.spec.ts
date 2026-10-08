import { describe, expect, it } from "vitest";
import {
  LATE_RECORD_ALLOWANCE_MS,
  SUBSCRIPTION_STATUSES,
  entitlement,
  hasTier,
  type EntitlementInput,
  type FreeReason,
  type SubscriptionStatus,
} from "../../lib/billing/entitlement";

/**
 * G-106 M1 (acceptance 5, D367): what a subscription gives, over the full table of Stripe's statuses × the time now.
 * The times are taken around the stored period's end: well inside it, just before it, inside the allowance for a late
 * record, at the allowance's end, and long after.
 */

const PERIOD_END = new Date("2026-11-08T12:00:00Z");
const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(PERIOD_END.getTime() + offsetMs);

const TIMES = {
  "a week before the end": at(-7 * 24 * HOUR),
  "a second before the end": at(-1000),
  "inside the allowance": at(LATE_RECORD_ALLOWANCE_MS - HOUR),
  "at the allowance's end": at(LATE_RECORD_ALLOWANCE_MS),
  "a month after the end": at(30 * 24 * HOUR),
} as const;
type When = keyof typeof TIMES;

const subscription = (status: string, currentPeriodEnd: Date | null = PERIOD_END): EntitlementInput => ({
  status,
  currentPeriodEnd,
  firstFailedAt: null,
});

/** Statuses that give the tier while the stored period (and its allowance) lasts. */
const UNTIL_PERIOD_END: readonly SubscriptionStatus[] = ["trialing", "active", "past_due"];

/** The Free reason of every status that never gives the tier. */
const ALWAYS_FREE: Record<Exclude<SubscriptionStatus, "trialing" | "active" | "past_due">, FreeReason> = {
  incomplete: "first-payment-pending",
  incomplete_expired: "first-payment-never-made",
  unpaid: "unpaid",
  canceled: "canceled",
  paused: "paused",
};

describe("the table of status × time", () => {
  it("names every Stripe status, and only those", () => {
    expect([...SUBSCRIPTION_STATUSES].sort()).toEqual([...UNTIL_PERIOD_END, ...Object.keys(ALWAYS_FREE)].sort());
  });

  for (const status of UNTIL_PERIOD_END) {
    describe(`${status}`, () => {
      const tierAt: Record<When, boolean> = {
        "a week before the end": true,
        "a second before the end": true,
        "inside the allowance": true,
        "at the allowance's end": false,
        "a month after the end": false,
      };
      for (const [when, now] of Object.entries(TIMES) as [When, Date][]) {
        it(`${tierAt[when] ? "gives the tier" : "gives Free"} ${when}`, () => {
          const answer = entitlement(subscription(status), now);
          if (tierAt[when]) expect(answer).toEqual({ tier: true, until: at(LATE_RECORD_ALLOWANCE_MS), status });
          else expect(answer).toEqual({ tier: false, reason: "period-ended", status });
        });
      }
      it("gives Free when no period end is recorded: a tier is never given without an end", () => {
        expect(entitlement(subscription(status, null), TIMES["a week before the end"])).toEqual({
          tier: false,
          reason: "no-period-recorded",
          status,
        });
      });
    });
  }

  for (const [status, reason] of Object.entries(ALWAYS_FREE)) {
    it(`${status} gives Free at every time, as "${reason}"`, () => {
      for (const now of Object.values(TIMES)) expect(entitlement(subscription(status), now)).toEqual({ tier: false, reason, status });
    });
  }
});

describe("what is not a subscription Stripe would send", () => {
  it("gives Free with no subscription", () => {
    expect(entitlement(null, TIMES["a week before the end"])).toEqual({ tier: false, reason: "no-subscription", status: null });
    expect(entitlement(undefined, TIMES["a week before the end"])).toEqual({ tier: false, reason: "no-subscription", status: null });
  });

  it("gives Free for a status it does not know, and says which", () => {
    expect(entitlement(subscription("suspended"), TIMES["a week before the end"])).toEqual({
      tier: false,
      reason: "unknown-status",
      status: "suspended",
    });
  });
});

describe("the failing subscription the old rule kept for ever", () => {
  it("loses the tier once the stored period and its allowance have passed, however long it stays past_due", () => {
    const failing = { ...subscription("past_due"), firstFailedAt: at(-29 * 24 * HOUR) };
    expect(hasTier(failing, TIMES["a week before the end"])).toBe(true);
    expect(hasTier(failing, TIMES["a month after the end"])).toBe(false);
    expect(hasTier(failing, new Date("2030-01-01T00:00:00Z"))).toBe(false);
  });
});
