import { NextResponse } from "next/server";
import { launchStatus } from "@/lib/billing/launch-status";
import { reconcileRefusal } from "@/lib/billing/reconcile-access";

/**
 * The app's side of the launch check (G-128 M3, D385): billing's mode, the reconciliation's last run, buying's state and
 * the documents in force, for `scripts/launch-check.mjs`. Read-only, and refused through nginx and without the
 * reconciliation's token, as that pass is (`lib/billing/reconcile-access.ts`).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const refused = reconcileRefusal(req.headers, process.env.BILLING_RECONCILE_TOKEN);
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status });
  return NextResponse.json(await launchStatus(process.env));
}
