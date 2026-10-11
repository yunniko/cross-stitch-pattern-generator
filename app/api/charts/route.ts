import { NextResponse } from "next/server";
import { charts, createChart, listCharts, readChartBody } from "@/lib/charts/server";

/**
 * Saved charts (G-108 part 1, D354). GET lists the requester's own, with the space they use and are allowed; POST saves
 * the editable file in the body as a new chart, with an id of the server's making. Signed-in only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = charts.read(async (): Promise<Response> => {
  return NextResponse.json(await listCharts(await charts.requireSignedIn()), { headers: { "cache-control": "no-store" } });
});

export const POST = charts.write(async (req: Request): Promise<Response> => {
  const userId = await charts.requireSignedIn();
  return NextResponse.json(await createChart(userId, await readChartBody(req)), { status: 201 });
});
