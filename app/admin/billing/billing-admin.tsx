"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PillButton } from "@/app/components/ui";
import { createPriceAction, deleteTierAction, makePriceCurrentAction, withdrawPriceAction } from "@/lib/admin/billing-actions";
import { createTierAction, type ActionResult } from "@/lib/admin/feature-actions";
import { movePriceHoldersAction, type SubscriptionActionResult } from "@/lib/admin/subscription-actions";
import { PRICE_CURRENCIES } from "@/lib/billing/catalog";

/** The admin's tiers and prices (G-127 M1, D380), and moving the people on an old price to the current one (M2, D381). */

type Result = ActionResult | SubscriptionActionResult;

export interface BillingTierRow {
  id: string;
  name: string;
  setName: string | null;
  productId: string | null;
  /** How many people's subscription rows name the tier: one that anyone has had is never deleted (D382). */
  people: number;
  prices: Array<{ id: string; label: string; interval: "MONTH" | "YEAR"; current: boolean; subscribers: number; made: string }>;
}

const FIELD = "rounded-md border border-control-line bg-control px-3 py-1.5 text-sm text-ink outline-none focus:border-accent";

export function BillingAdmin({ tiers, billingOn }: { tiers: BillingTierRow[]; billingOn: boolean }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<Result>, then?: () => void) {
    setProblem(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setProblem(result.error);
      else {
        if ("done" in result && result.done) setNotice(result.done);
        then?.();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="billing-admin">
      {!billingOn && (
        <p className="m-0 rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-muted" data-testid="billing-off">
          Billing is off on this server, so prices cannot be made or changed here. The tiers below can still be given by hand from a
          person&apos;s panel under Users.
        </p>
      )}
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
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement;
          const name = input.value;
          run(
            () => createTierAction(name),
            () => {
              input.value = "";
            }
          );
        }}
      >
        <input name="name" aria-label="New tier's name" placeholder="A name for a new tier" className={FIELD} maxLength={60} required />
        <PillButton type="submit" size="sm" disabled={pending}>
          Make a tier
        </PillButton>
        <span className="text-[13px] text-muted">
          What a tier unlocks is its feature set, chosen under{" "}
          <Link href="/admin/features" className="text-accent hover:underline">
            Features
          </Link>
          .
        </span>
      </form>
      {tiers.length === 0 && <p className="m-0 text-[13px] text-muted">No tiers yet.</p>}
      {tiers.map((tier) => (
        <TierPrices key={tier.id} tier={tier} billingOn={billingOn} pending={pending} run={run} />
      ))}
    </div>
  );
}

