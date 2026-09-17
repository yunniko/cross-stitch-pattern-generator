import { NextResponse } from "next/server";
import { guardMutation, processorUnreachable, processorUrl } from "@/lib/server/request-guard";
import { LIMITS } from "@/processor/job-protocol";

/**
 * Uploads a photo to the processor, which decodes it and keeps it in memory keyed by content hash (G-034 M2).
 *
 * The body is streamed straight through rather than buffered here, so an oversized upload is refused while it is still
 * arriving: once by its declared length, and again by the processor as the bytes pass the cap.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req);
  if (refused) return refused;

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > LIMITS.uploadBytes) {
    return NextResponse.json({ error: `That image is larger than ${Math.round(LIMITS.uploadBytes / 1024 / 1024)} MB.` }, { status: 413 });
  }
  if (!req.body) return NextResponse.json({ error: "Expected image bytes." }, { status: 400 });

  try {
    const upstream = await fetch(processorUrl("/photos"), {
      method: "POST",
      body: req.body,
      // Required by Node whenever a request body is a stream.
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    return new NextResponse(upstream.body, { status: upstream.status, headers: { "content-type": "application/json" } });
  } catch {
    return processorUnreachable();
  }
}
