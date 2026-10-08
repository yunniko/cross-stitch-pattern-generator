"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { openPortalAction, startCheckoutAction, type BillingActionState } from "@/lib/billing/actions";
import { PillButton } from "@/app/components/ui";

/**
 * The Plan section's buttons (G-106 M3): each posts to its server action, which sends the person on to the provider's
 * page, or comes back with the reason it could not, shown beside the button.
 */

const INITIAL: BillingActionState = {};

function Submit({ children, variant, label }: { children: ReactNode; variant: "primary" | "outline"; label?: string }) {
  const { pending } = useFormStatus();
  return (
    <PillButton type="submit" variant={variant} size="md" disabled={pending} aria-label={label}>
      {pending ? "Opening…" : children}
    </PillButton>
  );
}

function Refusal({ state }: { state: BillingActionState }) {
  return state.error ? (
    <p role="alert" className="m-0 text-[13px] text-danger">
      {state.error}
    </p>
  ) : null;
}

/** Choose one price: Checkout for it opens. */
export function ChoosePriceButton({ priceId, children, label }: { priceId: string; children: ReactNode; label: string }) {
  const [state, action] = useActionState(startCheckoutAction, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="priceId" value={priceId} />
      <Submit variant="primary" label={label}>
        {children}
      </Submit>
      <Refusal state={state} />
    </form>
  );
}

/** The provider's Portal: card, period, invoices, cancellation. */
export function ManageBillingButton() {
  const [state, action] = useActionState(openPortalAction, INITIAL);
  return (
    <form action={action} className="flex flex-col items-start gap-1.5">
      <Submit variant="outline">Manage billing</Submit>
      <Refusal state={state} />
    </form>
  );
}
