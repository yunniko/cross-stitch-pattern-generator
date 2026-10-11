import { NextResponse } from "next/server";
import { PREVIEW_CONTENT_TYPE } from "@/lib/charts/preview";
import { previewKey } from "@/lib/charts/saved-chart-link";
import { readStampPreview, stamps } from "@/lib/stamps/server";

/**
 * A stamp's preview (G-119, D360), its owner's alone. Asked for at `?v=<version>.<drawing>` (`previewKey`), it is kept by the browser: a stamp's
 * stitches never change once kept, and a rename (a new version) keeps the same picture.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = stamps.read(async (req: Request, { params }: Context): Promise<Response> => {
  const { png, version } = await readStampPreview(await stamps.requireSignedIn(), (await params).id);
  const asked = new URL(req.url).searchParams.get("v");
  return new NextResponse(png, {
    headers: {
      "content-type": PREVIEW_CONTENT_TYPE,
      "cache-control": asked === previewKey(version) ? "private, max-age=31536000, immutable" : "private, no-cache",
      "x-content-type-options": "nosniff",
    },
  });
});
