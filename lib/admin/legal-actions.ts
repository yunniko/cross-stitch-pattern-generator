"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { adminAction } from "@/lib/admin/admin-action";
import { logChange } from "@/lib/admin/change-log-data";
import { LEGAL_SCOPE } from "@/lib/admin/change-log";
import { LEGAL_INFO, PUBLISH_REFUSED, isLegalKind, publishCheck } from "@/lib/legal/documents";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "./feature-actions";

/**
 * Publishing a new version of a legal document (G-128 M1, D383). The admin's text was written over version `basedOn`;
 * if another was published since, it is refused, and two publishing at once cannot both take a number: the second meets
 * the unique (kind, version) and is told the same. A published version is never edited.
 */
export async function publishLegalVersionAction(kind: string, body: string, basedOn: number): Promise<ActionResult> {
  return adminAction(
    async (admin): Promise<ActionResult> => {
      if (!isLegalKind(kind)) return { error: "There is no such document." };
      const latest = await prisma.legalVersion.findFirst({
        where: { kind },
        orderBy: { version: "desc" },
        select: { version: true, body: true },
      });
      const checked = publishCheck({ body: String(body ?? ""), basedOn: Number(basedOn), latest });
      if ("error" in checked) return { error: checked.error };
      try {
        await prisma.legalVersion.create({ data: { kind, version: checked.version, body: checked.body, publishedBy: admin.email } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: PUBLISH_REFUSED.stale };
        throw error;
      }
      await logChange(admin, LEGAL_SCOPE, kind, `${LEGAL_INFO[kind].label}: version ${checked.version} published`);
      revalidatePath("/admin/legal");
      revalidatePath("/admin/changes");
      if (LEGAL_INFO[kind].path) revalidatePath(LEGAL_INFO[kind].path);
      return {};
    },
    { fallback: "The version was not published." }
  );
}
