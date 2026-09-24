import { NextResponse } from "next/server";
import { guardMutation, processorUnreachable, processorUrl } from "@/lib/server/request-guard";
import { ENHANCEMENT_MODE_IDS } from "@/lib/pipeline/enhance";

/**
 * The enhanced preview of an already-uploaded photo (G-034 M3).
 *
 * Rate-limited as a preview rather than as a generation: switching between modes is a normal thing to do several times
 * in a row, and it costs the server far less than a pattern does.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTO_HASH = /^[0-9a-f]{64}$/;

export async function POST(req: Request, { params }: { params: Promise<{ hash: string }> }): Promise<Response> {
  const refused = guardMutation(req, "preview");
  if (refused) return refused;

  const { hash } = await params;
  if (!PHOTO_HASH.test(hash)) return NextResponse.json({ error: "That is not a photo reference." }, { status: 400 });

  const mode = new URL(req.url).searchParams.get("mode") ?? "";
  // "off" has no preview: the editor shows the original photo itself for that.
  if (mode === "off" || !ENHANCEMENT_MODE_IDS.includes(mode as (typeof ENHANCEMENT_MODE_IDS)[number])) {
    return NextResponse.json({ error: "That is not a photo enhancement mode." }, { status: 400 });
  }

  try {
    const upstream = await fetch(processorUrl(`/photos/${hash}/preview?mode=${encodeURIComponent(mode)}`), {
      method: "POST",
      signal: req.signal,
    });
    if (!upstream.ok) {
      return new NextResponse(await upstream.text(), { status: upstream.status, headers: { "content-type": "application/json" } });
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/webp",
        // The bytes are derived from a content-hashed photo and a mode, so they never change for this URL.
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return processorUnreachable();
  }
}
