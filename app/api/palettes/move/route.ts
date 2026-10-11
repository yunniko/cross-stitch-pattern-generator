import { NextResponse } from "next/server";
import { movePalettes, palettes, readMoveBody } from "@/lib/palettes/server";

/**
 * The one-time move of the palettes an earlier version kept in the browser (G-131 M4, D398): POST `{ palettes: [...] }`
 * keeps them in order in one request, a name taken taking a number, up to the person's limit. Answers those kept, and why
 * the rest were not.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = palettes.write(async (req: Request): Promise<Response> => {
  const { userId, allowed } = await palettes.requireAccount();
  return NextResponse.json(await movePalettes(userId, allowed, await readMoveBody(req)));
});
