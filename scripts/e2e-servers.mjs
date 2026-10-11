// Starts the processor and the app the way the browser suite expects them (G-090 M4), so a development loop is
// "start once, run specs many times": Playwright's `reuseExistingServer` adopts whatever listens on these ports.
//
//   node scripts/e2e-servers.mjs            build the app and the processor, then start both
//   node scripts/e2e-servers.mjs --no-build start what is already built
//   node scripts/e2e-servers.mjs --dev      the development server instead of a build (see docs/development-loop.md for when)
//
// The environment is the one `scripts/playwright-servers.ts` gives its own servers; a server started any other way must carry
// the same (HANDOVER, Rules in force). The suite's Postgres must already listen on 54324. Stop with Ctrl+C.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const PORT = 30200;
const PROCESSOR_PORT = 8102;
const build = !process.argv.includes("--no-build");
// The development server in place of a production build: no build to wait for, each page compiled when first asked for.
const dev = process.argv.includes("--dev");

// The engine is the Rust sidecar; a build tree's binary is used when the caller names none.
const builtJob = path.join(root, "rust", "target", "release", process.platform === "win32" ? "cs-job.exe" : "cs-job");

const env = {
  ...(existsSync(builtJob) ? { CS_JOB_BINARY: builtJob } : {}),
  ...process.env,
  PROCESSOR_URL: `http://127.0.0.1:${PROCESSOR_PORT}`,
  RATE_LIMIT_JOBS_PER_MINUTE: "1000",
  RATE_LIMIT_AUTH_PER_15MIN: "1000",
  RATE_LIMIT_AUTH_ACCOUNT_PER_15MIN: "1000",
  RATE_LIMIT_DITHER_PREVIEWS_PER_MINUTE: "1000",
  RATE_LIMIT_MAIL_PER_HOUR: "1000",
  RATE_LIMIT_CHART_SAVES_PER_MINUTE: "1000",
  // Every request re-reads the account, so a reset ends other sessions at once in the test that checks it (D345).
  ACCOUNT_RECHECK_SECONDS: "0",
  MAIL_TRANSPORT: "file",
  MAIL_FROM: "Cross-Stitch Pattern Generator <no-reply@example.com>",
  MAIL_OUTBOX_DIR: path.join(root, "e2e-mail-outbox"),
  APP_URL: `http://localhost:${PORT}`,
  DATABASE_URL: "postgresql://cross_stitch:cross_stitch@127.0.0.1:54324/cross_stitch",
  AUTH_SECRET: "e2e-suite-only-not-a-real-secret-00000000",
  AUTH_TRUST_HOST: "true",
  ADMIN_EMAIL: "e2e-admin@example.com",
  ADMIN_BOOTSTRAP_ENABLED: "true",
  ADMIN_USERS_PAGE_SIZE: "3",
  // Short, so a spec can see an admin's change reach an open editor (G-102).
  FEATURES_REFRESH_SECONDS: "5",
  // Billing through the fake provider (G-106 M3, D373), as scripts/playwright-servers.ts sets it.
  BILLING_GATEWAY: "fake",
  // The build has to carry the fake for it to run: a production build does not (D408).
  BILLING_FAKE_BUILD: "1",
  BILLING_RECONCILE_TOKEN: "e2e-suite-reconcile-token-not-a-secret-000",
};

function run(command) {
  const result = spawnSync(command, { cwd: root, env, stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (build) {
  run("npm run build:processor");
  if (!dev) run("npm run build");
}

const children = [
  spawn("node dist/processor/server.mjs", {
    cwd: root,
    env: { ...env, PROCESSOR_PORT: String(PROCESSOR_PORT) },
    stdio: "inherit",
    shell: true,
  }),
  spawn(`npm run ${dev ? "dev" : "start"} -- -p ${PORT} -H 127.0.0.1`, { cwd: root, env, stdio: "inherit", shell: true }),
];
console.log(`e2e servers: app http://localhost:${PORT}, processor http://127.0.0.1:${PROCESSOR_PORT}`);

function stop() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", (code) => code && process.exit(code));
