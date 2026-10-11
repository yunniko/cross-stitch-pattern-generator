import { NextResponse } from "next/server";
import { readPatchBody } from "@/lib/server/account-resource";
import { deleteOwnSystem, ownSystems, renameOwnSystem } from "@/lib/thread-systems/own-server";

/**
 * One of a person's own thread systems (G-132 M4, D402), its owner's alone; anyone else is answered 404, as for an id not
 * in use.
 *
 * - PATCH: `{ "name": … }` renames it; its key, which charts store, stays.
 * - DELETE: deletes it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const PATCH = ownSystems.write(async (req: Request, { params }: Context): Promise<Response> => {
  const { userId } = await ownSystems.requireAccount();
  const body = await readPatchBody(req);
  return NextResponse.json(await renameOwnSystem(userId, (await params).id, body.name));
});

export const DELETE = ownSystems.write(async (req: Request, { params }: Context): Promise<Response> => {
  const { userId } = await ownSystems.requireAccount();
  await deleteOwnSystem(userId, (await params).id);
  return new NextResponse(null, { status: 204 });
});
