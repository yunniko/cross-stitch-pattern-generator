"use client";

import { createContext, useActionState, useContext, useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { openPortalAction, startCheckoutAction, type BillingActionState } from "@/lib/billing/actions";
import { withdrawAction } from "@/lib/billing/withdrawal-actions";
import { PillButton } from "@/app/components/ui";

/**
 * The Plan section's buttons (G-106 M3): each posts to its server action, which sends the person on to the provider's
 * page, or comes back with the reason it could not, shown beside the button.
 */

const INITIAL: BillingActionState = {};

function Submit({
  children,
  variant,
  label,
  disabled = false,
  pendingText = "Opening…",
}: {
  children: ReactNode;
  variant: "primary" | "outline";
  label?: string;
  disabled?: boolean;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <PillButton type="submit" variant={variant} size="md" disabled={pending || disabled} aria-label={label}>
      {pending ? pendingText : children}
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

interface Consent {
  termsVersionId: string;
  withdrawalVersionId: string;
  agreedTerms: boolean;
  agreedWithdrawal: boolean;
}

const ConsentContext = createContext<Consent | null>(null);

/**
 * The agreement asked before any plan is chosen (G-128 M2, D384): the terms in force, and the acknowledgment that the plan
 * starts at once and the right of withdrawal is lost, shown word for word. The Choose buttons inside stay off until both
 * are ticked, and post the versions shown, which the server checks against those in force.
 */
export function PlanConsent({
  termsVersionId,
  termsHref,
  termsLine,
  withdrawalVersionId,
  withdrawal,
  children,
}: {
  termsVersionId: string;
  termsHref: string;
  termsLine: string;
  withdrawalVersionId: string;
  /** The acknowledgment's text, drawn by the page. */
  withdrawal: ReactNode;
  children: ReactNode;
}) {
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedWithdrawal, setAgreedWithdrawal] = useState(false);
  const id = useId();
  return (
    <ConsentContext.Provider value={{ termsVersionId, withdrawalVersionId, agreedTerms, agreedWithdrawal }}>
      <fieldset className="m-0 flex flex-col gap-3 rounded-md border border-line p-3 text-[13px] text-ink" data-testid="plan-consent">
        <legend className="px-1 text-[13px] font-medium">Before choosing a plan</legend>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--at-accent)]"
          />
          <span>
            I agree to the{" "}
            <a href={termsHref} target="_blank" rel="noopener" className="text-accent underline">
              terms of service
            </a>{" "}
            ({termsLine}).
          </span>
        </label>
        <div className="flex items-start gap-2.5">
          <input
            id={`${id}-withdrawal`}
            type="checkbox"
            checked={agreedWithdrawal}
            onChange={(e) => setAgreedWithdrawal(e.target.checked)}
            aria-labelledby={`${id}-withdrawal-label`}
            aria-describedby={`${id}-withdrawal-text`}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--at-accent)]"
          />
          <div className="flex flex-col gap-1">
            <label id={`${id}-withdrawal-label`} htmlFor={`${id}-withdrawal`}>
              I agree to the following:
            </label>
            <div id={`${id}-withdrawal-text`} data-testid="plan-withdrawal-text">
              {withdrawal}
            </div>
          </div>
        </div>
      </fieldset>
      {children}
    </ConsentContext.Provider>
  );
}

/** Choose one price: Checkout for it opens, once the agreement above is given. */
export function ChoosePriceButton({ priceId, children, label }: { priceId: string; children: ReactNode; label: string }) {
  const [state, action] = useActionState(startCheckoutAction, INITIAL);
  const consent = useContext(ConsentContext);
  const agreed = consent !== null && consent.agreedTerms && consent.agreedWithdrawal;
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="priceId" value={priceId} />
      {consent && (
        <>
          <input type="hidden" name="termsVersionId" value={consent.termsVersionId} />
          <input type="hidden" name="withdrawalVersionId" value={consent.withdrawalVersionId} />
          {consent.agreedTerms && <input type="hidden" name="agreeTerms" value="on" />}
          {consent.agreedWithdrawal && <input type="hidden" name="agreeWithdrawal" value="on" />}
        </>
      )}
      <Submit variant="primary" label={label} disabled={!agreed}>
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

/**
 * Withdrawing from the contract (G-129 M2, D387): the button, then a confirmation step saying what happens, as Directive
 * 2023/2673 Art. 11a asks. Confirming ends the plan at once; the page then shows the acknowledgment.
 */
export function WithdrawButton({ estimate }: { estimate: string | null }) {
  const [state, action] = useActionState(withdrawAction, {});
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <PillButton type="button" variant="outline" size="md" onClick={() => setConfirming(true)}>
        Withdraw from contract
      </PillButton>
    );
  return (
    <form action={action} className="flex flex-col gap-2.5 rounded-md border border-warning-edge p-3" data-testid="plan-withdraw-confirm">
      <p className="m-0 text-[13px] text-ink">
        Withdrawing ends your plan now, and the account moves to the free plan; your charts are kept.{" "}
        {estimate
          ? `About ${estimate} is given back to the card you paid with, for the time your plan was not used.`
          : "The part of what you paid for the time your plan was not used is given back to the card you paid with."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Submit variant="primary" pendingText="Withdrawing…">
          Confirm withdrawal
        </Submit>
        <PillButton type="button" variant="outline" size="md" onClick={() => setConfirming(false)}>
          Keep my plan
        </PillButton>
      </div>
      <Refusal state={state} />
    </form>
  );
}

/** A withdrawal recorded but not finished, the provider having failed to answer: the same action finishes it. */
export function FinishWithdrawalButton() {
  const [state, action] = useActionState(withdrawAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-1.5">
      <Submit variant="primary" pendingText="Withdrawing…">
        Finish withdrawal
      </Submit>
      <Refusal state={state} />
    </form>
  );
}
