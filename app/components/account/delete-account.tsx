"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction, type AccountFormState } from "@/lib/auth/account-actions";
import { AuthField, AuthSubmitButton } from "@/app/components/auth/auth-form";
import { PillButton } from "@/app/components/ui";

const INITIAL_STATE: AccountFormState = {};

/**
 * Two steps, never a native `confirm()` (this app's own rule for its own users, same reasoning as the
 * charter's "never trigger a browser dialog" for browser automation: it blocks everything behind it and
 * cannot be styled, tested or read by a screen reader as part of the page). The second step asks for the
 * reader's own email, typed -- a plain "Are you sure?" button is too easy to click through on an action this
 * irreversible (G-075 M2).
 */
export function DeleteAccount({ email }: { email: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(deleteAccountAction, INITIAL_STATE);

  if (!confirming) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-danger">Deleting your account cannot be undone.</p>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-full border border-danger-strong bg-danger-edge px-4 py-1.5 text-sm text-on-danger hover:bg-danger-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          Delete account…
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <p className="text-[13px] text-danger">
        This deletes your account and everything tied to it. It cannot be undone. Type <strong>{email}</strong> to confirm.
      </p>
      <AuthField id="confirmEmail" name="confirmEmail" label="Your email" error={state.fieldErrors?.confirmEmail} />
      {state.error && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {state.error}
        </p>
      )}
      <div className="flex gap-3">
        <AuthSubmitButton className="border border-danger-strong bg-danger-edge px-4 py-1.5 text-sm text-on-danger hover:bg-danger-strong">
          Delete my account
        </AuthSubmitButton>
        <PillButton type="button" variant="outline" size="md" onClick={() => setConfirming(false)}>
          Cancel
        </PillButton>
      </div>
    </form>
  );
}
