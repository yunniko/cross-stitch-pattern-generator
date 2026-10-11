"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/admin/admin-action";
import { logChange } from "@/lib/admin/change-log-data";
import { formatLimit, limitById, parseLimitInput, toColumn } from "@/lib/limits/limits";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "./feature-actions";

/**
 * The admin's limits (G-108 M1, D353): one value per limit for the site, for guests, for signed-in accounts, for a tier or
 * for one person. "inherit" removes the layer's row, so the layer below wins; "unlimited" or a whole number sets it. Each
 * change is checked as an admin's, and logged under the scope its feature-state twin is (SITE, AUDIENCE, TIER, USER).
 */

export type LimitLayer =
  | { kind: "site" }
  | { kind: "audience"; audience: "guests" | "accounts" }
  | { kind: "tier"; tierId: string }
  | { kind: "user"; userId: string };

export async function setLimitAction(layer: LimitLayer, limitId: string, input: string): Promise<ActionResult> {
  return adminAction(async (admin): Promise<ActionResult> => {
    const limit = limitById(limitId);
    if (!limit) return { error: "That is not a limit." };
    const parsed = input === "inherit" ? null : parseLimitInput(limit, input);
    if (parsed && "error" in parsed) return { error: parsed.error };
    const value = parsed ? toColumn(parsed.value) : undefined;
    const said = parsed ? formatLimit(limit, parsed.value) : "as the layer below";
    const by = { updatedBy: admin.email };

    switch (layer.kind) {
      case "site":
        if (value === undefined) await prisma.siteLimit.deleteMany({ where: { limitId } });
        else await prisma.siteLimit.upsert({ where: { limitId }, create: { limitId, value, ...by }, update: { value, ...by } });
        await logChange(admin, "SITE", "", `${limitId} → ${parsed ? said : `${formatLimit(limit, limit.siteDefault)} (default)`}`);
        break;
      case "audience": {
        const { audience } = layer;
        if (audience !== "guests" && audience !== "accounts") return { error: "That is not an audience." };
        if (value === undefined) await prisma.audienceLimit.deleteMany({ where: { audience, limitId } });
        else
          await prisma.audienceLimit.upsert({
            where: { audience_limitId: { audience, limitId } },
            create: { audience, limitId, value, ...by },
            update: { value, ...by },
          });
        await logChange(admin, "AUDIENCE", audience, `${audience}: ${limitId} → ${said}`);
        break;
      }
      case "tier": {
        const { tierId } = layer;
        const tier = await prisma.tier.findUnique({ where: { id: tierId }, select: { name: true } });
        if (!tier) return { error: "No such tier." };
        if (value === undefined) await prisma.tierLimit.deleteMany({ where: { tierId, limitId } });
        else
          await prisma.tierLimit.upsert({
            where: { tierId_limitId: { tierId, limitId } },
            create: { tierId, limitId, value, ...by },
            update: { value, ...by },
          });
        await logChange(admin, "TIER", tierId, `tier "${tier.name}": ${limitId} → ${said}`);
        break;
      }
      case "user": {
        const { userId } = layer;
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!user) return { error: "No such account." };
        if (value === undefined) await prisma.userLimit.deleteMany({ where: { userId, limitId } });
        else
          await prisma.userLimit.upsert({
            where: { userId_limitId: { userId, limitId } },
            create: { userId, limitId, value, ...by },
            update: { value, ...by },
          });
        await logChange(admin, "USER", userId, `${user.email}: ${limitId} → ${said}`);
        revalidatePath(`/admin/users/${userId}/features`);
        break;
      }
      default:
        return { error: "That is not a layer." };
    }
    revalidatePath("/admin/features");
    revalidatePath("/admin/changes");
    return {};
  });
}
