import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { guardMutation, processorUnreachable, processorUrl } from "@/lib/server/request-guard";
import { quotaForRoute } from "@/lib/limits/quota-server";
import { LIMITS } from "@/processor/job-protocol";
import { exportRefusal, workspaceRefusal } from "@/lib/features/request-check";
import { featureStatesFor } from "@/lib/features/server";
import { parseBody } from "@/lib/server/parse-body";
import { systemLabelsFor, withThreadSystems } from "@/lib/thread-systems/server";

/**
 * Starts an export on the processor (G-034 M4).
 *
 * Unlike a generation, the request carries the user's whole edited chart — about 3 MB of cell data at 1000 stitches —
 * so it has its own, much larger cap than the settings endpoints. Exports run on the same worker pool as generations,
 * so a full queue answers 503 here exactly as it does there, and the job is then followed through the existing
 * `/api/jobs/:id` routes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req);
  if (refused) return refused;

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > LIMITS.exportRequestBytes) {
    return NextResponse.json(
      { error: `That pattern is larger than ${Math.round(LIMITS.exportRequestBytes / 1024 / 1024)} MB.` },
      { status: 413 }
    );
  }

  const body = await req.text();
  if (body.length > LIMITS.exportRequestBytes) {
    return NextResponse.json({ error: "That pattern is too large to export." }, { status: 413 });
  }

  // Under the feature switches (G-102): a kind or a texture this person cannot use is refused by name, before the
  // processor sees it.
  const userId = (await auth())?.user?.id ?? null;
  // The workspace first (G-103, D314): with Export off no kind is served.
  const states = await featureStatesFor(userId);
  const parsed = parseBody(body);
  const refusal = workspaceRefusal("/api/exports", states) ?? exportRefusal(parsed, states);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  // The names the systems are printed by, from the table (G-132, D400).
  const forwarded = await withThreadSystems(body, async () => ({ systemLabels: await systemLabelsFor(userId) }));

  // The counted limits (G-109, D364): checked and counted before the processor is asked, given back if it refuses.
  const quota = await quotaForRoute("EXPORT", userId, typeof parsed.kind === "string" ? parsed.kind : null);
  if ("response" in quota) return quota.response;

  try {
    const upstream = await fetch(processorUrl("/exports"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: forwarded,
    });
    // The processor accepts only kinds it knows, so an accepted request names one (G-107 M2).
    quota.ticket.settle(upstream.ok);
    const headers: Record<string, string> = { "content-type": "application/json" };
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) headers["retry-after"] = retryAfter;
    // A refusal (a request it cannot read, a full queue) is the caller's to act on, so the status passes through.
    return new NextResponse(await upstream.text(), { status: upstream.status, headers });
  } catch {
    quota.ticket.settle(false);
    return processorUnreachable();
  }
}
