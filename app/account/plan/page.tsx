import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FREE_PLAN, planName } from "@/lib/account/plan";
import { ENTITLEMENT_SELECT, isGrant } from "@/lib/billing/entitlement";
import { billingGateway, currentBillingSettings } from "@/lib/billing/gateway";
import { formatDay, formatPrice } from "@/lib/billing/notices";
import {
  cancelConfirmation,
  cancelRefusal,
  changeConfirmation,
  changeKind,
  changeRefusal,
  scheduledLine,
  targetRefusal,
} from "@/lib/billing/plan-change";
import { isFinal } from "@/lib/billing/sync";
import {
  BUYING_FEATURE,
  CHECKOUT_REFUSED,
  hasPlanInPlace,
  offeredTiers,
  paymentNotice,
  planStatusLine,
  type PriceRow,
} from "@/lib/billing/purchase";
import { CONSENT_REFUSED } from "@/lib/billing/consent";
import {
  deadlineLine,
  readRefunds,
  refundTotal,
  withdrawalAcknowledgment,
  withdrawalOpenUntil,
  withdrawalRefunds,
} from "@/lib/billing/withdrawal";
import { featureUsable } from "@/lib/features/features";
import { versionLine } from "@/lib/legal/documents";
import { currentLegalVersions } from "@/lib/legal/server";
import { featureStatesFor } from "@/lib/features/server";
import { billingPolicy } from "@/lib/settings/server";
import {
  CancelPlanButton,
  ChangePlanButton,
  ChoosePriceButton,
  FinishWithdrawalButton,
  KeepCurrentPlanButton,
  KeepPlanButton,
  ManageBillingButton,
  PlanConsent,
  WithdrawButton,
} from "@/app/components/account/billing-buttons";
import { ContentProse } from "@/app/components/content-prose";
import { PageHead, SectionTitle } from "@/app/components/panel/panel-parts";

/**
 * Plan (G-107 M2, G-106 M3): the plan the entitlement rule gives this person now, where their subscription stands, the
 * plans on sale with their current prices, and the way to the provider's Portal. Plans are offered only while billing
 * is on and the buying feature is usable for this person; it starts hidden in production (D372). A price is chosen only
 * once the terms are agreed to and the withdrawal acknowledged (G-128 M2, D384). For the 14 days after a purchase the
 * person can withdraw from it here, and a withdrawal made is acknowledged here (G-129 M2, D387). A plan held is changed,
 * cancelled and kept here too (G-129 M3, D388): more at once with the difference charged, less at the renewal.
 */

const RETURN_NOTICES: Record<string, string> = {
  done: "Thank you. Your plan starts as soon as the payment is confirmed, which usually takes a few seconds; reload this page to see it.",
  cancelled: "Checkout was cancelled. Nothing was charged.",
};

