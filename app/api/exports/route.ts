import { NextResponse } from "next/server";
import { guardMutation, processorUnreachable, processorUrl } from "@/lib/server/request-guard";
import { LIMITS } from "@/processor/job-protocol";

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

  try {
    const upstream = await fetch(processorUrl("/exports"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const headers: Record<string, string> = { "content-type": "application/json" };
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) headers["retry-after"] = retryAfter;
    // 422 (a chart too large for one image) and 503 (a full queue) are the caller's to act on, so both pass through.
    return new NextResponse(await upstream.text(), { status: upstream.status, headers });
  } catch {
    return processorUnreachable();
  }
}
