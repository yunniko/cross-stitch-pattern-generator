import { NextResponse } from "next/server";
import { originRejected, processorUnreachable, processorUrl } from "@/lib/server/request-guard";

/**
 * One job: its current state, or a request to stop it (G-034 M2).
 *
 * Reading a job is not Origin-checked — the id is an unguessable UUID and the response carries no pattern data.
 * Cancelling is, since it changes something; it is not rate-limited, because stopping work must never be the request
 * that gets refused.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_ID = /^[0-9a-f-]{36}$/;

function badId(): NextResponse {
  return NextResponse.json({ error: "That is not a job id." }, { status: 400 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!JOB_ID.test(id)) return badId();
  try {
    const upstream = await fetch(processorUrl(`/jobs/${id}`));
    return new NextResponse(await upstream.text(), { status: upstream.status, headers: { "content-type": "application/json" } });
  } catch {
    return processorUnreachable();
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refused = originRejected(req);
  if (refused) return refused;
  const { id } = await params;
  if (!JOB_ID.test(id)) return badId();
  try {
    const upstream = await fetch(processorUrl(`/jobs/${id}`), { method: "DELETE" });
    return new NextResponse(await upstream.text(), { status: upstream.status, headers: { "content-type": "application/json" } });
  } catch {
    return processorUnreachable();
  }
}
