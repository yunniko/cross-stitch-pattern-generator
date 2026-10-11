import { NextResponse } from "next/server";
import { readPatchBody } from "@/lib/server/account-resource";
import { parseVersion } from "@/lib/charts/saved-charts";
import { charts, deleteChart, overwriteChart, pinChart, readChart, readChartBody, Refused, renameChart } from "@/lib/charts/server";

/**
 * One saved chart (G-108 part 1, D354), its owner's alone; anyone else is answered 404, as for an id not in use.
 *
 * - GET: the editable file as the body, with its version, name and save time in headers.
 * - PUT: overwrites it with the file in the body, if it is still at the version in `x-chart-version`; 409 otherwise.
 * - PATCH: `{ "name": … }` renames it; `{ "pinned": true | false }` pins or unpins it (not a save).
 * - DELETE: deletes it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = charts.read(async (_req: Request, { params }: Context): Promise<Response> => {
  const chart = await readChart(await charts.requireSignedIn(), (await params).id);
  return new NextResponse(chart.document, {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-chart-version": String(chart.version),
      "x-chart-name": encodeURIComponent(chart.name),
      "x-chart-saved-at": chart.updatedAt.toISOString(),
    },
  });
});

export const PUT = charts.write(async (req: Request, { params }: Context): Promise<Response> => {
  const userId = await charts.requireSignedIn();
  const expected = parseVersion(req.headers.get("x-chart-version"));
  return NextResponse.json(await overwriteChart(userId, (await params).id, expected, await readChartBody(req)));
});

export const PATCH = charts.write(async (req: Request, { params }: Context): Promise<Response> => {
  const userId = await charts.requireSignedIn();
  const body = await readPatchBody(req);
  const id = (await params).id;
  if ("pinned" in body) {
    if (typeof body.pinned !== "boolean") throw new Refused(400, "Say whether the chart is pinned: true or false.");
    return NextResponse.json(await pinChart(userId, id, body.pinned));
  }
  return NextResponse.json(await renameChart(userId, id, body.name));
});

export const DELETE = charts.write(async (req: Request, { params }: Context): Promise<Response> => {
  await deleteChart(await charts.requireSignedIn(), (await params).id);
  return new NextResponse(null, { status: 204 });
});
