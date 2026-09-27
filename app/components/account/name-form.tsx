"use client";

import { useActionState } from "react";
import { updateNameAction, type AccountFormState } from "@/lib/auth/account-actions";
import { AuthField, AuthSubmitButton } from "@/app/components/auth/auth-form";

const INITIAL_STATE: AccountFormState = {};

export function NameForm({ name }: { name: string }) {
  const [state, formAction] = useActionState(updateNameAction, INITIAL_STATE);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-1">
      <AuthField id="name" name="name" label="Name" defaultValue={name} autoComplete="name" error={state.fieldErrors?.name} />
      <div className="flex items-center gap-3">
        <AuthSubmitButton className="">Save name</AuthSubmitButton>
        {state.success && (
          <span role="status" className="text-[13px] text-accent">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}
