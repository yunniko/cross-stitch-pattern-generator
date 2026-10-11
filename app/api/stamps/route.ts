import { NextResponse } from "next/server";
import { createStamp, listStamps, readStampBody, stamps } from "@/lib/stamps/server";

/**
 * Stamps (G-119, D360). GET lists the requester's own, with how many they may keep; POST keeps the stamp in the body, with
 * an id of the server's making. Signed-in only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = stamps.read(async (): Promise<Response> => {
  return NextResponse.json(await listStamps(await stamps.requireSignedIn()), { headers: { "cache-control": "no-store" } });
});

export const POST = stamps.write(async (req: Request): Promise<Response> => {
  const userId = await stamps.requireSignedIn();
  return NextResponse.json(await createStamp(userId, await readStampBody(req)), { status: 201 });
});
