"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type AuthFormState } from "@/lib/auth/actions";
import { AuthCard, AuthError, AuthField, AuthSubmitButton } from "@/app/components/auth/auth-form";

const INITIAL_STATE: AuthFormState = {};

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, INITIAL_STATE);
  return (
    <AuthCard title="Log in">
      <form action={formAction} noValidate>
        {state.error && <AuthError message={state.error} />}
        <AuthField id="email" name="email" label="Email" type="email" defaultValue={state.values?.email} autoComplete="email" />
        <AuthField id="password" name="password" label="Password" type="password" autoComplete="current-password" />
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
