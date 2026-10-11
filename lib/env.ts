/**
 * The environment the web server needs, checked once when it starts (`instrumentation.ts`, G-134 M3) rather than at the
 * first request that happens to read a variable. A production server with a missing database URL, auth secret or
 * processor address refuses to start and names every problem at once; outside production the processor address falls
 * back to the local one, as `npm run dev` expects.
 *
 * Pure over the `env` it is given, so it is unit-tested without touching `process.env`.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** Where the processor listens when `PROCESSOR_URL` is not set, outside production only. */
export const LOCAL_PROCESSOR_URL = "http://127.0.0.1:8081";

export interface ServerEnv {
  databaseUrl: string;
  processorUrl: string;
  /** An origin trusted besides the request's own, or null (see `request-guard.ts`). */
  appUrl: string | null;
}

function isUrl(value: string, protocols: readonly string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** The checked environment, or every problem with it. */
export function readServerEnv(env: Env): { env: ServerEnv } | { problems: string[] } {
  const production = env.NODE_ENV === "production";
  const problems: string[] = [];

  const databaseUrl = env.DATABASE_URL ?? "";
  if (!isUrl(databaseUrl, ["postgresql:", "postgres:"])) problems.push("DATABASE_URL must be a postgresql:// URL.");

  if (production && !env.AUTH_SECRET) problems.push("AUTH_SECRET must be set: sessions are signed with it.");

  const processorUrl = env.PROCESSOR_URL || (production ? "" : LOCAL_PROCESSOR_URL);
  if (!isUrl(processorUrl, ["http:", "https:"])) {
    problems.push(production ? "PROCESSOR_URL must be set to the processor's http:// address." : "PROCESSOR_URL must be an http:// URL.");
  }

  const appUrl = env.APP_URL || null;
  if (appUrl !== null && !isUrl(appUrl, ["http:", "https:"])) problems.push("APP_URL, when set, must be an http(s):// origin.");

  return problems.length ? { problems } : { env: { databaseUrl, processorUrl, appUrl } };
}

/** For the server's start: the checked environment, or an error naming every problem. */
export function assertServerEnv(env: Env = process.env): ServerEnv {
  const read = readServerEnv(env);
  if ("problems" in read) throw new Error(`The server's environment is not usable:\n- ${read.problems.join("\n- ")}`);
  return read.env;
}

/**
 * For `instrumentation.ts`: a server whose environment is not usable says why and exits. Throwing is not enough — Next
 * logs a failed instrumentation hook and keeps the process alive, serving nothing, which a container's restart policy and
 * the deploy's health check would not notice as a failed start.
 */
export function exitUnlessServerEnv(): void {
  try {
    assertServerEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/** The processor's base address: `PROCESSOR_URL`, or the local one outside production. Checked at start. */
export function processorBaseUrl(env: Env = process.env): string {
  return env.PROCESSOR_URL || (env.NODE_ENV === "production" ? "" : LOCAL_PROCESSOR_URL);
}
