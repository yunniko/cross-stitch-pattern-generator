import { NextResponse } from "next/server";
import { processorUnreachable, processorUrl } from "@/lib/server/request-guard";

/**
 * The finished pattern, in the project's editable-JSON save format (G-034 M2).
 *
 * The client parses it with `deserializePatternData`, the same function that opens a saved file, so the pattern the
 * server generated and the pattern the editor loads cannot differ.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_ID = /^[0-9a-f-]{36}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!JOB_ID.test(id)) return NextResponse.json({ error: "That is not a job id." }, { status: 400 });
  try {
    const upstream = await fetch(processorUrl(`/jobs/${id}/result`));
    return new NextResponse(upstream.body, { status: upstream.status, headers: { "content-type": "application/json" } });
  } catch {
    return processorUnreachable();
  }
}
