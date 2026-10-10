import { NextResponse } from "next/server";
import { guardMutation } from "@/lib/server/request-guard";
import { deletePalette, paletteRefusedResponse, renamePalette, requirePalettes } from "@/lib/palettes/server";

/**
 * One kept palette (G-131 M4, D398), its owner's alone; anyone else is answered 404, as for an id not in use.
 *
 * - PATCH: `{ "name": … }` renames it.
 * - DELETE: deletes it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    const { userId } = await requirePalettes();
    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    return NextResponse.json(await renamePalette(userId, (await params).id, body.name));
  } catch (error) {
    return paletteRefusedResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Context): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    const { userId } = await requirePalettes();
    await deletePalette(userId, (await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return paletteRefusedResponse(error);
  }
}
