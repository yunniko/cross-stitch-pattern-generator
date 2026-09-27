"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { authRateLimited, clientIp } from "@/lib/server/request-guard";
import { emailError, nameError, normalizeEmail, normalizeName, passwordError } from "@/lib/auth/validation";

/**
 * Register, log in, log out (G-075). Server actions, not a Route Handler under `app/api/` (D245): the same
 * shape `listing-studio` and `arfid-meals` already use for the same reason -- a form's `useActionState` wants
 * a typed result, not a response to parse, and there is no hand-rolled fetch layer to keep in step.
 */

export interface AuthFormState {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "password", string>>;
  /** Echoes what was submitted, since a failed action re-renders the form and would otherwise clear it. */
  values?: { name?: string; email?: string };
}

async function requestAddress(): Promise<string> {
  const h = await headers();
  return clientIp(new Request("http://internal", { headers: h }));
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { name: normalizeName(formData.get("name")), email: normalizeEmail(formData.get("email")) };
  const password = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";

  const address = await requestAddress();
  const limited = authRateLimited(address);
  if (!limited.ok) return { error: "Too many attempts. Try again in a few minutes.", values };

  const fieldErrors: AuthFormState["fieldErrors"] = {};
  const nameErr = nameError(values.name);
  const emailErr = emailError(values.email);
  const passwordErr = passwordError(password);
  if (nameErr) fieldErrors.name = nameErr;
  if (emailErr) fieldErrors.email = emailErr;
  if (passwordErr) fieldErrors.password = passwordErr;
  if (Object.keys(fieldErrors).length > 0) return { error: "Check the highlighted fields.", fieldErrors, values };

  const existing = await prisma.user.findUnique({ where: { email: values.email } });
  if (existing) return { error: "An account with that email already exists.", values };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email: values.email, name: values.name || null, passwordHash },
  });

  try {
    await signIn("credentials", { email: values.email, password, redirectTo: "/account" });
    return {};
  } catch (error) {
    // signIn signals a successful redirect by throwing Next's own redirect error -- let that one through.
    if (error instanceof AuthError) return { error: "Registered, but signing in failed. Try logging in.", values };
    throw error;
  }
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: normalizeEmail(formData.get("email")) };
  const password = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";

  const address = await requestAddress();
  const limited = authRateLimited(address);
  if (!limited.ok) return { error: "Too many attempts. Try again in a few minutes.", values };

  try {
    await signIn("credentials", { email: values.email, password, redirectTo: "/account" });
    return {};
  } catch (error) {
    if (error instanceof AuthError) return { error: "Invalid email or password.", values };
    throw error;
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
