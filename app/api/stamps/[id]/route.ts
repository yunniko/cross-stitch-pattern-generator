import { NextResponse } from "next/server";
import { readPatchBody } from "@/lib/server/account-resource";
import { deleteStamp, pinStamp, readStamp, Refused, renameStamp, stamps } from "@/lib/stamps/server";

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

export const GET = stamps.read(async (_req: Request, { params }: Context): Promise<Response> => {
  const stamp = await readStamp(await stamps.requireSignedIn(), (await params).id);
  return new NextResponse(stamp.document, {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-stamp-version": String(stamp.version),
      "x-stamp-name": encodeURIComponent(stamp.name),
    },
  });
});

export const PATCH = stamps.write(async (req: Request, { params }: Context): Promise<Response> => {
  const userId = await stamps.requireSignedIn();
  const body = await readPatchBody(req);
  const id = (await params).id;
  if ("pinned" in body) {
    if (typeof body.pinned !== "boolean") throw new Refused(400, "Say whether the stamp is pinned: true or false.");
    return NextResponse.json(await pinStamp(userId, id, body.pinned));
  }
  return NextResponse.json(await renameStamp(userId, id, body.name));
});

export const DELETE = stamps.write(async (req: Request, { params }: Context): Promise<Response> => {
  await deleteStamp(await stamps.requireSignedIn(), (await params).id);
  return new NextResponse(null, { status: 204 });
});
