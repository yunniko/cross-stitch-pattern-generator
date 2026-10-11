import { NextResponse } from "next/server";
import type { PaletteSaved } from "@/lib/palettes/palette";
import { listPalettes, palettes, readPaletteBody, savePalette } from "@/lib/palettes/server";

/**
 * Palettes kept with an account (G-131 M4, D398). GET lists the requester's own, with how many they may keep; POST keeps
 * the palette in the body under its name, replacing one of that name. Signed-in only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = palettes.read(async (): Promise<Response> => {
  const { userId, allowed } = await palettes.requireAccount();
  return NextResponse.json(await listPalettes(userId, allowed), { headers: { "cache-control": "no-store" } });
});

export const POST = palettes.write(async (req: Request): Promise<Response> => {
  const { userId, allowed } = await palettes.requireAccount();
  const { palette, replaced } = await savePalette(userId, allowed, await readPaletteBody(req));
  return NextResponse.json({ ...palette, replaced } satisfies PaletteSaved, { status: replaced ? 200 : 201 });
});
