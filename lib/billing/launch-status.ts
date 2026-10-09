import { prisma } from "@/lib/prisma";
import { APP_COMMIT, APP_VERSION } from "@/lib/app-version";
import { currentLegalVersions } from "@/lib/legal/server";
import { MIN_TOKEN_LENGTH } from "./reconcile-access";
import { BUYING_FEATURE } from "./purchase";
import { billingSettings } from "./settings";
import type { LaunchStatus } from "./launch";

/** The app's side of the launch check (G-128 M3, D385), read from the environment and the database. Never a key. */
export async function launchStatus(env: Record<string, string | undefined>): Promise<LaunchStatus> {
  const settings = billingSettings(env);
  const [run, buying, documents] = await Promise.all([
    prisma.billingRun.findUnique({ where: { kind: "reconcile" }, select: { at: true, ok: true } }),
    prisma.featureState.findUnique({ where: { featureId: BUYING_FEATURE }, select: { state: true } }),
    currentLegalVersions(),
  ]);
  return {
    version: APP_VERSION,
    commit: APP_COMMIT,
    billing: settings.on
      ? {
          on: true,
          gateway: settings.gateway,
          mode: settings.gateway === "stripe" ? (/^(sk|rk)_live_/.test(settings.secretKey) ? "live" : "test") : null,
          reason: null,
        }
      : { on: false, gateway: null, mode: null, reason: settings.reason },
    reconcile: {
      tokenSet: (env.BILLING_RECONCILE_TOKEN ?? "").length >= MIN_TOKEN_LENGTH,
      lastRun: run ? { at: run.at.toISOString(), ok: run.ok } : null,
    },
    // A feature with no site row is on (`lib/features/features.ts`); buying's row is seeded HIDDEN (D372).
    buying: buying?.state ?? "ON",
    documents: {
      terms: documents.terms?.version ?? null,
      privacy: documents.privacy?.version ?? null,
      withdrawal: documents.withdrawal?.version ?? null,
    },
  };
}

/** Records a reconciliation pass, for the check that it is running. */
export async function recordReconcileRun(at: Date, ok: boolean): Promise<void> {
  await prisma.billingRun.upsert({ where: { kind: "reconcile" }, create: { kind: "reconcile", at, ok }, update: { at, ok } });
}
