"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * `/admin/users`' row actions (G-075 M3). Each checks the caller is an admin itself -- never trusting that
 * only `/admin`'s layout guard could have reached here -- and refuses to act on the caller's own account, so
 * an admin can never demote or disable the only session that could undo it.
 */
async function requireAdmin(): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") throw new Error("Admin access required.");
  return { id: session.user.id };
}

export async function promoteToAdminAction(userId: string): Promise<void> {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("Already an admin.");
  await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
  revalidatePath("/admin/users");
}

export async function demoteToUserAction(userId: string): Promise<void> {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("Can't demote your own account.");
  await prisma.user.update({ where: { id: userId }, data: { role: "USER" } });
  revalidatePath("/admin/users");
}

export async function setUserDisabledAction(userId: string, disabled: boolean): Promise<void> {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("Can't disable your own account.");
  await prisma.user.update({ where: { id: userId }, data: { disabled } });
  revalidatePath("/admin/users");
}
