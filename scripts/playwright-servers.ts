import path from "node:path";

/**
 * The server pair every Playwright config that starts the app must start (G-046 M2): the processor, then the app told
 * where it is. Generation and every export but the editable save run on the processor since G-034, so an app started
 * without it -- or without `PROCESSOR_URL` -- fails every Generate press, and a config that copied the app half alone
 * broke silently that way. One definition, so no config can drift from the others again.
 *
 * `reuseExistingServer` adopts whatever already listens on a port, configured or not. A server started by hand must
 * therefore carry this same environment (HANDOVER, Rules in force).
 */

export interface ServerPairOptions {
  /** The app's port. */
  port: number;
  /** The processor's port; the e2e suite uses 8102, and a bench on its own app port takes its own processor port. */
  processorPort: number;
  /** Reuse servers already listening. The e2e suite passes `!process.env.CI`; the benches always reuse. */
  reuseExistingServer: boolean;
  /** The app's startup allowance; `next build` dominates it. */
  appTimeoutMs?: number;
}

/** One `webServer` entry; declared, so the two entries' different `env` keys do not widen into a union Playwright rejects. */
interface WebServerEntry {
  command: string;
  cwd: string;
  env: Record<string, string>;
  url: string;
  reuseExistingServer: boolean;
  timeout: number;
}

export function appWithProcessor({
  port,
  processorPort,
  reuseExistingServer,
  appTimeoutMs = 300_000,
}: ServerPairOptions): WebServerEntry[] {
  const root = path.join(__dirname, "..");
  return [
    {
      // `build:processor` also copies the export font and texture next to the bundle (D153), so this is self-contained.
      command: "npm run build:processor && node dist/processor/server.mjs",
      cwd: root,
      // The Rust sidecar is off unless the environment names a binary (G-048 M6): a checkout without a Rust build
      // runs the TypeScript, and `CS_JOB_BINARY=<path> npm run test:e2e` runs the same suite against Rust.
      env: {
        PROCESSOR_PORT: String(processorPort),
        ...(process.env.CS_JOB_BINARY ? { CS_JOB_BINARY: process.env.CS_JOB_BINARY } : {}),
      },
      url: `http://127.0.0.1:${processorPort}/health`,
      reuseExistingServer,
      timeout: 180_000,
    },
    {
      // A production build, not `next dev`: Next 16 allows one dev server per directory (D102).
      // Postgres (G-075) comes up first (the compose file's un-profiled `db` service, `--wait` for its
      // healthcheck), then the schema, then the build -- `prisma generate` has to run before `next build`
      // typechecks pages that import the generated client, same as the Dockerfile's `build` stage.
      command: `docker compose up -d db --wait && npx prisma generate && npx prisma migrate deploy && npm run build && npm run start -- -p ${port} -H 127.0.0.1`,
      cwd: root,
      env: {
        PROCESSOR_URL: `http://127.0.0.1:${processorPort}`,
        // Suites and benches generate and export far more often than a person; the real limits are covered in
        // tests/unit/request-guard.spec.ts rather than by being refused here. Same reasoning for auth attempts.
        RATE_LIMIT_JOBS_PER_MINUTE: "1000",
        RATE_LIMIT_AUTH_PER_15MIN: "1000",
        // The e2e suite's own Postgres (docker-compose.yml's `db` service; port per that file's own note).
        // Not a secret worth generating fresh -- nothing this database holds needs to survive a suite run.
        DATABASE_URL: "postgresql://cross_stitch:cross_stitch@127.0.0.1:54324/cross_stitch",
        AUTH_SECRET: "e2e-suite-only-not-a-real-secret-00000000",
        AUTH_TRUST_HOST: "true",
        ADMIN_EMAIL: "e2e-admin@example.com",
        ADMIN_BOOTSTRAP_ENABLED: "true",
        // Small on purpose (G-075 M3): lets a pagination test exercise page 2 without seeding dozens of accounts.
        ADMIN_USERS_PAGE_SIZE: "3",
      },
      url: `http://localhost:${port}`,
      reuseExistingServer,
      timeout: appTimeoutMs,
    },
  ];
}
