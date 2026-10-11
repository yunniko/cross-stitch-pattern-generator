import { chartPreviewPng } from "@/lib/charts/preview";
import { limitsFor } from "@/lib/limits/server";
import { limitValue } from "@/lib/limits/limits";
import { accountResource, readBoundedText, Refused } from "@/lib/server/account-resource";
import { prisma } from "@/lib/prisma";
import {
  STAMP_COUNT_LIMIT,
  STAMP_MAX_BYTES,
  STAMPS_FEATURE,
  countRefusal,
  readStampUpload,
  stampName,
  type StampCard,
  type StampList,
  type StampSummary,
} from "./stamp";

/**
 * The database half of stamps (G-119, D360), for the routes under `/api/stamps`. Shaped as saved charts' (`lib/charts/
 * server.ts`): a refusal is a `Refused`, a person's saves run one at a time (a lock on their account row) so the count
 * check sees what the other save left, and anyone but the owner is answered as if the stamp did not exist.
 */

export { Refused };

/** Keeping a new stamp is the feature; reading, renaming and deleting those kept are not. */
export const stamps = accountResource({
  log: "stamps",
  unavailable: "Stamps are unavailable right now. Try again in a moment.",
  signIn: "Sign in to keep stamps with your account.",
  feature: { id: STAMPS_FEATURE, refused: "Stamps are not available to you.", limit: STAMP_COUNT_LIMIT },
});

const NOT_FOUND = "That stamp is not among your stamps.";

/** The body of a save, refused when too large or not a stamp; with the document to keep and its preview. */
export async function readStampBody(req: Request): Promise<{
  document: string;
  bytes: number;
  summary: StampSummary;
  preview: Uint8Array<ArrayBuffer>;
}> {
  const read = readStampUpload(await readBoundedText(req, STAMP_MAX_BYTES, tooLarge));
  if ("error" in read) throw new Refused(422, read.error);
  return {
    document: read.document,
    bytes: new TextEncoder().encode(read.document).byteLength,
    summary: read.summary,
    preview: await chartPreviewPng(read.stamp.pattern),
  };
}

function tooLarge() {
  return new Refused(
    413,
    `This piece is larger than ${STAMP_MAX_BYTES / 1024 / 1024} MB, too large to keep as a stamp. Select a smaller piece.`
  );
}

const CARD = {
  id: true,
  name: true,
  width: true,
  height: true,
  colors: true,
  swatches: true,
  backstitch: true,
  pinned: true,
  version: true,
  updatedAt: true,
} as const;

const card = ({ updatedAt, ...stamp }: { updatedAt: Date } & Omit<StampCard, "savedAt">): StampCard => ({
  ...stamp,
  savedAt: updatedAt.toISOString(),
});

export async function createStamp(userId: string, body: Awaited<ReturnType<typeof readStampBody>>): Promise<StampCard> {
  const allowed = await stamps.requireFeature(userId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const refusal = countRefusal(await tx.stamp.count({ where: { userId } }), allowed);
    if (refusal) throw new Refused(403, refusal, { reason: "limit" });
    const stamp = await tx.stamp.create({
      data: { userId, document: body.document, bytes: body.bytes, ...body.summary, preview: body.preview },
      select: CARD,
    });
    return card(stamp);
  });
}

/** The stamp's owner, or refused as not found for anyone else. */
async function ownedStamp(tx: Pick<typeof prisma, "stamp">, id: string, userId: string) {
  const stamp = await tx.stamp.findUnique({ where: { id }, select: { userId: true } });
  if (!stamp || stamp.userId !== userId) throw new Refused(404, NOT_FOUND);
}

/** One stamp whole, for placing. */
export async function readStamp(userId: string, id: string) {
  const stamp = await prisma.stamp.findUnique({ where: { id }, select: { userId: true, name: true, version: true, document: true } });
  if (!stamp || stamp.userId !== userId) throw new Refused(404, NOT_FOUND);
  return stamp;
}

/**
 * A stamp's preview, with the version it shows. One kept before the current drawing has none (D362): it is drawn from the
 * stored document on first request and kept, without counting as a change.
 */
export async function readStampPreview(userId: string, id: string): Promise<{ png: Uint8Array<ArrayBuffer>; version: number }> {
  const stamp = await prisma.stamp.findUnique({ where: { id }, select: { userId: true, version: true, preview: true } });
  if (!stamp || stamp.userId !== userId) throw new Refused(404, NOT_FOUND);
  if (stamp.preview) return { png: new Uint8Array(stamp.preview), version: stamp.version };
  const { document } = (await prisma.stamp.findUnique({ where: { id }, select: { document: true } })) ?? {};
  const read = document === undefined ? null : readStampUpload(document);
  if (!read || "error" in read) throw new Refused(404, NOT_FOUND);
  const png = await chartPreviewPng(read.stamp.pattern);
  await prisma.$executeRaw`UPDATE "Stamp" SET "preview" = ${Buffer.from(png)} WHERE "id" = ${id} AND "preview" IS NULL`;
  return { png, version: stamp.version };
}

/** Renames a stamp: the row and the name inside its document. One more version; the preview is kept. */
export async function renameStamp(userId: string, id: string, name: unknown): Promise<StampCard> {
  const kept = stampName(name);
  return prisma.$transaction(async (tx) => {
    await ownedStamp(tx, id, userId);
    const { document } = (await tx.stamp.findUnique({ where: { id }, select: { document: true } }))!;
    const data = JSON.parse(document) as Record<string, unknown>;
    data.name = kept;
    const text = JSON.stringify(data);
    const stamp = await tx.stamp.update({
      where: { id },
      data: { name: kept, document: text, bytes: new TextEncoder().encode(text).byteLength, version: { increment: 1 } },
      select: CARD,
    });
    return card(stamp);
  });
}

/** Pins or unpins a stamp. Not a change: the version and the save time stay. */
export async function pinStamp(userId: string, id: string, pinned: boolean): Promise<{ id: string; pinned: boolean }> {
  await prisma.$transaction(async (tx) => {
    await ownedStamp(tx, id, userId);
    await tx.$executeRaw`UPDATE "Stamp" SET "pinned" = ${pinned} WHERE "id" = ${id}`;
  });
  return { id, pinned };
}

export async function deleteStamp(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await ownedStamp(tx, id, userId);
    await tx.stamp.delete({ where: { id } });
  });
}

/** How many stamps the person keeps, for the count beside Stamps in the account's sidebar and for Add stamp. */
export function countStamps(userId: string): Promise<number> {
  return prisma.stamp.count({ where: { userId } });
}

/** The person's stamps, pinned first, then newest, without their documents; with how many they may keep. */
export async function listStamps(userId: string): Promise<StampList> {
  const [stamps, limits] = await Promise.all([
    prisma.stamp.findMany({ where: { userId }, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], select: CARD }),
    limitsFor(userId),
  ]);
  return { stamps: stamps.map(card), allowed: limitValue(limits, STAMP_COUNT_LIMIT) };
}
