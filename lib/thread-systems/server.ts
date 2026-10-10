import { featureUsable, type FeatureStates } from "@/lib/features/features";
import { prisma } from "@/lib/prisma";
import type { ThreadSystemInfo } from "@/lib/threads/thread-brands";
import { namedSystems, systemFeatures, threadColors, type RequestSystem, type ThreadRow } from "./thread-system";
import type { Feature } from "@/lib/features/features";

/**
 * Thread systems on the server (G-132, D400): read from the table on every use, never from the browser's registry, which
 * the server does not load (requests of different people share this module). What a request is generated in is always
 * what the table says, whatever the browser sent.
 */

const SITE = { ownerId: null } as const;
const ORDER = [{ position: "asc" }, { key: "asc" }] as const;

/** The systems offered, as a page loads them, in the order offered: the site's (a person's own come with G-132 M4). */
export async function threadSystemsFor(): Promise<ThreadSystemInfo[]> {
  const rows = await prisma.threadSystem.findMany({
    where: SITE,
    orderBy: [...ORDER],
    select: { key: true, label: true, note: true, threads: true },
  });
  return rows.map((row) => ({
    id: row.key,
    label: row.label,
    ...(row.note ? { note: row.note } : {}),
    colors: threadColors(JSON.parse(row.threads) as ThreadRow[]),
  }));
}

/**
 * The systems a generation or prediction request names, read from the table, for the server to put in the request: the
 * palette mode's, the set's, and those of the set's colours, each only when its switch lets this person use it. A system
 * not given is one the pipeline refuses to generate in by name.
 */
export async function requestSystemsFor(body: Record<string, unknown>, states: FeatureStates): Promise<RequestSystem[]> {
  const keys = namedSystems(body).filter((key) => featureUsable(states, `brand.${key}`));
  if (keys.length === 0) return [];
  const rows = await prisma.threadSystem.findMany({
    where: { ...SITE, key: { in: keys } },
    orderBy: [...ORDER],
    select: { key: true, threads: true },
  });
  return rows.map((row) => ({ key: row.key, threads: JSON.parse(row.threads) as ThreadRow[] }));
}

/** Each system's key and the name a printed chart gives it, for an export to print (a key not here is printed as stored). */
export async function systemLabelsFor(): Promise<[string, string][]> {
  const rows = await prisma.threadSystem.findMany({ where: SITE, orderBy: [...ORDER], select: { key: true, label: true } });
  return rows.map((row) => [row.key, row.label]);
}

/** The site systems' switches (`brand.<key>`), for the admin's feature lists. */
export async function systemFeaturesFor(): Promise<Feature[]> {
  return systemFeatures((await systemLabelsFor()).map(([key, label]) => ({ key, label })));
}

/**
 * `body` as the processor is to be given it: without anything the browser sent as systems or labels, and with what the
 * table holds instead. Text in, text out, so a body that is not JSON goes on as sent, for the processor to refuse.
 */
export async function withThreadSystems(
  text: string,
  add: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
): Promise<string> {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return text;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return text;
  const rest = { ...(body as Record<string, unknown>) };
  delete rest.threadSystems;
  delete rest.systemLabels;
  return JSON.stringify({ ...rest, ...(await add(rest)) });
}
