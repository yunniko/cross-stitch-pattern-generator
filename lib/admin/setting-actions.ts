"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { logChange } from "@/lib/admin/change-log-data";
import { SETTING_SCOPE } from "@/lib/admin/change-log";
import { prisma } from "@/lib/prisma";
import { parseSiteSetting, siteSettingDefinition } from "@/lib/settings/site-settings";
import type { ActionResult } from "./feature-actions";

/**
 * The admin's site settings (G-126 M2, D374): one whole number per setting, checked against its range. "default" removes
 * the row, so the setting takes its default again. Each change is checked as an admin's and logged under SETTING.
 */
export async function setSiteSettingAction(id: string, input: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const definition = siteSettingDefinition(id);
    if (!definition) return { error: "There is no such setting." };
    if (input === "default") {
      await prisma.siteSetting.deleteMany({ where: { key: id } });
      await logChange(admin, SETTING_SCOPE, id, `${id} → ${definition.default} ${definition.unit} (default)`);
    } else {
      const parsed = parseSiteSetting(id, input);
      if ("error" in parsed) return { error: parsed.error };
      const by = { updatedBy: admin.email };
      await prisma.siteSetting.upsert({
        where: { key: id },
        create: { key: id, value: parsed.value, ...by },
        update: { value: parsed.value, ...by },
      });
      await logChange(admin, SETTING_SCOPE, id, `${id} → ${parsed.value} ${definition.unit}`);
    }
    revalidatePath("/admin/settings");
    revalidatePath("/admin/changes");
    return {};
  } catch (error) {
    // A refusal travels as `error`, never thrown: production replaces a thrown message with a generic one (feature-actions).
    return { error: error instanceof Error ? error.message : "The change was refused." };
  }
}
