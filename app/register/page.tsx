"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type AuthFormState } from "@/lib/auth/actions";
import { AuthCard, AuthError, AuthField, AuthNotice, AuthSubmitButton } from "@/app/components/auth/auth-form";

const INITIAL_STATE: AuthFormState = {};

export default function RegisterPage() {
  const [state, formAction] = useActionState(registerAction, INITIAL_STATE);
  if (state.sent) {
    // The same words whether the address was new or already had an account (D344): its mailbox is told which.
    return (
      <AuthCard title="Check your email">
        <AuthNotice>
          We sent a message to <strong>{state.sent}</strong>. Open the link in it to confirm the address, then log in. The link works for 48
          hours.
        </AuthNotice>
        <p className="mt-4 text-center text-[13px] text-muted">
          No message?{" "}
          <Link href="/confirm-address" className="text-accent hover:underline">
            Send it again
          </Link>
        </p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Register">
      {/* noValidate: field errors are server-rendered (fieldErrors above), consistently across browsers and
          readable by a screen reader as text -- a native "include an @" tooltip would be neither. */}
      <form action={formAction} noValidate>
        {state.error && <AuthError message={state.error} />}
        <AuthField
          id="name"
          name="name"
          label="Name (optional)"
          defaultValue={state.values?.name}
          autoComplete="name"
          error={state.fieldErrors?.name}
        />
        <AuthField
          id="email"
          name="email"
          label="Email"
          type="email"
          defaultValue={state.values?.email}
          autoComplete="email"
          error={state.fieldErrors?.email}
        />
        <AuthField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          error={state.fieldErrors?.password}
        />
        <AuthSubmitButton>Register</AuthSubmitButton>
      </form>
      <p className="mt-4 text-center text-[13px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
