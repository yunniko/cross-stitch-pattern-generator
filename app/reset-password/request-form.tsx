"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestResetAction, type LinkFormState } from "@/lib/auth/link-actions";
import { AuthCard, AuthError, AuthField, AuthNotice, AuthSubmitButton } from "@/app/components/auth/auth-form";

const INITIAL_STATE: LinkFormState = {};

export function RequestResetForm({ available }: { available: boolean }) {
  const [state, formAction] = useActionState(requestResetAction, INITIAL_STATE);
  if (state.sent) {
    return (
      <AuthCard title="Check your email">
        <AuthNotice>
          If <strong>{state.sent}</strong> has an account, a link to set a new password is on its way to it. The link works for one hour.
        </AuthNotice>
        <BackToLogin />
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Forgot your password?">
      {!available ? (
        <AuthNotice>
          Email is not available on this site yet, so a password cannot be reset by mail. If you are signed in, change it from your account
          page.
        </AuthNotice>
      ) : (
        <form action={formAction} noValidate>
          {state.error && <AuthError message={state.error} />}
          <p className="mb-4 text-sm text-muted">
            Enter the address you registered with, and we will send it a link to set a new password.
          </p>
          <AuthField
            id="email"
            name="email"
            label="Email"
            type="email"
            defaultValue={state.values?.email}
            autoComplete="email"
            error={state.fieldErrors?.email}
          />
          <AuthSubmitButton>Send the link</AuthSubmitButton>
        </form>
      )}
      <BackToLogin />
    </AuthCard>
  );
}

function BackToLogin() {
  return (
    <p className="mt-4 text-center text-[13px] text-muted">
      <Link href="/login" className="text-accent hover:underline">
        Back to log in
      </Link>
    </p>
  );
}
