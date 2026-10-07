"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { ACCOUNT_SCOPE } from "@/lib/admin/change-log";
import { logChange } from "@/lib/admin/change-log-data";
import { prisma } from "@/lib/prisma";

/**
 * `/admin/users`' actions (G-075 M3). Each checks the caller is an admin itself -- never trusting that only `/admin`'s
 * layout guard could have reached here -- and refuses to act on the caller's own account, so an admin can never demote
 * or disable the only session that could undo it. Each change is a line in the change log (G-107 M3, D348).
 */

async function changeAccount(userId: string, refusal: string, data: { role?: "ADMIN" | "USER"; disabled?: boolean }, said: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error(refusal);
  const user = await prisma.user.update({ where: { id: userId }, data, select: { email: true } });
  await logChange(admin, ACCOUNT_SCOPE, userId, `${user.email}: ${said}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/changes");
}

export async function promoteToAdminAction(userId: string): Promise<void> {
  await changeAccount(userId, "Already an admin.", { role: "ADMIN" }, "promoted to ADMIN");
}

export async function demoteToUserAction(userId: string): Promise<void> {
  await changeAccount(userId, "Can't demote your own account.", { role: "USER" }, "demoted to USER");
}

export async function setUserDisabledAction(userId: string, disabled: boolean): Promise<void> {
  await changeAccount(userId, "Can't disable your own account.", { disabled }, disabled ? "login disabled" : "login enabled");
}
