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
    // A generation's result is JSON, an export's is a file: the upstream type and filename are passed through rather
    // than assumed, or an export downloads as "sample.dat" served as application/json (G-034 M4).
    const headers: Record<string, string> = { "content-type": upstream.headers.get("content-type") ?? "application/json" };
    const disposition = upstream.headers.get("content-disposition");
    if (disposition) headers["content-disposition"] = disposition;
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch {
    return processorUnreachable();
  }
}
