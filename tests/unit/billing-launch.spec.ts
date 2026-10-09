import { describe, expect, it } from "vitest";
import { launchChecks, RECONCILE_STALE_MS, type LaunchStatus, type PublicAnswers, type TestClockRecord } from "../../lib/billing/launch";

/** G-128 M3 (D385): the launch check passes only when every fact a first real payment depends on holds. */

const NOW = new Date("2026-11-02T10:00:00Z");

const READY: LaunchStatus = {
  version: "0.30.0",
  commit: "abc1234",
  billing: { on: true, gateway: "stripe", mode: "live", reason: null },
  reconcile: { tokenSet: true, lastRun: { at: "2026-11-02T09:20:00.000Z", ok: true } },
  buying: "ON",
  documents: { terms: 2, privacy: 1, withdrawal: 1 },
};
const SITE: PublicAnswers = { webhook: 400, terms: 200, privacy: 200 };
const CLOCK: TestClockRecord = {
  version: "0.30.0",
  commit: "abc1234",
  ranAt: "2026-11-01T18:00:00Z",
  scenarios: [
    { name: "renewal fails, then paid", passed: true },
    { name: "past the grace to Free", passed: true },
  ],
};

const failing = (facts: { status?: Partial<LaunchStatus>; site?: Partial<PublicAnswers>; testClock?: TestClockRecord | null }) =>
  launchChecks({
    status: { ...READY, ...facts.status },
    site: { ...SITE, ...facts.site },
    testClock: facts.testClock === undefined ? CLOCK : facts.testClock,
    now: NOW,
  }).filter((check) => !check.ok);

describe("the launch check", () => {
  it("passes with everything ready, naming each check", () => {
    const checks = launchChecks({ status: READY, site: SITE, testClock: CLOCK, now: NOW });
    expect(checks.every((check) => check.ok)).toBe(true);
    expect(checks).toHaveLength(7);
    expect(checks.at(-1)!.detail).toBe("2 passed on 2026-11-01T18:00:00Z");
  });

  it("fails while billing is off, on the fake, or in test mode", () => {
    expect(failing({ status: { billing: { on: false, gateway: null, mode: null, reason: "BILLING_GATEWAY is not set" } } })).toEqual([
      { name: "Billing is on through Stripe", ok: false, detail: "off: BILLING_GATEWAY is not set" },
      { name: "The keys are live-mode", ok: false, detail: "no Stripe key in use" },
    ]);
    expect(failing({ status: { billing: { on: true, gateway: "fake", mode: null, reason: null } } }).map((c) => c.name)).toEqual([
      "Billing is on through Stripe",
      "The keys are live-mode",
    ]);
    expect(failing({ status: { billing: { on: true, gateway: "stripe", mode: "test", reason: null } } })).toEqual([
      { name: "The keys are live-mode", ok: false, detail: "test mode" },
    ]);
  });

  it("wants the webhook to refuse an unsigned event, not to be missing or to accept it", () => {
    for (const webhook of [404, 200, 500, null])
      expect(
        failing({ site: { webhook } }).map((check) => check.name),
        String(webhook)
      ).toEqual(["The webhook is reachable and checks its signature"]);
  });

  it("wants the reconciliation recent, complete and with its token", () => {
    const stale = new Date(NOW.getTime() - RECONCILE_STALE_MS - 1).toISOString();
    for (const reconcile of [
      { tokenSet: false, lastRun: READY.reconcile.lastRun },
      { tokenSet: true, lastRun: null },
      { tokenSet: true, lastRun: { at: stale, ok: true } },
      { tokenSet: true, lastRun: { at: "2026-11-02T09:20:00.000Z", ok: false } },
    ])
      expect(failing({ status: { reconcile } }).map((check) => check.name)).toEqual(["The reconciliation is running"]);
  });

  it("wants buying on and every document published and served", () => {
    expect(failing({ status: { buying: "HIDDEN" } })).toEqual([
      { name: "Buying is on", ok: false, detail: "the site's state of billing.buy is HIDDEN" },
    ]);
    expect(failing({ status: { documents: { terms: 1, privacy: null, withdrawal: null } } })[0].detail).toBe(
      "not published: privacy, withdrawal"
    );
    expect(failing({ site: { terms: 404 } }).map((check) => check.name)).toEqual([
      "The terms, privacy policy and withdrawal wording are published",
    ]);
  });

  it("wants a test-clock record for the commit production runs, with every scenario passed", () => {
    const name = "The test-clock scenarios passed on this release (0.30.0, abc1234)";
    expect(failing({ testClock: null })).toEqual([{ name, ok: false, detail: "no record for 0.30.0" }]);
    expect(failing({ testClock: { ...CLOCK, commit: "fff0000" } })[0].detail).toBe("the record is for fff0000, production runs abc1234");
    expect(failing({ testClock: { ...CLOCK, scenarios: [] } })[0].detail).toBe("the record holds no scenarios");
    expect(failing({ testClock: { ...CLOCK, scenarios: [...CLOCK.scenarios, { name: "dispute", passed: false }] } })[0].detail).toBe(
      "failed: dispute"
    );
  });
});
