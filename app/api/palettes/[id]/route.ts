import { NextResponse } from "next/server";
import { readPatchBody } from "@/lib/server/account-resource";
import { deletePalette, palettes, renamePalette } from "@/lib/palettes/server";

/**
 * One kept palette (G-131 M4, D398), its owner's alone; anyone else is answered 404, as for an id not in use.
 *
 * - PATCH: `{ "name": … }` renames it.
 * - DELETE: deletes it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const PATCH = palettes.write(async (req: Request, { params }: Context): Promise<Response> => {
  const { userId } = await palettes.requireAccount();
  const body = await readPatchBody(req);
  return NextResponse.json(await renamePalette(userId, (await params).id, body.name));
});

export const DELETE = palettes.write(async (req: Request, { params }: Context): Promise<Response> => {
  const { userId } = await palettes.requireAccount();
  await deletePalette(userId, (await params).id);
  return new NextResponse(null, { status: 204 });
});
