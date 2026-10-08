import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { FAILING_STATUSES, formatMoney, monthRange } from "@/lib/billing/admin-view";
import type { PaymentTotals } from "@/lib/billing/contract";
import { GRANT_KIND } from "@/lib/billing/entitlement";
import { billingGateway } from "@/lib/billing/gateway";
import { formatDay } from "@/lib/billing/notices";
import { formatPrice } from "@/lib/billing/purchase";

/**
 * The top of `/admin/billing` (G-127 M2): counts and revenue read from the provider through the contract (Acceptance 4:
 * never added up from webhooks), who has a payment failing now, the second subscriptions the sync set to end, and
 * everyone's subscription with a link to its history.
 */

const SECOND_SHOWN_DAYS = 90;
const LIST_SHOWN = 200;

const HEAD = "py-1 pr-3 font-medium";
const CELL = "py-1.5 pr-3";

function Section({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3.5" data-testid={testId}>
      <h2 className="m-0 text-base font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}

const personLink = (user: { id: string; email: string | null }) => (
  <Link href={`/admin/users/${user.id}/billing`} className="text-accent hover:underline">
    {user.email ?? user.id}
  </Link>
);

const totalsText = (totals: PaymentTotals[]) =>
  totals.length === 0
    ? "No payments."
    : totals
        .map(
          (total) =>
            `${formatMoney(total.taken, total.currency)} in ${total.payments} ${total.payments === 1 ? "payment" : "payments"}` +
            (total.refunded > 0 ? `, ${formatMoney(total.refunded, total.currency)} of it refunded` : "")
        )
        .join("; ");

async function ProviderFigures({ billingOn }: { billingOn: boolean }) {
  if (!billingOn) return <p className="m-0 text-[13px] text-muted">Billing is off on this server: there is no provider to ask.</p>;
  const now = new Date();
  const months = [monthRange(now), monthRange(now, -1)];
  let figures: [Record<string, number>, ...PaymentTotals[][]];
  try {
    const gateway = (await billingGateway())!;
    figures = await Promise.all([gateway.countSubscriptions(), ...months.map((month) => gateway.paymentTotals(month.from, month.to))]);
  } catch (error) {
    console.warn("[billing] the admin's figures could not be read:", error);
    return <p className="m-0 text-[13px] text-muted">The payment provider could not be reached, so its figures are not shown.</p>;
  }
  const [counts, ...totals] = figures;
  const statuses = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  return (
    <dl className="m-0 grid grid-cols-[140px_minmax(0,1fr)] gap-2 text-[13px]" data-testid="billing-figures">
      <dt className="text-muted">Subscriptions</dt>
      <dd className="m-0 text-ink" data-testid="billing-counts">
        {statuses.length === 0 ? "None running." : statuses.map(([status, count]) => `${count} ${status}`).join(", ")}
      </dd>
      {months.map((month, index) => (
        <div key={month.name} className="contents">
          <dt className="text-muted">{month.name}</dt>
          <dd className="m-0 text-ink" data-testid="billing-revenue">
            {totalsText(totals[index])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export async function SubscriptionsOverview({ billingOn }: { billingOn: boolean }) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - SECOND_SHOWN_DAYS);
  const user = { select: { id: true, email: true } } as const;
  const [failing, seconds, rows] = await Promise.all([
    prisma.subscription.findMany({
      where: {
        kind: { not: GRANT_KIND },
        endedAt: null,
        OR: [{ firstFailedAt: { not: null } }, { status: { in: [...FAILING_STATUSES] } }],
      },
      orderBy: { firstFailedAt: "asc" },
      select: {
        id: true,
        status: true,
        firstFailedAt: true,
        nextAttemptAt: true,
        actionNeeded: true,
        user,
        tier: { select: { name: true } },
      },
    }),
    prisma.subscriptionEvent.findMany({
      where: { kind: "second", at: { gte: since } },
      orderBy: { at: "desc" },
      select: { id: true, after: true, at: true, subscription: { select: { user } } },
    }),
    prisma.subscription.findMany({
      orderBy: { updatedAt: "desc" },
      take: LIST_SHOWN,
      select: {
        id: true,
        kind: true,
        status: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        endedAt: true,
        user,
        tier: { select: { name: true } },
        price: { select: { amount: true, currency: true, interval: true } },
      },
    }),
  ]);

  return (
    <>
      <Section title="From the payment provider" testId="billing-provider">
        <ProviderFigures billingOn={billingOn} />
      </Section>

      <Section title="Payments failing now" testId="billing-failing">
        {failing.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">No payment is failing.</p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] tracking-[0.06em] text-muted uppercase">
                <th className={HEAD}>Person</th>
                <th className={HEAD}>Tier</th>
                <th className={HEAD}>Status</th>
                <th className={HEAD}>Failing since</th>
                <th className={HEAD}>Next try</th>
              </tr>
            </thead>
            <tbody>
              {failing.map((row) => (
                <tr key={row.id} className="border-t border-line" data-testid="billing-failing-row">
                  <td className={CELL}>{personLink(row.user)}</td>
                  <td className={`${CELL} text-ink`}>{row.tier.name}</td>
                  <td className={`${CELL} text-danger`}>
                    {row.status}
                    {row.actionNeeded && <span className="text-muted"> (waits on the person to confirm)</span>}
                  </td>
                  <td className={`${CELL} text-ink`}>{row.firstFailedAt ? formatDay(row.firstFailedAt) : "not recorded"}</td>
                  <td className={`${CELL} text-ink`}>{row.nextAttemptAt ? formatDay(row.nextAttemptAt) : "none planned"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Second subscriptions" testId="billing-seconds">
        <p className="m-0 text-[12px] text-muted">
          Someone who already had a plan paid for another (two tabs, say). The site set the second to end at its period&apos;s end; refund
          it from the person&apos;s page if they ask. The last {SECOND_SHOWN_DAYS} days.
        </p>
        {seconds.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">None.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {seconds.map((event) => (
              <li key={event.id} data-testid="billing-second-row">
                {personLink(event.subscription.user)}{" "}
                <span className="text-muted">
                  — {event.after}, on {formatDay(event.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="People's subscriptions" testId="billing-subscriptions">
        {rows.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">Nobody has a subscription yet.</p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] tracking-[0.06em] text-muted uppercase">
                <th className={HEAD}>Person</th>
                <th className={HEAD}>Tier</th>
                <th className={HEAD}>How</th>
                <th className={HEAD}>Status</th>
                <th className={HEAD}>Until</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line" data-testid="billing-subscription-row">
                  <td className={CELL}>{personLink(row.user)}</td>
                  <td className={`${CELL} text-ink`}>{row.tier.name}</td>
                  <td className={`${CELL} text-ink`}>
                    {row.kind === GRANT_KIND ? "Given by hand" : row.price ? formatPrice(row.price) : "Bought"}
                  </td>
                  <td className={`${CELL} ${row.endedAt ? "text-muted" : "text-ink"}`}>
                    {row.status}
                    {row.cancelAtPeriodEnd && !row.endedAt && <span className="text-muted">, ends at the period&apos;s end</span>}
                  </td>
                  <td className={`${CELL} text-ink`}>
                    {row.endedAt ? `ended ${formatDay(row.endedAt)}` : row.currentPeriodEnd ? formatDay(row.currentPeriodEnd) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length === LIST_SHOWN && <p className="m-0 text-[12px] text-muted">The {LIST_SHOWN} changed most recently.</p>}
      </Section>
    </>
  );
}
