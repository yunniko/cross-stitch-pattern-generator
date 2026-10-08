import { NextResponse } from "next/server";
import { guardMutation } from "@/lib/server/request-guard";
import { deleteStamp, pinStamp, readStamp, Refused, renameStamp, requireSignedIn, stampRefusedResponse } from "@/lib/stamps/server";

/**
 * One stamp (G-119, D360), its owner's alone; anyone else is answered 404, as for an id not in use.
 *
 * - GET: the stamp's document as the body, with its version and name in headers.
 * - PATCH: `{ "name": … }` renames it; `{ "pinned": true | false }` pins or unpins it.
 * - DELETE: deletes it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context): Promise<Response> {
  try {
    const stamp = await readStamp(await requireSignedIn(), (await params).id);
    return new NextResponse(stamp.document, {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-stamp-version": String(stamp.version),
        "x-stamp-name": encodeURIComponent(stamp.name),
      },
    });
  } catch (error) {
    return stampRefusedResponse(error);
  }
}

export async function PATCH(req: Request, { params }: Context): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    const userId = await requireSignedIn();
    const body = (await req.json().catch(() => ({}))) as { name?: unknown; pinned?: unknown };
    const id = (await params).id;
    if ("pinned" in body) {
      if (typeof body.pinned !== "boolean") throw new Refused(400, "Say whether the stamp is pinned: true or false.");
      return NextResponse.json(await pinStamp(userId, id, body.pinned));
    }
    return NextResponse.json(await renameStamp(userId, id, body.name));
  } catch (error) {
    return stampRefusedResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Context): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    await deleteStamp(await requireSignedIn(), (await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return stampRefusedResponse(error);
  }
}
