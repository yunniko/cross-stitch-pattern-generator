import { NextResponse } from "next/server";
import { guardMutation } from "@/lib/server/request-guard";
import { deleteOwnSystem, ownSystemRefusedResponse, renameOwnSystem, requireOwnSystems } from "@/lib/thread-systems/own-server";

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

export async function PATCH(req: Request, { params }: Context): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    const { userId } = await requireOwnSystems();
    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    return NextResponse.json(await renameOwnSystem(userId, (await params).id, body.name));
  } catch (error) {
    return ownSystemRefusedResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Context): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    const { userId } = await requireOwnSystems();
    await deleteOwnSystem(userId, (await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return ownSystemRefusedResponse(error);
  }
}
