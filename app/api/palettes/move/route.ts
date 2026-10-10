import { NextResponse } from "next/server";
import { guardMutation } from "@/lib/server/request-guard";
import { movePalettes, paletteRefusedResponse, readMoveBody, requirePalettes } from "@/lib/palettes/server";

/**
 * The one-time move of the palettes an earlier version kept in the browser (G-131 M4, D398): POST `{ palettes: [...] }`
 * keeps them in order in one request, a name taken taking a number, up to the person's limit. Answers those kept, and why
 * the rest were not.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    const { userId, allowed } = await requirePalettes();
    return NextResponse.json(await movePalettes(userId, allowed, await readMoveBody(req)));
  } catch (error) {
    return paletteRefusedResponse(error);
  }
}
