"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { nameError, normalizeName, passwordError } from "@/lib/auth/validation";

/**
 * The personal cabinet's own actions (G-075 M2): change name, change password, delete the account. Separate
 * from `lib/auth/actions.ts` (register/login/logout, which run with no session) because every one of these
 * requires one and reads it as the source of truth for *which* account changes -- never an id a form field
 * could be made to carry.
 */

export interface AccountFormState {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "currentPassword" | "newPassword" | "confirmEmail", string>>;
  success?: boolean;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in.");
  return session.user.id;
}

export async function updateNameAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const userId = await requireUserId();
  const name = normalizeName(formData.get("name"));
  const err = nameError(name);
  if (err) return { fieldErrors: { name: err } };

  await prisma.user.update({ where: { id: userId }, data: { name: name || null } });
  revalidatePath("/account");
  return { success: true };
}

export async function changePasswordAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const userId = await requireUserId();
  const currentPassword = typeof formData.get("currentPassword") === "string" ? (formData.get("currentPassword") as string) : "";
  const newPassword = typeof formData.get("newPassword") === "string" ? (formData.get("newPassword") as string) : "";

  const newPasswordErr = passwordError(newPassword);
  if (newPasswordErr) return { fieldErrors: { newPassword: newPasswordErr } };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { fieldErrors: { currentPassword: "That's not your current password." } };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { success: true };
}

/**
 * Deletes the signed-in account and everything the schema cascades from it (`Account`, `Session`,
 * `Subscription`) in one statement, then signs out. The reader must type their own email first — a plain
 * "Are you sure?" is too easy to click through on an action this irreversible, and this needs no
 * confirmation dialog (never trigger a native `confirm()` -- see `lib/auth/validation.ts`'s neighbours for
 * why nothing here uses one).
 */
export async function deleteAccountAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in.");

  const typed = typeof formData.get("confirmEmail") === "string" ? (formData.get("confirmEmail") as string).trim().toLowerCase() : "";
  if (typed !== session.user.email?.toLowerCase()) {
    return { fieldErrors: { confirmEmail: "Type your email exactly to confirm." } };
  }

  await prisma.user.delete({ where: { id: session.user.id } });
  await signOut({ redirectTo: "/" });
  return {};
}
