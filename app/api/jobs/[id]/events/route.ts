import { NextResponse } from "next/server";
import { processorUnreachable, processorUrl } from "@/lib/server/request-guard";

/**
 * Progress for one job, as server-sent events (G-034 M2).
 *
 * The processor's stream is passed through untouched. `x-accel-buffering: no` matters in production: without it nginx
 * buffers the response and the client sees no progress until the job has already finished.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_ID = /^[0-9a-f-]{36}$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!JOB_ID.test(id)) return NextResponse.json({ error: "That is not a job id." }, { status: 400 });

  try {
    // Passing the client's abort signal through means closing the page also closes the upstream stream.
    const upstream = await fetch(processorUrl(`/jobs/${id}/events`), { signal: req.signal });
    if (!upstream.ok || !upstream.body) {
      return new NextResponse(await upstream.text(), { status: upstream.status, headers: { "content-type": "application/json" } });
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  } catch {
    return processorUnreachable();
  }
}
