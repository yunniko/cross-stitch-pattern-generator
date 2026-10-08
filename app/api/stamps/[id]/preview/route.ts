import { NextResponse } from "next/server";
import { PREVIEW_CONTENT_TYPE } from "@/lib/charts/preview";
import { readStampPreview, requireSignedIn, stampRefusedResponse } from "@/lib/stamps/server";

/**
 * A stamp's preview (G-119, D360), its owner's alone. Asked for at `?v=<version>`, it is kept by the browser: a stamp's
 * stitches never change once kept, and a rename (a new version) keeps the same picture.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Context): Promise<Response> {
  try {
    const { png, version } = await readStampPreview(await requireSignedIn(), (await params).id);
    const asked = new URL(req.url).searchParams.get("v");
    return new NextResponse(png, {
      headers: {
        "content-type": PREVIEW_CONTENT_TYPE,
        "cache-control": asked === String(version) ? "private, max-age=31536000, immutable" : "private, no-cache",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return stampRefusedResponse(error);
  }
}
