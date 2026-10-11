import { type LimitValue } from "@/lib/limits/limits";
import { accountResource, readBoundedJson, Refused } from "@/lib/server/account-resource";
import { prisma } from "@/lib/prisma";
import {
  OWN_SYSTEM_MAX_BYTES,
  OWN_SYSTEMS_FEATURE,
  OWN_SYSTEMS_LIMIT,
  ownSystemCountRefusal,
  ownSystemKey,
  readOwnSystemUpload,
  type OwnSystem,
} from "./own-system";
import { systemDetails, type ThreadRow } from "./thread-system";

/**
 * The database half of a person's own thread systems (G-132 M4, D402), for the routes under `/api/thread-systems`. Shaped
 * as palettes' (`lib/palettes/server.ts`): a refusal is a `Refused`, a person's uploads run one at a time (a lock on their
 * account row) so the count check sees what the other left, and anyone but the owner is answered as if the system did not
 * exist. Deleting the account deletes them (the owner relation cascades).
 */

/** Every request needs the feature: `ownSystems.requireAccount()`. */
export const ownSystems = accountResource({
  log: "thread systems",
  unavailable: "Thread systems are unavailable right now. Try again in a moment.",
  signIn: "Sign in to keep thread systems with your account.",
  feature: { id: OWN_SYSTEMS_FEATURE, refused: "Thread systems of your own are not available to you.", limit: OWN_SYSTEMS_LIMIT },
});

const NOT_FOUND = "That thread system is not among yours.";

/** An upload's body, refused when too large or not a list of threads. */
export async function readOwnSystemBody(req: Request): Promise<Exclude<ReturnType<typeof readOwnSystemUpload>, { error: string }>> {
  const body = await readBoundedJson(
    req,
    OWN_SYSTEM_MAX_BYTES,
    () => new Refused(413, "That file is too large to keep."),
    "That is not a thread system."
  );
  const read = readOwnSystemUpload(body);
  if ("error" in read) throw new Refused(422, read.error);
  return read;
}

const ROW = { id: true, key: true, label: true, note: true, source: true, licence: true, threads: true, updatedAt: true } as const;

type Row = {
  id: string;
  key: string;
  label: string;
  note: string | null;
  source: string | null;
  licence: string | null;
  threads: string;
  updatedAt: Date;
};

function ownSystem({ threads, updatedAt, ...row }: Row): OwnSystem {
  return { ...row, threads: JSON.parse(threads) as ThreadRow[], savedAt: updatedAt.toISOString() };
}

/** Keeps a new system under a key made from its name, counted against the limit. */
export async function createOwnSystem(
  userId: string,
  allowed: LimitValue,
  body: Awaited<ReturnType<typeof readOwnSystemBody>>
): Promise<OwnSystem> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const keys = (await tx.threadSystem.findMany({ where: { ownerId: userId }, select: { key: true } })).map((row) => row.key);
    const refusal = ownSystemCountRefusal(keys.length, allowed);
    if (refusal) throw new Refused(403, refusal, { reason: "limit" });
    const row = await tx.threadSystem.create({
      data: {
        ownerId: userId,
        key: ownSystemKey(body.details.label, new Set(keys)),
        ...body.details,
        threads: JSON.stringify(body.threads),
        threadCount: body.threads.length,
      },
      select: ROW,
    });
    return ownSystem(row);
  });
}

async function ownedId(tx: Pick<typeof prisma, "threadSystem">, id: string, userId: string): Promise<void> {
  const row = await tx.threadSystem.findUnique({ where: { id }, select: { ownerId: true } });
  if (!row || row.ownerId !== userId) throw new Refused(404, NOT_FOUND);
}

/** Renames a system. Its key stays, so the person's charts still name it. */
export async function renameOwnSystem(userId: string, id: string, name: unknown): Promise<OwnSystem> {
  const details = systemDetails({ label: name });
  if ("error" in details) throw new Refused(422, details.error);
  return prisma.$transaction(async (tx) => {
    await ownedId(tx, id, userId);
    return ownSystem(await tx.threadSystem.update({ where: { id }, data: { label: details.label }, select: ROW }));
  });
}

/** Deletes a system. A chart keeps its colours, by number and system, edited with the common picker (G-132 AC2). */
export async function deleteOwnSystem(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await ownedId(tx, id, userId);
    await tx.threadSystem.delete({ where: { id } });
  });
}

/** The person's systems, oldest first (the order the editor offers them), with how many they may keep. */
export async function listOwnSystems(userId: string, allowed: LimitValue): Promise<{ systems: OwnSystem[]; allowed: LimitValue }> {
  const rows = await prisma.threadSystem.findMany({
    where: { ownerId: userId },
    orderBy: [{ createdAt: "asc" }, { key: "asc" }],
    select: ROW,
  });
  return { systems: rows.map(ownSystem), allowed };
}
