import { featureUsable, type FeatureStates } from "@/lib/features/features";
import { prisma } from "@/lib/prisma";
import type { ThreadSystemInfo } from "@/lib/threads/thread-brands";
import {
  namedSystems,
  OWN_KEY_PREFIX,
  OWN_SYSTEMS_FEATURE,
  systemFeature,
  systemFeatures,
  threadColors,
  type RequestSystem,
  type ThreadRow,
} from "./thread-system";
import type { Feature } from "@/lib/features/features";

/**
 * Thread systems on the server (G-132, D400): read from the table on every use, never from the browser's registry, which
 * the server does not load (requests of different people share this module). What a request is generated in is always
 * what the table says, whatever the browser sent.
 *
 * A person's own systems (M4, D402) are read with the site's wherever that person is the one asking, and only while their
 * switch (`threads.custom`) lets them use them; nobody else's are ever read.
 */

const SITE = { ownerId: null } as const;
const ORDER = [{ position: "asc" }, { key: "asc" }] as const;
const OWN_ORDER = [{ createdAt: "asc" }, { key: "asc" }] as const;

/** The systems offered, as a page loads them, in the order offered: the site's, then the person's own. */
export async function threadSystemsFor(userId: string | null, states: FeatureStates): Promise<ThreadSystemInfo[]> {
  const select = { key: true, label: true, note: true, threads: true } as const;
  const [site, own] = await Promise.all([
    prisma.threadSystem.findMany({ where: SITE, orderBy: [...ORDER], select }),
    userId && mayUseOwnSystems(userId, states)
      ? prisma.threadSystem.findMany({ where: { ownerId: userId }, orderBy: [...OWN_ORDER], select })
      : [],
  ]);
  const info = (row: (typeof site)[number], isOwn: boolean): ThreadSystemInfo => ({
    id: row.key,
    label: row.label,
    ...(row.note ? { note: row.note } : {}),
    colors: threadColors(JSON.parse(row.threads) as ThreadRow[]),
    ...(isOwn ? { own: true as const } : {}),
  });
  return [...site.map((row) => info(row, false)), ...own.map((row) => info(row, true))];
}

/** Whether this person keeps and uses systems of their own: signed in, with the switch on. */
export function mayUseOwnSystems(userId: string | null, states: FeatureStates): boolean {
  return userId !== null && featureUsable(states, OWN_SYSTEMS_FEATURE);
}

/**
 * The systems a generation or prediction request names, read from the table, for the server to put in the request: the
 * palette mode's, the set's, and those of the set's colours, each only when its switch lets this person use it. A system
 * not given is one the pipeline refuses to generate in by name.
 */
export async function requestSystemsFor(
  body: Record<string, unknown>,
  states: FeatureStates,
  userId: string | null
): Promise<RequestSystem[]> {
  const keys = namedSystems(body).filter((key) => featureUsable(states, systemFeature(key)));
  const siteKeys = keys.filter((key) => !key.startsWith(OWN_KEY_PREFIX));
  const ownKeys = userId ? keys.filter((key) => key.startsWith(OWN_KEY_PREFIX)) : [];
  if (siteKeys.length + ownKeys.length === 0) return [];
  const rows = await prisma.threadSystem.findMany({
    where: { OR: [{ ...SITE, key: { in: siteKeys } }, ...(userId ? [{ ownerId: userId, key: { in: ownKeys } }] : [])] },
    orderBy: [...ORDER],
    select: { key: true, threads: true },
  });
  return rows.map((row) => ({ key: row.key, threads: JSON.parse(row.threads) as ThreadRow[] }));
}

/**
 * Each system's key and the name a printed chart gives it, for an export to print (a key not here is printed as stored):
 * the site's, and the asker's own, whatever their switch, since a chart made in one is theirs to print by its name.
 */
export async function systemLabelsFor(userId: string | null): Promise<[string, string][]> {
  const rows = await prisma.threadSystem.findMany({
    where: userId ? { OR: [SITE, { ownerId: userId }] } : SITE,
    orderBy: [...ORDER],
    select: { key: true, label: true },
  });
  return rows.map((row) => [row.key, row.label]);
}

/** The site systems' switches (`brand.<key>`), for the admin's feature lists. */
export async function systemFeaturesFor(): Promise<Feature[]> {
  return systemFeatures((await systemLabelsFor(null)).map(([key, label]) => ({ key, label })));
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
