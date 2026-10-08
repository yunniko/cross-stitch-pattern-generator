import { NextResponse } from "next/server";
import { guardMutation } from "@/lib/server/request-guard";
import { createStamp, listStamps, readStampBody, requireSignedIn, stampRefusedResponse } from "@/lib/stamps/server";

/**
 * Stamps (G-119, D360). GET lists the requester's own, with how many they may keep; POST keeps the stamp in the body, with
 * an id of the server's making. Signed-in only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return NextResponse.json(await listStamps(await requireSignedIn()), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return stampRefusedResponse(error);
  }
}

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    const userId = await requireSignedIn();
    return NextResponse.json(await createStamp(userId, await readStampBody(req)), { status: 201 });
  } catch (error) {
    return stampRefusedResponse(error);
  }
}
