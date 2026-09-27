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
      <PillButton type="button" variant="outline" size="md" onClick={() => setConfirming(true)}>
        Delete account…
      </PillButton>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3 rounded-md border border-red-900/60 bg-red-950/20 p-3">
      <p className="text-[13px] text-red-300">
        This deletes your account and everything tied to it. It cannot be undone. Type <strong>{email}</strong> to confirm.
      </p>
      <AuthField id="confirmEmail" name="confirmEmail" label="Your email" error={state.fieldErrors?.confirmEmail} />
      <div className="flex gap-3">
        <AuthSubmitButton className="border border-red-800 bg-red-900 px-4 py-1.5 text-sm text-red-50 hover:bg-red-800">
          Delete my account
        </AuthSubmitButton>
        <PillButton type="button" variant="outline" size="md" onClick={() => setConfirming(false)}>
          Cancel
        </PillButton>
      </div>
    </form>
  );
}
