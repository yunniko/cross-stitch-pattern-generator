import { NextResponse } from "next/server";
import { PREVIEW_CONTENT_TYPE } from "@/lib/charts/preview";
import { previewKey } from "@/lib/charts/saved-chart-link";
import { readPreview, refusedResponse, requireSignedIn } from "@/lib/charts/server";

/**
 * A saved chart's preview (G-108 part 1 M6, D357), its owner's alone; anyone else is answered 404.
 *
 * The page asks for `?v=<version>.<drawing>` (`previewKey`): a picture of that version and drawing never changes, so the browser keeps it, and a save (which
 * makes a new version) is fetched afresh. Any other request is answered with the current picture, not kept.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Context): Promise<Response> {
  try {
    const { png, version } = await readPreview(await requireSignedIn(), (await params).id);
    const asked = new URL(req.url).searchParams.get("v");
    return new NextResponse(png, {
      headers: {
        "content-type": PREVIEW_CONTENT_TYPE,
        "cache-control": asked === previewKey(version) ? "private, max-age=31536000, immutable" : "private, no-cache",
        "x-content-type-options": "nosniff",
        "x-chart-version": String(version),
      },
    });
  } catch (error) {
    return refusedResponse(error);
  }
}
