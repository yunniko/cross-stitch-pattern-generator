import { prisma } from "@/lib/prisma";
import { LEGAL_KINDS, type LegalKind } from "./documents";

/** Reading the published documents (G-128 M1, D383). Server-only: it loads Prisma. */

export interface LegalVersionRow {
  id: string;
  kind: LegalKind;
  version: number;
  body: string;
  publishedAt: Date;
  publishedBy: string;
}

const SELECT = { id: true, kind: true, version: true, body: true, publishedAt: true, publishedBy: true } as const;

/** Every kind's version in force; a kind with none published is absent. */
export async function currentLegalVersions(): Promise<Partial<Record<LegalKind, LegalVersionRow>>> {
  const rows = await prisma.legalVersion.findMany({
    where: { kind: { in: [...LEGAL_KINDS] } },
    orderBy: { version: "desc" },
    distinct: ["kind"],
    select: SELECT,
  });
  return Object.fromEntries(rows.map((row) => [row.kind, row as LegalVersionRow]));
}

/** A kind's versions, newest first, without their text. */
export async function legalHistory(kind: LegalKind) {
  return prisma.legalVersion.findMany({
    where: { kind },
    orderBy: { version: "desc" },
    select: { version: true, publishedAt: true },
  });
}

/** One version of a kind, or its newest when `version` is null; null when there is none. */
export async function legalVersion(kind: LegalKind, version: number | null): Promise<LegalVersionRow | null> {
  const row = await prisma.legalVersion.findFirst({
    where: version === null ? { kind } : { kind, version },
    orderBy: { version: "desc" },
    select: SELECT,
  });
  return row as LegalVersionRow | null;
}
