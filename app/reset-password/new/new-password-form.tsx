"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setNewPasswordAction, type LinkFormState } from "@/lib/auth/link-actions";
import { AuthCard, AuthError, AuthField, AuthSubmitButton } from "@/app/components/auth/auth-form";

const INITIAL_STATE: LinkFormState = {};

export function NewPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(setNewPasswordAction, INITIAL_STATE);
  return (
    <AuthCard title="Set a new password">
      <form action={formAction} noValidate>
        {state.error && <AuthError message={state.error} />}
        <input type="hidden" name="token" value={token} />
        <AuthField
          id="password"
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          error={state.fieldErrors?.password}
        />
        <p className="-mt-2 mb-4 text-[13px] text-muted">Setting it signs your account out everywhere else.</p>
        <AuthSubmitButton>Set the password</AuthSubmitButton>
      </form>
      {state.error && (
        <p className="mt-4 text-center text-[13px] text-muted">
          <Link href="/reset-password" className="text-accent hover:underline">
            Ask for a new link
          </Link>
        </p>
      )}
    </AuthCard>
  );
}
