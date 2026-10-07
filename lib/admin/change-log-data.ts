import { prisma } from "@/lib/prisma";
import { scopesOf, type ChangeGroupId } from "./change-log";

/** One line in the change log: who changed what (G-102 M3; every admin change since G-107 M3, D348). */
export async function logChange(admin: { id: string; email: string }, scope: string, subject: string, change: string): Promise<void> {
  await prisma.featureChange.create({ data: { scope, subject, change, byUserId: admin.id, byEmail: admin.email } });
}

/** The latest changes, newest first, of the given stored scopes (all when null). */
export async function latestChanges(scopes: readonly string[] | null, take: number) {
  return prisma.featureChange.findMany({
    where: scopes ? { scope: { in: [...scopes] } } : {},
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** The latest changes of one Change-log group (all when null). */
export function changesOfGroup(group: ChangeGroupId | null, take: number) {
  return latestChanges(scopesOf(group), take);
}
