// The launch check (G-128 M3, D385): read-only, it asks production whether everything that must hold before real money
// is taken does. Run at launch, with the Owner; it changes nothing anywhere. The verdicts are lib/billing/launch.ts.
//
// Run with --disable-warning=MODULE_TYPELESS_PACKAGE_JSON: Node reads the rule's TypeScript as it is, and says so.
//
//   BILLING_RECONCILE_TOKEN=... npm run launch:check -- --site https://<the site> --status http://127.0.0.1:<app port>
//
// --site    the public address: the webhook is sent one unsigned event (refused unread, 400 expected), and /terms,
//           /privacy and /withdrawal are fetched.
// --status  the app reached without nginx (on the host, the port compose binds to 127.0.0.1, or through an SSH tunnel to
//           it): `/api/billing/launch-status` is refused through nginx and without the reconciliation's token.
// --json    print the checks as JSON instead of lines.
//
// The test-clock record is read from docs/test-clock/v<version>.json for the version production reports.
// Exit 0 when every check holds, 1 when any fails, 2 when the app's status could not be read.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { launchChecks } from "../lib/billing/launch.ts";

const root = path.join(import.meta.dirname, "..");

function arg(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
}

const site = arg("site")?.replace(/\/+$/, "");
const statusBase = arg("status")?.replace(/\/+$/, "");
const token = process.env.BILLING_RECONCILE_TOKEN ?? "";
if (!site || !statusBase) {
  console.error("launch-check: --site and --status are both needed (see the head of scripts/launch-check.mjs).");
  process.exit(2);
}

async function answer(url, init) {
  try {
    const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    return response.status;
  } catch {
    return null;
  }
}

let status;
try {
  const response = await fetch(`${statusBase}/api/billing/launch-status`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`answered ${response.status}: ${await response.text()}`);
  status = await response.json();
} catch (error) {
  console.error(`launch-check: the app's status could not be read: ${error instanceof Error ? error.message : error}`);
  process.exit(2);
}

const [webhook, terms, privacy, withdrawal] = await Promise.all([
  answer(`${site}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
  answer(`${site}/terms`),
  answer(`${site}/privacy`),
  answer(`${site}/withdrawal`),
]);

const recordPath = path.join(root, "docs", "test-clock", `v${status.version}.json`);
const testClock = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, "utf8")) : null;

const checks = launchChecks({ status, site: { webhook, terms, privacy, withdrawal }, testClock, now: new Date() });
if (process.argv.includes("--json")) console.log(JSON.stringify({ version: status.version, commit: status.commit, checks }, null, 2));
else {
  console.log(`launch check: ${site}, version ${status.version} (${status.commit})`);
  for (const check of checks) console.log(`${check.ok ? "ok  " : "FAIL"}  ${check.name}: ${check.detail}`);
}
process.exit(checks.every((check) => check.ok) ? 0 : 1);
