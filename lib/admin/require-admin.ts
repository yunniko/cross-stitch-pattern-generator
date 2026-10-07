import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * The one admin check (G-117, D335), for `/admin`'s layout and every admin action. The session says who is signed in;
 * the database says whether that account is an admin now, so a demotion or a disabled account stops admin access at
 * once rather than when the session is next re-read.
 */
export async function currentAdmin(): Promise<{ id: string; email: string } | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const account = await prisma.user.findUnique({ where: { id }, select: { email: true, role: true, disabled: true } });
  if (!account || account.disabled || account.role !== "ADMIN") return null;
  return { id, email: account.email ?? "" };
}

/** For a server action: the admin acting, or an error that refuses the action. */
export async function requireAdmin(): Promise<{ id: string; email: string }> {
  const admin = await currentAdmin();
  if (!admin) throw new Error("Admin access required.");
  return admin;
}
