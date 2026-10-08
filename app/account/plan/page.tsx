import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FREE_PLAN, planName } from "@/lib/account/plan";
import { ENTITLEMENT_SELECT } from "@/lib/billing/entitlement";
import { currentBillingSettings } from "@/lib/billing/gateway";
import { BUYING_FEATURE, formatPrice, offeredTiers, planStatusLine, type PriceRow } from "@/lib/billing/purchase";
import { holdsThePlace } from "@/lib/billing/sync";
import { featureUsable } from "@/lib/features/features";
import { featureStatesFor } from "@/lib/features/server";
import { ChoosePriceButton, ManageBillingButton } from "@/app/components/account/billing-buttons";
import { PageHead, SectionTitle } from "@/app/components/panel/panel-parts";

/**
 * Plan (G-107 M2, G-106 M3): the plan the entitlement rule gives this person now, where their subscription stands, the
 * plans on sale with their current prices, and the way to the provider's Portal. Plans are offered only while billing
 * is on and the buying feature is usable for this person; it starts hidden in production (D372).
 */

const RETURN_NOTICES: Record<string, string> = {
  done: "Thank you. Your plan starts as soon as the payment is confirmed, which usually takes a few seconds; reload this page to see it.",
  cancelled: "Checkout was cancelled. Nothing was charged.",
};

export default async function AccountPlanPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const [user, states, prices, { checkout }] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscription: {
          select: {
            ...ENTITLEMENT_SELECT,
            cancelAtPeriodEnd: true,
            endedAt: true,
            stripeCustomerId: true,
            tierId: true,
            tier: { select: { name: true } },
          },
        },
      },
    }),
    featureStatesFor(userId),
    prisma.price.findMany({
      where: { current: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, tierId: true, interval: true, amount: true, currency: true, tier: { select: { name: true } } },
    }),
    searchParams,
  ]);
  if (!user) redirect("/login");

  const now = new Date();
  const stored = user.subscription;
  const plan = planName(stored, now);
  const status = planStatusLine(stored, now);
  const billingOn = currentBillingSettings().on;
  const offered = billingOn && featureUsable(states, BUYING_FEATURE) ? offeredTiers(prices.map(toPriceRow)) : [];
  const live = stored !== null && holdsThePlace(stored);
  const notice = checkout ? RETURN_NOTICES[checkout] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Plan" lead="Your plan decides which features of the editor you get." />
      {notice && (
        <p
          role="status"
          className="m-0 rounded-md border border-accent bg-surface px-3 py-2 text-[13px] text-ink"
          data-testid="plan-notice"
        >
          {notice}
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-accent bg-surface p-4" data-testid="plan-current">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-ink">{plan}</span>
            <span className="text-[11px] font-medium tracking-[0.08em] text-accent uppercase">Current</span>
          </div>
          <p className="m-0 text-[13px] text-muted">
            {plan === FREE_PLAN ? "The features the site gives every account." : `The features the ${plan} tier gives.`}
          </p>
          {status && (
            <p className="m-0 text-[13px] text-ink" data-testid="plan-status">
              {status}
            </p>
          )}
        </div>
        {offered.map((tier) => (
          <div key={tier.tierId} className="flex flex-col gap-3 rounded-lg border border-line p-4" data-testid="plan-offer">
            <span className="text-base font-semibold text-ink">{tier.tierName}</span>
            {[tier.month, tier.year].map((price) =>
              price ? (
                <div key={price.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] text-ink">{formatPrice(price)}</span>
                  {!live && (
                    <ChoosePriceButton priceId={price.id} label={`Choose ${tier.tierName}, ${formatPrice(price)}`}>
                      Choose
                    </ChoosePriceButton>
                  )}
                </div>
              ) : null
            )}
            {live && <p className="m-0 text-[13px] text-muted">You have a plan. Change or cancel it under Manage billing.</p>}
          </div>
        ))}
        {offered.length === 0 && plan === FREE_PLAN && (
          <div className="flex flex-col justify-center gap-2.5 rounded-lg border border-dashed border-control-line p-4">
            <span className="font-mono text-[11px] font-medium tracking-[0.06em] text-faint uppercase">Paid plans · not on sale</span>
            <span className="text-[13px] text-muted">Paid plans are not on sale yet.</span>
          </div>
        )}
      </div>
      <section className="flex flex-col gap-3" aria-labelledby="plan-billing">
        <SectionTitle id="plan-billing">Billing</SectionTitle>
        {billingOn && stored?.stripeCustomerId ? (
          <div className="flex flex-col gap-2 rounded-md border border-line p-3">
            <p className="m-0 text-[13px] text-muted">
              Your card, monthly or yearly billing, invoices and cancellation are on the payment provider&apos;s page.
            </p>
            <ManageBillingButton />
          </div>
        ) : (
          <div className="rounded-md border border-line px-3 py-5 text-center text-sm text-muted">Nothing billed on this account.</div>
        )}
      </section>
    </div>
  );
}

function toPriceRow(price: {
  id: string;
  tierId: string;
  interval: PriceRow["interval"];
  amount: number;
  currency: string;
  tier: { name: string };
}): PriceRow {
  return {
    id: price.id,
    tierId: price.tierId,
    tierName: price.tier.name,
    interval: price.interval,
    amount: price.amount,
    currency: price.currency,
  };
}
