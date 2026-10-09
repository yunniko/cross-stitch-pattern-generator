import { spawnSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { E2E_RECONCILE_TOKEN } from "../../scripts/playwright-servers";

/**
 * G-128 M3 (D385): the launch check run against the suite's server, which bills through the fake: the status is refused
 * without the token or through nginx, the reconciliation's run is recorded, and the script names what is not ready
 * (not Stripe, not live, no test-clock record) and exits 1. @alone: the reconciliation re-reads every open subscription.
 */

const root = path.join(__dirname, "..", "..");

test("the launch check reads production's side and names what is not ready @alone", async ({ request, baseURL }) => {
  const status = "/api/billing/launch-status";
  expect((await request.get(status)).status()).toBe(403);
  const auth = { authorization: `Bearer ${E2E_RECONCILE_TOKEN}` };
  expect((await request.get(status, { headers: { ...auth, "x-real-ip": "203.0.113.9" } })).status()).toBe(403);

  // A reconciliation pass is recorded, and the status reports it.
  expect((await request.post("/api/billing/reconcile", { headers: auth })).status()).toBe(200);
  const read = await (await request.get(status, { headers: auth })).json();
  expect(read.billing).toEqual({ on: true, gateway: "fake", mode: null, reason: null });
  expect(read.reconcile.tokenSet).toBe(true);
  expect(Date.now() - new Date(read.reconcile.lastRun.at).getTime()).toBeLessThan(60_000);
  expect(JSON.stringify(read)).not.toContain(E2E_RECONCILE_TOKEN);

  const run = spawnSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/launch-check.mjs", "--site", baseURL!, "--status", baseURL!, "--json"],
    { cwd: root, encoding: "utf8", env: { ...process.env, BILLING_RECONCILE_TOKEN: E2E_RECONCILE_TOKEN } }
  );
  expect(run.status, run.stderr).toBe(1);
  const report = JSON.parse(run.stdout) as { checks: { name: string; ok: boolean; detail: string }[] };
  const verdict = (start: string) => report.checks.find((check) => check.name.startsWith(start));
  expect(verdict("Billing is on through Stripe")).toMatchObject({ ok: false, detail: "gateway: fake" });
  expect(verdict("The keys are live-mode")).toMatchObject({ ok: false });
  expect(verdict("The webhook is reachable")).toMatchObject({ ok: true });
  expect(verdict("The reconciliation is running")).toMatchObject({ ok: true });
  expect(verdict("The test-clock scenarios passed")).toMatchObject({ ok: false, detail: `no record for ${read.version}` });

  // Without the token the script stops before judging anything.
  const refused = spawnSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/launch-check.mjs", "--site", baseURL!, "--status", baseURL!],
    { cwd: root, encoding: "utf8", env: { ...process.env, BILLING_RECONCILE_TOKEN: "" } }
  );
  expect(refused.status).toBe(2);
  expect(refused.stderr).toContain("could not be read");
});
