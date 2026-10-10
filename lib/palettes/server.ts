import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Refused } from "@/lib/charts/server";
import { featureStatesFor } from "@/lib/features/server";
import { featureUsable } from "@/lib/features/features";
import { limitsFor } from "@/lib/limits/server";
import { limitValue, type LimitValue } from "@/lib/limits/limits";
import type { PaletteSet } from "@/lib/editor/palette-set";
import { prisma } from "@/lib/prisma";
import {
  MOVE_MAX_PALETTES,
  PALETTE_COUNT_LIMIT,
  PALETTE_MAX_BYTES,
  PALETTES_FEATURE,
  freeName,
  paletteCountRefusal,
  paletteData,
  paletteName,
  readPaletteMove,
  readPaletteUpload,
  storedPalette,
  type AccountPalette,
} from "./palette";

/**
 * The database half of account palettes (G-131 M4, D398), for the routes under `/api/palettes`. Shaped as stamps' (`lib/
 * stamps/server.ts`): a refusal is a `Refused`, a person's saves run one at a time (a lock on their account row) so the count
 * check sees what the other save left, and anyone but the owner is answered as if the palette did not exist.
 */

export { Refused };

export function paletteRefusedResponse(error: unknown): Response {
  if (error instanceof Refused) return NextResponse.json({ error: error.message, ...error.extra }, { status: error.status });
  console.error("palettes:", error);
  return NextResponse.json({ error: "Palettes are unavailable right now. Try again in a moment." }, { status: 503 });
}

const NOT_FOUND = "That palette is not among your palettes.";

/** The signed-in requester's id, allowed to keep palettes, with how many they may keep. */
export async function requirePalettes(): Promise<{ userId: string; allowed: LimitValue }> {
  const userId = (await auth())?.user?.id ?? null;
  if (!userId) throw new Refused(401, "Sign in to keep palettes with your account.");
  if (!featureUsable(await featureStatesFor(userId), PALETTES_FEATURE)) throw new Refused(403, "Palettes are not available to you.");
  return { userId, allowed: limitValue(await limitsFor(userId), PALETTE_COUNT_LIMIT) };
}

/** A body as JSON, refused when larger than `maxBytes` or not JSON. */
async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length"));
  const text = Number.isFinite(declared) && declared > maxBytes ? null : await req.text();
  if (text === null || new TextEncoder().encode(text).byteLength > maxBytes) throw new Refused(413, "That is too large to keep.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Refused(400, "That is not a palette.");
  }
}

/** The body of a save, refused when too large or not a palette. */
export async function readPaletteBody(req: Request): Promise<{ name: string; set: PaletteSet }> {
  const read = readPaletteUpload(await readJson(req, PALETTE_MAX_BYTES));
  if ("error" in read) throw new Refused(422, read.error);
  return read;
}

/** The body of a move from the browser, refused when too large or not palettes. */
export async function readMoveBody(req: Request): Promise<Array<{ name: string; set: PaletteSet }>> {
  const read = readPaletteMove(await readJson(req, MOVE_MAX_PALETTES * PALETTE_MAX_BYTES));
  if ("error" in read) throw new Refused(422, read.error);
  return read.palettes;
}

const ROW = { id: true, name: true, data: true, updatedAt: true } as const;

function palette(row: { id: string; name: string; data: string; updatedAt: Date }): AccountPalette | null {
  const set = storedPalette(row.data);
  return set && { id: row.id, name: row.name, set, savedAt: row.updatedAt.toISOString() };
}

/**
 * Keeps the palette under its name: a new one, counted against the limit, or the one of that name replaced, which is not.
 * Answers the palette and whether it replaced one.
 */
export async function savePalette(
  userId: string,
  allowed: LimitValue,
  body: Awaited<ReturnType<typeof readPaletteBody>>
): Promise<{ palette: AccountPalette; replaced: boolean }> {
  const data = paletteData(body.set);
  const colors = body.set.colors.length;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const existing = await tx.palette.findUnique({ where: { userId_name: { userId, name: body.name } }, select: { id: true } });
    if (existing) {
      const row = await tx.palette.update({ where: { id: existing.id }, data: { data, colors }, select: ROW });
      return { palette: palette(row)!, replaced: true };
    }
    const refusal = paletteCountRefusal(await tx.palette.count({ where: { userId } }), allowed);
    if (refusal) throw new Refused(403, refusal, { reason: "limit" });
    const row = await tx.palette.create({ data: { userId, name: body.name, data, colors }, select: ROW });
    return { palette: palette(row)!, replaced: false };
  });
}

/**
 * Keeps the browser's palettes in order, in one transaction: a name the account keeps already takes a number, and the move
 * stops at the person's limit. Answers those kept and, when some were not, why.
 */
export async function movePalettes(
  userId: string,
  allowed: LimitValue,
  list: Array<{ name: string; set: PaletteSet }>
): Promise<{ moved: AccountPalette[]; refusal: string | null }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const taken = new Set((await tx.palette.findMany({ where: { userId }, select: { name: true } })).map((p) => p.name));
    const moved: AccountPalette[] = [];
    for (const { name, set } of list) {
      const refusal = paletteCountRefusal(taken.size, allowed);
      if (refusal) return { moved, refusal };
      const kept = freeName(name, taken);
      taken.add(kept);
      const row = await tx.palette.create({ data: { userId, name: kept, data: paletteData(set), colors: set.colors.length }, select: ROW });
      moved.push(palette(row)!);
    }
    return { moved, refusal: null };
  });
}

async function ownedPalette(tx: Pick<typeof prisma, "palette">, id: string, userId: string) {
  const row = await tx.palette.findUnique({ where: { id }, select: { userId: true } });
  if (!row || row.userId !== userId) throw new Refused(404, NOT_FOUND);
}

/** Renames a palette; refused when another of the person's palettes has that name. */
export async function renamePalette(userId: string, id: string, name: unknown): Promise<AccountPalette> {
  const kept = paletteName(name);
  if (!kept) throw new Refused(422, "Give the palette a name.");
  return prisma.$transaction(async (tx) => {
    await ownedPalette(tx, id, userId);
    const other = await tx.palette.findUnique({ where: { userId_name: { userId, name: kept } }, select: { id: true } });
    if (other && other.id !== id) throw new Refused(409, `You keep a palette named “${kept}” already.`);
    const row = await tx.palette.update({ where: { id }, data: { name: kept }, select: ROW });
    return palette(row)!;
  });
}

export async function deletePalette(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await ownedPalette(tx, id, userId);
    await tx.palette.delete({ where: { id } });
  });
}

/** The person's palettes, newest first, with how many they may keep. */
export async function listPalettes(userId: string, allowed: LimitValue): Promise<{ palettes: AccountPalette[]; allowed: LimitValue }> {
  const rows = await prisma.palette.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, select: ROW });
  return { palettes: rows.flatMap((row) => palette(row) ?? []), allowed };
}
