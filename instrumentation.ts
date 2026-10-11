/**
 * Runs once when the web server starts (Next's instrumentation hook): the environment is checked here, so a server that
 * could not work refuses to start, naming what is wrong, instead of failing at its first request (G-134 M3, `lib/env.ts`).
 * Not during `next build`, which runs without the server's environment.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { exitUnlessServerEnv } = await import("./lib/env");
  exitUnlessServerEnv();
}
