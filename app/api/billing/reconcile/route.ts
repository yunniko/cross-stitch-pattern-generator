import { NextResponse } from "next/server";
import { reconcileRefusal } from "@/lib/billing/reconcile-access";
import { billingGateway } from "@/lib/billing/gateway";
import { prismaBillingStore } from "@/lib/billing/prisma-store";
import { reconcile } from "@/lib/billing/sync";

/**
 * The reconciliation pass (G-106 M2, Acceptance 4), called by the `billing-reconcile` compose service on the internal
 * network. Refused through nginx and without the shared token (`lib/billing/reconcile-access.ts`).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const refused = reconcileRefusal(req.headers, process.env.BILLING_RECONCILE_TOKEN);
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status });
  const gateway = await billingGateway();
  if (!gateway) return NextResponse.json({ off: true });
  const report = await reconcile(gateway, prismaBillingStore, new Date());
  if (report.failed.length > 0) console.error("[billing] reconciliation could not read:", report.failed);
  return NextResponse.json(report);
}
