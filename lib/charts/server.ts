import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { featureStatesFor } from "@/lib/features/server";
import { featureUsable } from "@/lib/features/features";
import { limitsFor } from "@/lib/limits/server";
import { limitValue, type LimitValue } from "@/lib/limits/limits";
import { prisma } from "@/lib/prisma";
import { systemLabelsFor } from "@/lib/thread-systems/server";
import { chartAllowed, type ChartAction } from "./access";
import { chartPreviewPng } from "./preview";
import { FULL_RANGE, type SavedChartCard } from "./chart-cards";
import {
  CHART_STORAGE_LIMIT,
  CONFLICT_MESSAGE,
  SAVE_TO_ACCOUNT_FEATURE,
  SAVED_CHART_MAX_BYTES,
  chartBytes,
  readChartUpload,
  savedChartName,
  storageRefusal,
  type SavedChartSummary,
} from "./saved-charts";

/**
 * The database half of saved charts (G-108 part 1, D354), for the routes under `/api/charts`. A refusal is a `Refused`
 * carrying its status and sentence; the routes turn it into a response with `refusedResponse`.
 *
 * A person's saves run one at a time (a lock on their account row), so the space check and the version check each see
 * what the other save left.
 */

export class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export function refusedResponse(error: unknown): Response {
  if (error instanceof Refused) return NextResponse.json({ error: error.message, ...error.extra }, { status: error.status });
  console.error("saved charts:", error);
  return NextResponse.json({ error: "Saved charts are unavailable right now. Try again in a moment." }, { status: 503 });
}

const NOT_FOUND = "That chart is not among your saved charts.";

/** The signed-in requester's id; refused with 401 for a visitor. */
export async function requireSignedIn(): Promise<string> {
  const userId = (await auth())?.user?.id ?? null;
  if (!userId) throw new Refused(401, "Sign in to save charts to your account.");
  return userId;
}

/** Saving (making or overwriting) is a feature: refused by name while it is locked or hidden for this person. */
async function requireSaving(userId: string): Promise<LimitValue> {
  if (!featureUsable(await featureStatesFor(userId), SAVE_TO_ACCOUNT_FEATURE))
    throw new Refused(403, "Saving to your account is not available to you.");
  // A limit that cannot be read refuses (G-109 answer); the throw becomes the 503 above.
  return limitValue(await limitsFor(userId), CHART_STORAGE_LIMIT);
}

/**
 * The body of a save, refused when it is too large or not a chart the editor can open; with the preview drawn from it,
 * so every save stores a picture of what it stored (D357).
 */
export async function readChartBody(req: Request): Promise<{
  text: string;
  bytes: number;
  summary: SavedChartSummary;
  preview: Uint8Array<ArrayBuffer>;
}> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > SAVED_CHART_MAX_BYTES) throw tooLarge();
  const text = await req.text();
  const bytes = chartBytes(text);
  if (bytes > SAVED_CHART_MAX_BYTES) throw tooLarge();
  const read = readChartUpload(text);
  if ("error" in read) throw new Refused(422, read.error);
  return { text, bytes, summary: read.summary, preview: await chartPreviewPng(read.pattern) };
}

function tooLarge() {
  return new Refused(
    413,
    `This chart is larger than ${SAVED_CHART_MAX_BYTES / 1024 / 1024} MB, too large to save to your account. Save it to a file instead.`
  );
}

/** What a save answers: enough for the editor to remember the chart and say it is saved. */
export interface SavedChartReceipt {
  id: string;
  name: string;
  version: number;
  savedAt: string;
}

const receipt = (chart: { id: string; name: string; version: number; updatedAt: Date }): SavedChartReceipt => ({
  id: chart.id,
  name: chart.name,
  version: chart.version,
  savedAt: chart.updatedAt.toISOString(),
});

async function usedBytes(tx: Pick<typeof prisma, "savedChart">, userId: string): Promise<number> {
  return (await tx.savedChart.aggregate({ where: { userId }, _sum: { bytes: true } }))._sum.bytes ?? 0;
}

/** A new saved chart, with an id of the server's making. */
export async function createChart(userId: string, body: Awaited<ReturnType<typeof readChartBody>>): Promise<SavedChartReceipt> {
  const allowed = await requireSaving(userId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const refusal = storageRefusal(await usedBytes(tx, userId), 0, body.bytes, allowed);
    if (refusal) throw new Refused(403, refusal, { reason: "storage" });
    const chart = await tx.savedChart.create({
      data: { userId, document: body.text, bytes: body.bytes, ...body.summary, preview: body.preview },
      select: { id: true, name: true, version: true, updatedAt: true },
    });
    return receipt(chart);
  });
}

/** The chart, when the requester may do this with it; refused as not found otherwise. */
async function ownedChart(tx: Pick<typeof prisma, "savedChart">, id: string, userId: string, action: ChartAction) {
  const chart = await tx.savedChart.findUnique({
    where: { id },
    select: { id: true, userId: true, version: true, bytes: true, updatedAt: true, document: action === "read" },
  });
  if (!chart || !chartAllowed(chart, userId, action)) throw new Refused(404, NOT_FOUND);
  return chart;
}

/**
 * Overwrites a saved chart, if it is still at the version the browser last saw. Otherwise refused with 409 and the
 * version it is at, so the browser can ask whether to save a copy instead.
 */