function TierPrices({
  tier,
  billingOn,
  pending,
  run,
}: {
  tier: BillingTierRow;
  billingOn: boolean;
  pending: boolean;
  run: (action: () => Promise<Result>, then?: () => void) => void;
}) {
  // One key per form: sent twice, the same form makes one price at the provider (D380).
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [interval, setPeriod] = useState<"MONTH" | "YEAR">("MONTH");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(PRICE_CURRENCIES[0]);
  const [deleting, setDeleting] = useState(false);
  const currentOf = (period: "MONTH" | "YEAR") => tier.prices.find((price) => price.current && price.interval === period);
  const replaces = currentOf(interval);
  const movable = (price: BillingTierRow["prices"][number]) => !price.current && price.subscribers > 0 && !!currentOf(price.interval);

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3.5"
      data-testid="billing-tier"
      data-tier={tier.name}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-medium text-ink">{tier.name}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted">
            {tier.setName ? `Feature set: ${tier.setName}` : "No feature set: the tier unlocks nothing yet"}
          </span>
          {tier.people === 0 && !deleting && (
            <PillButton
              type="button"
              size="xs"
              disabled={pending}
              aria-label={`Delete tier ${tier.name}`}
              onClick={() => setDeleting(true)}
            >
              Delete tier
            </PillButton>
          )}
        </div>
      </div>
      {deleting && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]" data-testid="billing-tier-delete">
          <span className="text-ink">Delete {tier.name}? Its prices and limits go with it, and this cannot be undone.</span>
          <PillButton
            type="button"
            size="xs"
            disabled={pending}
            onClick={() =>
              run(
                () => deleteTierAction(tier.id),
                () => setDeleting(false)
              )
            }
          >
            Confirm delete
          </PillButton>
          <PillButton type="button" size="xs" disabled={pending} onClick={() => setDeleting(false)}>
            Keep
          </PillButton>
        </div>
      )}
      {tier.prices.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">No prices: the tier is not on sale.</p>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] tracking-[0.06em] text-muted uppercase">
              <th className="py-1 pr-3 font-medium">Price</th>
              <th className="py-1 pr-3 font-medium">Offered</th>
              <th className="py-1 pr-3 font-medium">People on it</th>
              <th className="py-1 pr-3 font-medium">Made</th>
              <th className="py-1 font-medium">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tier.prices.map((price) => (
              <tr key={price.id} className="border-t border-line" data-testid="billing-price" data-current={price.current}>
                <td className="py-1.5 pr-3 text-ink">{price.label}</td>
                <td className={`py-1.5 pr-3 ${price.current ? "text-ink" : "text-muted"}`}>{price.current ? "Offered" : "Not offered"}</td>
                <td className="py-1.5 pr-3 font-mono text-ink">{price.subscribers}</td>
                <td className="py-1.5 pr-3 font-mono text-muted">{price.made}</td>
                <td className="py-1.5">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {billingOn && movable(price) && (
                      <PillButton
                        type="button"
                        size="xs"
                        disabled={pending}
                        aria-label={`Move the people on ${price.label} to ${currentOf(price.interval)!.label}`}
                        onClick={() => run(() => movePriceHoldersAction(price.id))}
                      >
                        Move to {currentOf(price.interval)!.label}
                      </PillButton>
                    )}
                    {billingOn && (
                      <PillButton
                        type="button"
                        size="xs"
                        disabled={pending}
                        aria-label={`${price.current ? "Stop offering" : "Offer again"} ${price.label}`}
                        onClick={() => run(() => (price.current ? withdrawPriceAction(price.id) : makePriceCurrentAction(price.id)))}
                      >
                        {price.current ? "Stop offering" : "Offer again"}
                      </PillButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {billingOn && tier.prices.some(movable) && (
        <p className="m-0 text-[12px] text-muted">
          Moving takes effect at each person&apos;s next renewal, with no charge now. The site does not tell them, so tell them before a
          higher price is charged.
        </p>
      )}
      {billingOn && (
        <form
          className="flex flex-wrap items-center gap-2 border-t border-line pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () => createPriceAction({ tierId: tier.id, interval, amount, currency, requestKey }),
              () => {
                setAmount("");
                setRequestKey(crypto.randomUUID());
              }
            );
          }}
        >
          <select
            aria-label={`Period of a new ${tier.name} price`}
            value={interval}
            onChange={(event) => setPeriod(event.target.value as "MONTH" | "YEAR")}
            className={FIELD}
          >
            <option value="MONTH">Monthly</option>
            <option value="YEAR">Yearly</option>
          </select>
          <input
            aria-label={`Amount of a new ${tier.name} price`}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="4.99"
            inputMode="decimal"
            maxLength={10}
            className={`${FIELD} w-24`}
            required
          />
          <select
            aria-label={`Currency of a new ${tier.name} price`}
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className={FIELD}
          >
            {PRICE_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
              </option>
            ))}
          </select>
          <PillButton type="submit" size="sm" disabled={pending || amount.trim() === ""}>
            {replaces ? "Replace price" : "Add price"}
          </PillButton>
          {replaces && <span className="text-[12px] text-muted">In place of {replaces.label}; the people on it keep it.</span>}
        </form>
      )}
    </section>
  );
}
