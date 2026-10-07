"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type AuthFormState } from "@/lib/auth/actions";
import { AuthCard, AuthError, AuthField, AuthNotice, AuthSubmitButton } from "@/app/components/auth/auth-form";

const INITIAL_STATE: AuthFormState = {};

/** `canReset`: sending is on, so a forgotten password can be reset by mail (G-113); otherwise the link is not offered. */
export function LoginForm({ notice, canReset }: { notice?: string; canReset: boolean }) {
  const [state, formAction] = useActionState(loginAction, INITIAL_STATE);
  return (
    <AuthCard title="Log in">
      <form action={formAction} noValidate>
        {state.error ? <AuthError message={state.error} /> : notice && <AuthNotice>{notice}</AuthNotice>}
        {state.unconfirmed && (
          <p className="-mt-2 mb-4 text-[13px] text-muted">
            No link, or it expired?{" "}
            <Link href="/confirm-address" className="text-accent hover:underline">
              Send it again
            </Link>
          </p>
        )}
        <AuthField id="email" name="email" label="Email" type="email" defaultValue={state.values?.email} autoComplete="email" />
        <AuthField id="password" name="password" label="Password" type="password" autoComplete="current-password" />
        {canReset && (
          <p className="-mt-2 mb-4 text-right text-[13px]">
            <Link href="/reset-password" className="text-accent hover:underline">
              Forgot your password?
            </Link>
          </p>
        )}
        <AuthSubmitButton>Log in</AuthSubmitButton>
      </form>
      <p className="mt-4 text-center text-[13px] text-muted">
        No account?{" "}
        <Link href="/register" className="text-accent hover:underline">
          Register
        </Link>
      </p>
    </AuthCard>
  );
}
