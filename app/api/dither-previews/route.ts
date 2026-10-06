import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generationRefusal, workspaceRefusal } from "@/lib/features/request-check";
import { featureStatesFor } from "@/lib/features/server";
import { guardMutation, processorUnreachable, processorUrl } from "@/lib/server/request-guard";

/**
 * A dither pattern's preview, drawn by the Rust that makes charts (G-100, D327): asked for by a pattern with settings of its
 * own when they change. Forwarded to the processor, which validates it; this handler keeps the endpoint from being abused
 * and refuses a pattern the requester cannot use, as a generation asking for it would be refused.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 16 * 1024;

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req, "ditherPreview");
  if (refused) return refused;

  const body = await req.text();
  if (body.length > MAX_BYTES) {
    return NextResponse.json({ error: "That request is too large." }, { status: 413 });
  }

  const states = await featureStatesFor((await auth())?.user?.id ?? null);
  const refusal = workspaceRefusal("/api/dither-previews", states);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "That request body is not valid JSON." }, { status: 400 });
  }
  // The pattern and its settings are features by name, checked as a generation's are.
  const locked = parsed && typeof parsed === "object" ? generationRefusal(parsed as Record<string, unknown>, states) : null;
  if (locked) return NextResponse.json({ error: locked }, { status: 403 });

  try {
    const upstream = await fetch(processorUrl("/dither-previews"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const headers: Record<string, string> = {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    };
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) headers["retry-after"] = retryAfter;
    return new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers });
  } catch {
    return processorUnreachable();
  }
}
