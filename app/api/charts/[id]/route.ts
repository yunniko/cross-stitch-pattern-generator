import { NextResponse } from "next/server";
import { guardMutation } from "@/lib/server/request-guard";
import { parseVersion } from "@/lib/charts/saved-charts";
import { deleteChart, overwriteChart, readChart, readChartBody, refusedResponse, renameChart, requireSignedIn } from "@/lib/charts/server";

/**
 * One saved chart (G-108 part 1, D354), its owner's alone; anyone else is answered 404, as for an id not in use.
 *
 * - GET: the editable file as the body, with its version, name and save time in headers.
 * - PUT: overwrites it with the file in the body, if it is still at the version in `x-chart-version`; 409 otherwise.
 * - PATCH: `{ "name": … }` renames it.
 * - DELETE: deletes it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context): Promise<Response> {
  try {
    const chart = await readChart(await requireSignedIn(), (await params).id);
    return new NextResponse(chart.document, {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-chart-version": String(chart.version),
        "x-chart-name": encodeURIComponent(chart.name),
        "x-chart-saved-at": chart.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return refusedResponse(error);
  }
}

export async function PUT(req: Request, { params }: Context): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    const userId = await requireSignedIn();
    const expected = parseVersion(req.headers.get("x-chart-version"));
    return NextResponse.json(await overwriteChart(userId, (await params).id, expected, await readChartBody(req)));
  } catch (error) {
    return refusedResponse(error);
  }
}

export async function PATCH(req: Request, { params }: Context): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    const userId = await requireSignedIn();
    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    return NextResponse.json(await renameChart(userId, (await params).id, body.name));
  } catch (error) {
    return refusedResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Context): Promise<Response> {
  const refused = guardMutation(req, "chartSave");
  if (refused) return refused;
  try {
    await deleteChart(await requireSignedIn(), (await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return refusedResponse(error);
  }
}
