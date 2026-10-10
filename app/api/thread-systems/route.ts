import { NextResponse } from "next/server";
import { guardMutation } from "@/lib/server/request-guard";
import {
  createOwnSystem,
  listOwnSystems,
  ownSystemRefusedResponse,
  readOwnSystemBody,
  requireOwnSystems,
} from "@/lib/thread-systems/own-server";

/**
 * A person's own thread systems (G-132 M4, D402). GET lists the requester's, with how many they may keep; POST keeps the
 * list in the body, `{ name?, text }` (the CSV or JSON file's text), as a new system. Signed-in only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { userId, allowed } = await requireOwnSystems();
    return NextResponse.json(await listOwnSystems(userId, allowed), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return ownSystemRefusedResponse(error);
  }
}

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    const { userId, allowed } = await requireOwnSystems();
    return NextResponse.json(await createOwnSystem(userId, allowed, await readOwnSystemBody(req)), { status: 201 });
  } catch (error) {
    return ownSystemRefusedResponse(error);
  }
}