export default async function AccountPlanPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const [user, states, prices, { checkout }, policy, documents] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscription: {
          select: {
            ...ENTITLEMENT_SELECT,
            cancelAtPeriodEnd: true,
            endedAt: true,
            nextAttemptAt: true,
            payUrl: true,
            actionNeeded: true,
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            startedAt: true,
            tierId: true,
            priceId: true,
            scheduledPriceId: true,
            tier: { select: { name: true } },
            price: { select: { amount: true, currency: true, interval: true } },
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
    billingPolicy(),
    currentLegalVersions(),
  ]);
  if (!user) redirect("/login");

  const now = new Date();
  const stored = user.subscription;
  const plan = planName(stored, policy, now);
  const payment = paymentNotice(stored, policy, now);
  // The payment notice says all the status line would, and more.
  const status = payment ? null : planStatusLine(stored, policy, now);
  const billingOn = currentBillingSettings().on;
  const offered = billingOn && featureUsable(states, BUYING_FEATURE) ? offeredTiers(prices.map(toPriceRow)) : [];
  const live = hasPlanInPlace(stored, now);
  const notice = checkout ? RETURN_NOTICES[checkout] : undefined;
  const withdrawal = await withdrawalShown(stored, billingOn, now);
  // A plan is chosen only with the terms, privacy policy and withdrawal acknowledgment published, and agreed to (D384).
  const documentsReady = Boolean(documents.terms && documents.privacy && documents.withdrawal);
  const canChoose = offered.length > 0 && !live && documentsReady;
  // A plan held is changed here while it can be; the reason it cannot is said once on each offer instead.
  const bought = live && stored !== null && !isGrant(stored);
  const changeBlocked = bought ? changeRefusal(stored) : null;
  const canChange = bought && offered.length > 0 && changeBlocked === null && documentsReady;
  const current = bought ? stored.price : null;
  const changeTo = (price: PriceRow) =>
    canChange && current && price.id !== stored?.priceId && targetRefusal(current, { ...price, current: true }) === null
      ? changeKind(current, price)
      : null;
  // The agreement is asked only where a change would charge now.
  const upgradeOffered = offered.some((tier) => [tier.month, tier.year].some((price) => price && changeTo(price) === "now"));
  const renewalDay = stored?.currentPeriodEnd ? formatDay(stored.currentPeriodEnd) : null;
  const scheduled = stored?.scheduledPriceId ? await scheduledPlan(stored.scheduledPriceId) : null;
  const canCancel = bought && !stored.cancelAtPeriodEnd && cancelRefusal(stored) === null;
  const canKeep = stored !== null && !isGrant(stored) && stored.cancelAtPeriodEnd && !isFinal(stored);

  const offers = (
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
        {scheduled && renewalDay && (
          <div className="flex flex-col items-start gap-2" data-testid="plan-scheduled">
            <p className="m-0 text-[13px] text-ink">{scheduledLine(scheduled, renewalDay)}</p>
            {billingOn && <KeepCurrentPlanButton />}
          </div>
        )}
        {billingOn && canKeep && <KeepPlanButton />}
        {billingOn && canCancel && <CancelPlanButton confirmation={cancelConfirmation(renewalDay)} />}
      </div>
      {offered.map((tier) => (
        <div key={tier.tierId} className="flex flex-col gap-3 rounded-lg border border-line p-4" data-testid="plan-offer">
          <span className="text-base font-semibold text-ink">{tier.tierName}</span>
          {[tier.month, tier.year].map((price) =>
            price ? (
              <div key={price.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] text-ink">{formatPrice(price)}</span>
                {canChoose && (
                  <ChoosePriceButton priceId={price.id} label={`Choose ${tier.tierName}, ${formatPrice(price)}`}>
                    Choose
                  </ChoosePriceButton>
                )}
                {bought && price.id === stored.priceId && (
                  <span className="text-[11px] font-medium tracking-[0.08em] text-accent uppercase">Your plan</span>
                )}
                {changeTo(price) && (
                  <ChangePlanButton
                    priceId={price.id}
                    when={changeTo(price)!}
                    label={`${tier.tierName}, ${formatPrice(price)}`}
                    confirmation={changeConfirmation(changeTo(price)!, `${tier.tierName}, ${formatPrice(price)}`, renewalDay)}
                  />
                )}
              </div>
            ) : null
          )}
          {live && isGrant(stored) && <p className="m-0 text-[13px] text-muted">{CHECKOUT_REFUSED.given}</p>}
          {changeBlocked && <p className="m-0 text-[13px] text-muted">{changeBlocked}</p>}
        </div>
      ))}
      {offered.length === 0 && plan === FREE_PLAN && (
        <div className="flex flex-col justify-center gap-2.5 rounded-lg border border-dashed border-control-line p-4">
          <span className="font-mono text-[11px] font-medium tracking-[0.06em] text-faint uppercase">Paid plans · not on sale</span>
          <span className="text-[13px] text-muted">Paid plans are not on sale yet.</span>
        </div>
      )}
    </div>
  );

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
      {payment && (
        <div
          role="status"
          className={`flex flex-col gap-2 rounded-md border px-3 py-2.5 text-[13px] text-ink ${payment.tone === "warning" ? "border-warning-edge bg-surface" : "border-line bg-surface"}`}
          data-testid="plan-payment-notice"
          data-tone={payment.tone}
        >
          {payment.lines.map((line) => (
            <p key={line} className="m-0">
              {line}
            </p>
          ))}
          {payment.pay && (
            <a
              href={payment.pay.href}
              rel="noopener noreferrer"
              className="self-start rounded-md border border-control-line px-3 py-1.5 text-[13px] font-medium text-ink no-underline hover:bg-control-hover"
              data-testid="plan-pay-link"
            >
              {payment.pay.label}
            </a>
          )}
        </div>
      )}
      {offered.length > 0 && !live && !documentsReady && (
        // Prices stay visible, with no way to choose one, until every document a buyer is shown is published.
        <p className="m-0 rounded-md border border-line px-3 py-2 text-[13px] text-muted" data-testid="plan-unpublished">
          {CONSENT_REFUSED.unpublished}
        </p>
      )}
      {(canChoose || upgradeOffered) && documents.terms && documents.withdrawal ? (
        <PlanConsent
          termsVersionId={documents.terms.id}
          termsHref={`/terms?version=${documents.terms.version}`}
          termsLine={versionLine(documents.terms.version, documents.terms.publishedAt)}
          withdrawalVersionId={documents.withdrawal.id}
          withdrawal={<ContentProse markdown={documents.withdrawal.body} authored />}
        >
          {offers}
        </PlanConsent>
      ) : (
        offers
      )}
      {withdrawal && (
        <section className="flex flex-col gap-3" aria-labelledby="plan-withdrawal">
          <SectionTitle id="plan-withdrawal">Withdrawal</SectionTitle>
          {withdrawal.kind === "recorded" ? (
            <div
              role="status"
              className="flex flex-col gap-2 rounded-md border border-line p-3 text-[13px] text-ink"
              data-testid="plan-withdrawal-ack"
            >
              {withdrawal.lines.map((line) => (
                <p key={line} className="m-0">
                  {line}
                </p>
              ))}
              {!withdrawal.completed && <FinishWithdrawalButton />}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2 rounded-md border border-line p-3" data-testid="plan-withdrawal-open">
              <p className="m-0 text-[13px] text-muted">{withdrawal.line}</p>
              <WithdrawButton estimate={withdrawal.estimate} />
            </div>
          )}
        </section>
      )}
      <section className="flex flex-col gap-3" aria-labelledby="plan-billing">
        <SectionTitle id="plan-billing">Billing</SectionTitle>
        {billingOn && stored?.stripeCustomerId ? (
          <div className="flex flex-col gap-2 rounded-md border border-line p-3">
            <p className="m-0 text-[13px] text-muted">Your card and invoices are on the payment provider&apos;s page.</p>
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

type WithdrawalShown =
  { kind: "recorded"; lines: string[]; completed: boolean } | { kind: "open"; line: string; estimate: string | null } | null;

/**
 * The Withdrawal section: the acknowledgment of a withdrawal from the subscription the person holds, or, within its 14
 * days, the button with what it would give back now. The estimate asks the provider; when it cannot answer, the button
 * stays and says it in words.
 */
async function withdrawalShown(
  stored: {
    kind: string;
    status: string;
    endedAt: Date | null;
    startedAt: Date | null;
    stripeSubscriptionId: string | null;
    stripeCustomerId: string | null;
  } | null,
  billingOn: boolean,
  now: Date
): Promise<WithdrawalShown> {
  if (!stored?.stripeSubscriptionId) return null;
  const recorded = await prisma.withdrawal.findUnique({
    where: { stripeSubscriptionId: stored.stripeSubscriptionId },
    select: { requestedAt: true, refunds: true, completedAt: true },
  });
  if (recorded) {
    const refunds = readRefunds(recorded.refunds);
    return {
      kind: "recorded",
      lines: withdrawalAcknowledgment({ requestedAt: recorded.requestedAt, refunds, completedAt: recorded.completedAt }),
      completed: recorded.completedAt !== null,
    };
  }
  const deadline = withdrawalOpenUntil(stored, now);
  if (!deadline || !billingOn || !stored.stripeCustomerId || !stored.startedAt) return null;
  let estimate: string | null = null;
  try {
    const gateway = await billingGateway();
    if (gateway) estimate = refundTotal(withdrawalRefunds(await gateway.listPayments(stored.stripeCustomerId), stored.startedAt, now));
  } catch {
    estimate = null;
  }
  return { kind: "open", line: deadlineLine(deadline), estimate: estimate === "nothing" ? null : estimate };
}

/** The plan a change waiting for the renewal moves to, in words; null if its price is gone. */
async function scheduledPlan(priceId: string): Promise<string | null> {
  const price = await prisma.price.findUnique({
    where: { id: priceId },
    select: { amount: true, currency: true, interval: true, tier: { select: { name: true } } },
  });
  return price ? `${price.tier.name}, ${formatPrice(price)}` : null;
}
