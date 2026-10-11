import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fakeBillingGateway } from "@/lib/billing/gateway";
import { PillButton } from "@/app/components/ui";
import {
  backdateFakeFailureAction,
  backdateFakeStartAction,
  cancelFakeSubscriptionAction,
  endFakePeriodAction,
  failFakeRenewalAction,
  payFakeInvoiceAction,
} from "../fake-actions";

/**
 * The fake provider's Portal (G-106 M3, D373): the signed-in person's subscriptions at the fake, with Cancel (at the
 * period's end, as Stripe's Portal does) and End the period now, for tests. A failing invoice (G-126 M2) is paid here, as
 * the fake's stand-in for the invoice's own page; a renewal that fails, and a failure moved past the grace, are for tests. Found only while the fake is the adapter,
 * and only for the person's own customer.
 */

export const dynamic = "force-dynamic";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function FakePortalPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const gateway = await fakeBillingGateway();
  if (!gateway) notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { customer = "" } = await searchParams;
  const stored = await prisma.subscription.findUnique({ where: { userId: session.user.id }, select: { stripeCustomerId: true } });
  if (!customer || stored?.stripeCustomerId !== customer) notFound();
  const subscriptions = await gateway.listSubscriptions(customer);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="m-0 text-xl font-semibold text-ink">Test billing portal</h1>
      <p className="m-0 text-[13px] text-muted">The local test provider&apos;s portal. Nothing here is charged.</p>
      {subscriptions.length === 0 && <p className="m-0 text-sm text-muted">No subscription.</p>}
      {subscriptions.map((subscription) => (
        <div key={subscription.id} className="flex flex-col gap-2 rounded-md border border-line p-3" data-testid="fake-portal-subscription">
          <p className="m-0 text-sm text-ink">
            {subscription.status}
            {subscription.currentPeriodEnd && `, period ends ${DAY.format(subscription.currentPeriodEnd)}`}
            {subscription.cancelAtPeriodEnd && ", cancelled at the period's end"}
            {subscription.firstFailedAt && `, payment failing since ${DAY.format(subscription.firstFailedAt)}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {!subscription.cancelAtPeriodEnd && (
              <form action={cancelFakeSubscriptionAction}>
                <input type="hidden" name="subscription" value={subscription.id} />
                <PillButton type="submit" variant="outline" size="md">
                  Cancel plan
                </PillButton>
              </form>
            )}
            {subscription.status !== "canceled" &&
              [3, 15].map((days) => (
                <form key={days} action={backdateFakeStartAction}>
                  <input type="hidden" name="subscription" value={subscription.id} />
                  <input type="hidden" name="days" value={days} />
                  <PillButton type="submit" variant="outline" size="md">
                    {`Begun ${days} days ago`}
                  </PillButton>
                </form>
              ))}
            <form action={endFakePeriodAction}>
              <input type="hidden" name="subscription" value={subscription.id} />
              <PillButton type="submit" variant="outline" size="md">
                End the period now
              </PillButton>
            </form>
            {subscription.firstFailedAt ? (
              <>
                <form action={payFakeInvoiceAction}>
                  <input type="hidden" name="subscription" value={subscription.id} />
                  <PillButton type="submit" variant="outline" size="md">
                    Pay the open invoice
                  </PillButton>
                </form>
                <form action={backdateFakeFailureAction}>
                  <input type="hidden" name="subscription" value={subscription.id} />
                  <PillButton type="submit" variant="outline" size="md">
                    Move the failure past the grace
                  </PillButton>
                </form>
              </>
            ) : (
              !subscription.cancelAtPeriodEnd &&
              subscription.status !== "canceled" && (
                <form action={failFakeRenewalAction}>
                  <input type="hidden" name="subscription" value={subscription.id} />
                  <PillButton type="submit" variant="outline" size="md">
                    Renewal fails
                  </PillButton>
                </form>
              )
            )}
          </div>
        </div>
      ))}
      <a href="/account/plan" className="text-sm text-accent underline">
        Back to the site
      </a>
    </main>
  );
}
