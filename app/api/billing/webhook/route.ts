import { NextResponse } from "next/server";
import { billingGateway } from "@/lib/billing/gateway";
import { deliverQueuedNotices } from "@/lib/billing/notice-delivery";
import { prismaBillingStore } from "@/lib/billing/prisma-store";
import { handleWebhook } from "@/lib/billing/sync";
import { billingPolicy } from "@/lib/settings/server";

/**
 * The provider's webhook (G-106 M2, Architecture fit (2)). Outside `guardMutation`: the provider sends no Origin, so its
 * guard is the signature over the raw body and the table of events already handled (`lib/billing/sync.ts`). 404 while
 * billing is off; 400 for a refused signature; 500 when the change could not be written, so the provider retries.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Larger than any event the provider sends; a body past it is not one. */
const MAX_BODY_BYTES = 1_000_000;

export async function POST(req: Request): Promise<Response> {
  const gateway = await billingGateway();
  if (!gateway) return NextResponse.json({ error: "billing is off" }, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "body too large" }, { status: 413 });
  }
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return NextResponse.json({ error: "body too large" }, { status: 413 });
  try {
    const now = new Date();
    const answer = await handleWebhook(
      gateway,
      prismaBillingStore,
      rawBody,
      req.headers.get("stripe-signature"),
      now,
      await billingPolicy()
    );
    if (answer.status === 400) return NextResponse.json({ error: answer.error }, { status: 400 });
    await deliverQueuedNotices(now);
    return NextResponse.json({ received: true, outcome: answer.outcome.kind });
  } catch (error) {
    console.error("[billing] webhook event not written:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "not written; retry" }, { status: 500 });
  }
}
