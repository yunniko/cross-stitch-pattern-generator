"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resendConfirmationAction, type LinkFormState } from "@/lib/auth/link-actions";
import { AuthCard, AuthError, AuthField, AuthNotice, AuthSubmitButton } from "@/app/components/auth/auth-form";

const INITIAL_STATE: LinkFormState = {};

export function ResendConfirmationForm({ problem, available }: { problem?: string; available: boolean }) {
  const [state, formAction] = useActionState(resendConfirmationAction, INITIAL_STATE);
  if (state.sent) {
    return (
      <AuthCard title="Check your email">
        <AuthNotice>
          If <strong>{state.sent}</strong> has an account waiting to be confirmed, a new link is on its way to it. Open it to confirm the
          address, then log in.
        </AuthNotice>
        <BackToLogin />
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Confirm your email address">
      {!available ? (
        <AuthNotice>Email is not available on this site yet, so there is nothing to confirm: log in as usual.</AuthNotice>
      ) : (
        <form action={formAction} noValidate>
          {(state.error ?? problem) && <AuthError message={state.error ?? problem ?? ""} />}
          <AuthField
            id="email"
            name="email"
            label="Email"
            type="email"
            defaultValue={state.values?.email}
            autoComplete="email"
            error={state.fieldErrors?.email}
          />
          <AuthSubmitButton>Send the link again</AuthSubmitButton>
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
