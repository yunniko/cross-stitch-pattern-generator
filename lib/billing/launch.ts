/**
 * The launch check's verdicts (G-128 M3, D385): what must hold, against production, before real money is taken. Pure and
 * import-free, so `scripts/launch-check.mjs` reads it as Node runs TypeScript, and the unit tests ask the same questions.
 *
 * The facts come from three places: the app's own status (`/api/billing/launch-status`, internal only), the public
 * site's answers, and the test-clock record kept in the repository for the release.
 */

/** What `/api/billing/launch-status` reports. Never a key: only which mode a key is in. */
export interface LaunchStatus {
  version: string;
  commit: string;
  billing: { on: boolean; gateway: string | null; mode: "live" | "test" | null; reason: string | null };
  reconcile: { tokenSet: boolean; lastRun: { at: string; ok: boolean } | null };
  /** The site's state of the buying feature, "ON", "LOCKED" or "HIDDEN". */
  buying: string;
  /** The version in force of each document, or null while none is published. */
  documents: { terms: number | null; privacy: number | null; withdrawal: number | null };
}

/** HTTP statuses from the public site; null when it could not be reached. */
export interface PublicAnswers {
  /** An unsigned POST to the webhook: 400 means reachable, billing on and the signature checked. */
  webhook: number | null;
  terms: number | null;
  privacy: number | null;
}

/** `docs/test-clock/v<version>.json`, written by the test-clock run for a release (G-106 M4, G-126 M3). */
export interface TestClockRecord {
  version: string;
  commit: string;
  ranAt: string;
  scenarios: { name: string; passed: boolean }[];
}

export interface LaunchCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** The pass runs hourly; two hours without one means the service is not running. */
export const RECONCILE_STALE_MS = 2 * 3_600_000;

export function launchChecks(facts: {
  status: LaunchStatus;
  site: PublicAnswers;
  testClock: TestClockRecord | null;
  now: Date;
}): LaunchCheck[] {
  const { status, site, testClock, now } = facts;
  const { billing, reconcile, documents } = status;
  const lastRun = reconcile.lastRun;
  const age = lastRun ? now.getTime() - new Date(lastRun.at).getTime() : null;
  const missing = (["terms", "privacy", "withdrawal"] as const).filter((kind) => documents[kind] === null);
  const failed = testClock?.scenarios.filter((scenario) => !scenario.passed) ?? [];

  return [
    {
      name: "Billing is on through Stripe",
      ok: billing.on && billing.gateway === "stripe",
      detail: billing.on ? `gateway: ${billing.gateway}` : `off: ${billing.reason ?? "no reason given"}`,
    },
    {
      name: "The keys are live-mode",
      ok: billing.on && billing.gateway === "stripe" && billing.mode === "live",
      detail: billing.mode ? `${billing.mode} mode` : "no Stripe key in use",
    },
    {
      name: "The webhook is reachable and checks its signature",
      ok: site.webhook === 400,
      detail: site.webhook === null ? "not reached" : `an unsigned event was answered ${site.webhook}; 400 expected`,
    },
    {
      name: "The reconciliation is running",
      ok: reconcile.tokenSet && lastRun !== null && lastRun.ok && age !== null && age <= RECONCILE_STALE_MS,
      detail: !reconcile.tokenSet
        ? "BILLING_RECONCILE_TOKEN is not set"
        : lastRun === null
          ? "it has never run"
          : `last ran ${lastRun.at}${lastRun.ok ? "" : ", and could not read every subscription"}`,
    },
    {
      name: "Buying is on",
      ok: status.buying === "ON",
      detail: `the site's state of billing.buy is ${status.buying}`,
    },
    {
      name: "The terms, privacy policy and withdrawal wording are published",
      ok: missing.length === 0 && site.terms === 200 && site.privacy === 200,
      detail:
        missing.length > 0
          ? `not published: ${missing.join(", ")}`
          : `versions ${documents.terms}, ${documents.privacy} and ${documents.withdrawal}; /terms ${site.terms ?? "not reached"}, /privacy ${site.privacy ?? "not reached"}`,
    },
    {
      name: `The test-clock scenarios passed on this release (${status.version}, ${status.commit})`,
      ok: testClock !== null && testClock.commit === status.commit && testClock.scenarios.length > 0 && failed.length === 0,
      detail:
        testClock === null
          ? `no record for ${status.version}`
          : testClock.commit !== status.commit
            ? `the record is for ${testClock.commit}, production runs ${status.commit}`
            : testClock.scenarios.length === 0
              ? "the record holds no scenarios"
              : failed.length > 0
                ? `failed: ${failed.map((scenario) => scenario.name).join(", ")}`
                : `${testClock.scenarios.length} passed on ${testClock.ranAt}`,
    },
  ];
}
