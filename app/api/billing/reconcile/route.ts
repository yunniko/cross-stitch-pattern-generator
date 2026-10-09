import { NextResponse } from "next/server";
import { reconcileRefusal } from "@/lib/billing/reconcile-access";
import { billingGateway } from "@/lib/billing/gateway";
import { deliverQueuedNotices } from "@/lib/billing/notice-delivery";
import { prismaBillingStore, pruneUnlinkedConsents } from "@/lib/billing/prisma-store";
import { reconcile } from "@/lib/billing/sync";
import { billingPolicy } from "@/lib/settings/server";

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
  const now = new Date();
  const report = await reconcile(gateway, prismaBillingStore, now, await billingPolicy());
  if (report.failed.length > 0) console.error("[billing] reconciliation could not read:", report.failed);
  // Also sends what an earlier delivery could not: the queue is retried hourly, as this pass runs (D377).
  const notices = await deliverQueuedNotices(now);
  // A consent whose Checkout was never completed is personal data with no purpose left (D384).
  const prunedConsents = await pruneUnlinkedConsents(now);
  return NextResponse.json({ ...report, notices, prunedConsents });
}
