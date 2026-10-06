import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { workspaceRefusal } from "@/lib/features/request-check";
import { featureStatesFor } from "@/lib/features/server";
import { guardMutation, processorUnreachable, processorUrl } from "@/lib/server/request-guard";

/**
 * The colour count and colours a picture reasonably needs, and how well a set covers it (G-087). Forwarded to the processor, which
 * validates it; this handler's job is to keep the endpoint from being abused. A prediction is a short computation, so it is not
 * counted as a generation.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 64 * 1024;

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req, "prediction");
  if (refused) return refused;

  // Photo's work (G-103, D314): refused by the workspace's name when Photo is off for this person.
  const refusal = workspaceRefusal("/api/predictions", await featureStatesFor((await auth())?.user?.id ?? null));
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  const body = await req.text();
  if (body.length > MAX_BYTES) {
    return NextResponse.json({ error: "That request is too large." }, { status: 413 });
  }

  try {
    const upstream = await fetch(processorUrl("/predictions"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const headers: Record<string, string> = { "content-type": "application/json" };
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) headers["retry-after"] = retryAfter;
    return new NextResponse(await upstream.text(), { status: upstream.status, headers });
  } catch {
    return processorUnreachable();
  }
}
