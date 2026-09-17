import { NextResponse } from "next/server";
import { guardMutation, processorUnreachable, processorUrl } from "@/lib/server/request-guard";

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

  try {
    const upstream = await fetch(processorUrl("/jobs"), {
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
