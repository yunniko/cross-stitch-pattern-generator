"use client";

import { useActionState, useRef } from "react";
import { changePasswordAction, type AccountFormState } from "@/lib/auth/account-actions";
import { AuthField, AuthSubmitButton } from "@/app/components/auth/auth-form";

const INITIAL_STATE: AccountFormState = {};

export function PasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(async (prev: AccountFormState, formData: FormData) => {
    const result = await changePasswordAction(prev, formData);
    // A failed attempt leaves both fields as typed, so a mistyped current password can just be fixed; a
    // successful one clears them, since there is nothing left to do with what was just typed.
    if (result.success) formRef.current?.reset();
    return result;
  }, INITIAL_STATE);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-1">
      <AuthField
        id="currentPassword"
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.currentPassword}
      />
      <AuthField
        id="newPassword"
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.newPassword}
      />
      <div className="flex items-center gap-3">
        <AuthSubmitButton className="">Change password</AuthSubmitButton>
        {state.success && (
          <span role="status" className="text-[13px] text-accent">
            Changed.
          </span>
        )}
      </div>
    </form>
  );
}
