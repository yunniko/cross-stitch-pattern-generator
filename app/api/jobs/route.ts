import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { guardMutation, processorUnreachable, processorUrl } from "@/lib/server/request-guard";
import { recordUsage } from "@/lib/admin/usage";
import { generationRefusal, workspaceRefusal } from "@/lib/features/request-check";
import { featureStatesFor } from "@/lib/features/server";
import { parseBody } from "@/lib/server/parse-body";

/**
 * Starts a generation (G-034 M2). The settings are forwarded as they arrive and validated by the processor, which is
 * the one place that knows the pipeline's limits; this handler's job is to keep the endpoint from being abused.
 *
 * A 503 from the processor means its queue is full and carries `Retry-After`, which is passed through unchanged so the
 * client can say how long the wait is rather than just failing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Larger than any legitimate settings object; the body is text, not pixels. */
const MAX_SETTINGS_BYTES = 64 * 1024;

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req);
  if (refused) return refused;

  const body = await req.text();
  if (body.length > MAX_SETTINGS_BYTES) {
    return NextResponse.json({ error: "That request is too large." }, { status: 413 });
  }

  // Under the feature switches (G-102): a request asking for a feature this person cannot use is refused by name, before
  // the processor sees it. The body is read as JSON only for this; the processor still gets the text as sent.
  const userId = (await auth())?.user?.id ?? null;
  // The workspace first (G-103, D314): with Photo off nothing of it is served, whatever the settings ask.
  const states = await featureStatesFor(userId);
  const refusal = workspaceRefusal("/api/jobs", states) ?? generationRefusal(parseBody(body), states);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  try {
    const upstream = await fetch(processorUrl("/jobs"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    if (upstream.ok) recordUsage("GENERATE", userId);
    const headers: Record<string, string> = { "content-type": "application/json" };
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) headers["retry-after"] = retryAfter;
    return new NextResponse(await upstream.text(), { status: upstream.status, headers });
  } catch {
    return processorUnreachable();
  }
}
