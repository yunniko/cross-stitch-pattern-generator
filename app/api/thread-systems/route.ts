import { NextResponse } from "next/server";
import { createOwnSystem, listOwnSystems, ownSystems, readOwnSystemBody } from "@/lib/thread-systems/own-server";

/**
 * A person's own thread systems (G-132 M4, D402). GET lists the requester's, with how many they may keep; POST keeps the
 * list in the body, `{ name?, text }` (the CSV or JSON file's text), as a new system. Signed-in only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = ownSystems.read(async (): Promise<Response> => {
  const { userId, allowed } = await ownSystems.requireAccount();
  return NextResponse.json(await listOwnSystems(userId, allowed), { headers: { "cache-control": "no-store" } });
});

export const POST = ownSystems.write(async (req: Request): Promise<Response> => {
  const { userId, allowed } = await ownSystems.requireAccount();
  return NextResponse.json(await createOwnSystem(userId, allowed, await readOwnSystemBody(req)), { status: 201 });
});
