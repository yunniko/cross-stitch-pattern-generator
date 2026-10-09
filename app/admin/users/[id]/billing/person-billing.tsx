"use client";

import { useState, useTransition } from "react";
import { PillButton } from "@/app/components/ui";
import { movePersonPriceAction, refundPaymentAction, type SubscriptionActionResult } from "@/lib/admin/subscription-actions";
import { formatMoney } from "@/lib/billing/admin-view";
import type { RefundAsk } from "@/lib/billing/refund-rule";

/**
 * The admin's controls on one person's subscription (G-127 M2): refund a payment — all of it, the unused part of its
 * period, or an amount (G-129 M1, D386) — and move to the tier's current price.
 */

export interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  paidOn: string;
  refunded: number;
  disputed: boolean;
  /** The unused part of its period when the page was read; null when the period is not known. The action works it out anew. */
  unused: number | null;
  /** The day its period ends, when known. */
  paidUntil: string | null;
}

export function PersonBilling({
  userId,
  own,
  move,
  payments,
}: {
  userId: string;
  own: boolean;
  /** The tier's current price when it differs from the person's, and why they may not move to it, if they may not. */
  move: { to: string; refusal: string | null } | null;
  /** Null when there is no provider customer, or billing is off. */
  payments: PaymentRow[] | "unavailable" | null;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [kind, setKind] = useState<RefundAsk["kind"]>("all");
  const [typed, setTyped] = useState("");
  // One key per refund asked: sent twice, the same refund is made once at the provider.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<SubscriptionActionResult>) {
    setProblem(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setProblem(result.error);
      else {
        setNotice(result.done ?? null);
        setAsking(null);
        setRequestKey(crypto.randomUUID());
      }
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="person-billing">
      {problem && (
        <p role="alert" className="m-0 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {problem}
        </p>
      )}
      {notice && (
        <p role="status" className="m-0 rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-ink">
          {notice}
        </p>
      )}
      {own && <p className="m-0 text-[13px] text-muted">Your own subscription is not changed here; another admin changes it.</p>}

      {move && !own && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]" data-testid="person-move">
          {move.refusal ? (
            <span className="text-muted">
              The tier now offers {move.to}. {move.refusal}
            </span>
          ) : (
            <>
              <PillButton type="button" size="sm" disabled={pending} onClick={() => run(() => movePersonPriceAction(userId))}>
                Move to {move.to}
              </PillButton>
              <span className="text-muted">
                From the next renewal, with no charge now. The site does not tell them; tell them first if the price rises.
              </span>
            </>
          )}
        </div>
      )}

      <h2 className="m-0 mt-2 text-base font-semibold text-ink">Payments</h2>
      {payments === null ? (
        <p className="m-0 text-[13px] text-muted">No payments: nothing was ever bought at the payment provider.</p>
      ) : payments === "unavailable" ? (
        <p className="m-0 text-[13px] text-muted">The payment provider could not be reached, so the payments are not shown.</p>
      ) : payments.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">No payments taken.</p>
      ) : (
        <table className="w-full border-collapse text-[13px]" data-testid="person-payments">
          <thead>
            <tr className="text-left text-[11px] tracking-[0.06em] text-muted uppercase">
              <th className="py-1 pr-3 font-medium">Paid on</th>
              <th className="py-1 pr-3 font-medium">Amount</th>
              <th className="py-1 pr-3 font-medium">Refunded</th>
              <th className="py-1 font-medium">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => {
              const amount = formatMoney(payment.amount, payment.currency);
              const left = payment.amount - payment.refunded;
              return (
                <tr key={payment.id} className="border-t border-line" data-testid="person-payment">
                  <td className="py-1.5 pr-3 text-ink">{payment.paidOn}</td>
                  <td className="py-1.5 pr-3 text-ink">
                    {amount}
                    {payment.disputed && <span className="text-danger"> · disputed</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-ink">
                    {payment.refunded === 0 ? "—" : left === 0 ? "All" : formatMoney(payment.refunded, payment.currency)}
                  </td>
                  <td className="py-1.5 text-right">
                    {!own && left > 0 && asking !== payment.id && (
                      <PillButton
                        type="button"
                        size="xs"
                        disabled={pending}
                        aria-label={`Refund ${amount} of ${payment.paidOn}`}
                        onClick={() => {
                          setAsking(payment.id);
                          setKind("all");
                          setTyped("");
                        }}
                      >
                        Refund
                      </PillButton>
                    )}
                    {asking === payment.id && (
                      <fieldset className="m-0 inline-flex flex-col items-end gap-1.5 border-0 p-0" data-testid="refund-ask">
                        <legend className="sr-only">How much of the payment of {payment.paidOn} to give back</legend>
                        <label className="inline-flex items-center gap-1.5 text-ink">
                          <input type="radio" name={`refund-${payment.id}`} checked={kind === "all"} onChange={() => setKind("all")} />
                          All that is left, {formatMoney(left, payment.currency)}
                        </label>
                        {payment.unused !== null && payment.unused > 0 && (
                          <label className="inline-flex items-center gap-1.5 text-ink">
                            <input
                              type="radio"
                              name={`refund-${payment.id}`}
                              checked={kind === "unused"}
                              onChange={() => setKind("unused")}
                            />
                            The unused part, about {formatMoney(payment.unused, payment.currency)}
                            {payment.paidUntil && <span className="text-muted">(paid until {payment.paidUntil})</span>}
                          </label>
                        )}
                        <label className="inline-flex items-center gap-1.5 text-ink">
                          <input
                            type="radio"
                            name={`refund-${payment.id}`}
                            checked={kind === "amount"}
                            onChange={() => setKind("amount")}
                          />
                          An amount
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label="Amount to give back"
                            value={typed}
                            onChange={(event) => {
                              setTyped(event.target.value);
                              setKind("amount");
                            }}
                            className="w-20 rounded-md border border-control-line bg-surface px-2 py-0.5 text-[13px] text-ink"
                          />
                        </label>
                        <span className="inline-flex gap-1.5">
                          <PillButton
                            type="button"
                            size="xs"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                refundPaymentAction(userId, payment.id, requestKey, kind === "amount" ? { kind, text: typed } : { kind })
                              )
                            }
                          >
                            Confirm refund
                          </PillButton>
                          <PillButton type="button" size="xs" disabled={pending} onClick={() => setAsking(null)}>
                            Keep
                          </PillButton>
                        </span>
                      </fieldset>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