export async function overwriteChart(
  userId: string,
  id: string,
  expected: number | null,
  body: Awaited<ReturnType<typeof readChartBody>>
): Promise<SavedChartReceipt> {
  if (expected === null) throw new Refused(400, "The save did not say which version of the chart it replaces.");
  const allowed = await requireSaving(userId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const chart = await ownedChart(tx, id, userId, "write");
    if (chart.version !== expected)
      throw new Refused(409, CONFLICT_MESSAGE, { reason: "conflict", version: chart.version, savedAt: chart.updatedAt.toISOString() });
    const refusal = storageRefusal(await usedBytes(tx, userId), chart.bytes, body.bytes, allowed);
    if (refusal) throw new Refused(403, refusal, { reason: "storage" });
    const saved = await tx.savedChart.update({
      where: { id },
      data: { document: body.text, bytes: body.bytes, ...body.summary, preview: body.preview, version: { increment: 1 } },
      select: { id: true, name: true, version: true, updatedAt: true },
    });
    return receipt(saved);
  });
}

/** One saved chart whole, for the editor to open. */
export async function readChart(userId: string, id: string) {
  const chart = await prisma.savedChart.findUnique({
    where: { id },
    select: { id: true, userId: true, name: true, version: true, updatedAt: true, document: true },
  });
  if (!chart || !chartAllowed(chart, userId, "read")) throw new Refused(404, NOT_FOUND);
  return chart;
}

/**
 * A saved chart's preview, its owner's alone, with the version it shows. A chart saved before previews, or before the current drawing (D362), has none:
 * it is drawn from the stored file on first request and kept, without counting as a save (the save time stays).
 */
export async function readPreview(userId: string, id: string): Promise<{ png: Uint8Array<ArrayBuffer>; version: number }> {
  const chart = await prisma.savedChart.findUnique({ where: { id }, select: { userId: true, version: true, preview: true } });
  if (!chart || !chartAllowed(chart, userId, "read")) throw new Refused(404, NOT_FOUND);
  if (chart.preview) return { png: new Uint8Array(chart.preview), version: chart.version };
  const { document } = (await prisma.savedChart.findUnique({ where: { id }, select: { document: true } })) ?? {};
  const read = document === undefined ? null : readChartUpload(document);
  if (!read || "error" in read) throw new Refused(404, NOT_FOUND);
  const png = await chartPreviewPng(read.pattern);
  // Kept only if no save overtook the drawing; a save brings its own.
  await prisma.$executeRaw`UPDATE "SavedChart" SET "preview" = ${Buffer.from(png)} WHERE "id" = ${id} AND "version" = ${chart.version} AND "preview" IS NULL`;
  return { png, version: chart.version };
}

/**
 * Renames a saved chart: the row and the name inside its file, so the file reopens with it. One more version; the preview
 * is kept, since no name is drawn in it.
 */
export async function renameChart(userId: string, id: string, name: unknown): Promise<SavedChartReceipt> {
  const kept = savedChartName(name);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    await ownedChart(tx, id, userId, "write");
    const { document } = (await tx.savedChart.findUnique({ where: { id }, select: { document: true } }))!;
    const data = JSON.parse(document) as Record<string, unknown>;
    data.name = kept;
    const text = JSON.stringify(data);
    const saved = await tx.savedChart.update({
      where: { id },
      data: { name: kept, document: text, bytes: chartBytes(text), version: { increment: 1 } },
      select: { id: true, name: true, version: true, updatedAt: true },
    });
    return receipt(saved);
  });
}

/** Pins or unpins a saved chart. Not a save: the version and the save time stay, so the editor's next Save asks nothing. */
export async function pinChart(userId: string, id: string, pinned: boolean): Promise<{ id: string; pinned: boolean }> {
  await prisma.$transaction(async (tx) => {
    await ownedChart(tx, id, userId, "write");
    await tx.$executeRaw`UPDATE "SavedChart" SET "pinned" = ${pinned} WHERE "id" = ${id}`;
  });
  return { id, pinned };
}

export async function deleteChart(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await ownedChart(tx, id, userId, "write");
    await tx.savedChart.delete({ where: { id } });
  });
}

/** The thread system's name for the list, or "Full range" for none; a system no longer here is named as stored (G-132). */
function paletteName(brand: string | null, labels: ReadonlyMap<string, string>): string {
  return brand ? (labels.get(brand) ?? brand) : FULL_RANGE;
}

/** How many charts the person has saved, for the count beside Charts in the account's sidebar. */
export function countCharts(userId: string): Promise<number> {
  return prisma.savedChart.count({ where: { userId } });
}

/** The person's saved charts, pinned first, then newest, without their files; with the space they use and are allowed. */
export async function listCharts(userId: string): Promise<{ charts: SavedChartCard[]; used: number; allowed: LimitValue }> {
  const [charts, limits, labels] = await Promise.all([
    prisma.savedChart.findMany({
      where: { userId },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        bytes: true,
        width: true,
        height: true,
        colors: true,
        brand: true,
        pinned: true,
        version: true,
        updatedAt: true,
      },
    }),
    limitsFor(userId),
    systemLabelsFor(),
  ]);
  const names = new Map(labels);
  return {
    charts: charts.map(({ updatedAt, brand, ...chart }) => ({
      ...chart,
      palette: paletteName(brand, names),
      savedAt: updatedAt.toISOString(),
    })),
    used: charts.reduce((sum, chart) => sum + chart.bytes, 0),
    allowed: limitValue(limits, CHART_STORAGE_LIMIT),
  };
}
