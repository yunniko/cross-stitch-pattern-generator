import { NextResponse } from "next/server";
import { guardMutation } from "@/lib/server/request-guard";
import { createChart, listCharts, readChartBody, refusedResponse, requireSignedIn } from "@/lib/charts/server";

/**
 * Saved charts (G-108 part 1, D354). GET lists the requester's own, with the space they use and are allowed; POST saves
 * the editable file in the body as a new chart, with an id of the server's making. Signed-in only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return NextResponse.json(await listCharts(await requireSignedIn()), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return refusedResponse(error);
  }
}

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    const userId = await requireSignedIn();
    return NextResponse.json(await createChart(userId, await readChartBody(req)), { status: 201 });
  } catch (error) {
    return refusedResponse(error);
  }
}
