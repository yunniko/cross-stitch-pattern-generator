import { NextResponse } from "next/server";
import { guardMutation } from "@/lib/server/request-guard";
import { listPalettes, paletteRefusedResponse, readPaletteBody, requirePalettes, savePalette } from "@/lib/palettes/server";

/**
 * Palettes kept with an account (G-131 M4, D398). GET lists the requester's own, with how many they may keep; POST keeps
 * the palette in the body under its name, replacing one of that name. Signed-in only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { userId, allowed } = await requirePalettes();
    return NextResponse.json(await listPalettes(userId, allowed), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return paletteRefusedResponse(error);
  }
}

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    const { userId, allowed } = await requirePalettes();
    const { palette, replaced } = await savePalette(userId, allowed, await readPaletteBody(req));
    return NextResponse.json({ ...palette, replaced }, { status: replaced ? 200 : 201 });
  } catch (error) {
    return paletteRefusedResponse(error);
  }
}
