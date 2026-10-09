import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentAdmin } from "@/lib/admin/require-admin";
import { historyText, moveRefusal } from "@/lib/billing/admin-view";
import type { ProviderPayment } from "@/lib/billing/contract";
import { GRANT_KIND } from "@/lib/billing/entitlement";
import { billingGateway } from "@/lib/billing/gateway";
import { formatDay, formatPrice } from "@/lib/billing/notices";
import { PersonBilling } from "./person-billing";

/**
 * `/admin/users/<id>/billing` (G-127 M2): one person's subscription, its whole history (failures and recoveries, what the
 * admin did), their latest payments read from the provider with a refund for each, and moving them to their tier's
 * current price (D381).
 */
export const dynamic = "force-dynamic";

const HISTORY_SHOWN = 200;

async function paymentsOf(customerId: string | null): Promise<ProviderPayment[] | "unavailable" | null> {
  if (!customerId) return null;
  const gateway = await billingGateway();
  if (!gateway) return null;
  try {
    return await gateway.listPayments(customerId);
  } catch (error) {
    console.warn("[billing] a person's payments could not be read:", error);
    return "unavailable";
  }
}

export default async function AdminUserBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, admin] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        subscription: {
          select: {
            id: true,
            kind: true,
            status: true,
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            endedAt: true,
            firstFailedAt: true,
            priceId: true,
            tier: { select: { name: true } },
            price: { select: { tierId: true, interval: true, amount: true, currency: true } },
            events: { orderBy: [{ at: "desc" }, { id: "desc" }], take: HISTORY_SHOWN },
          },
        },
      },
    }),
    currentAdmin(),
  ]);
  if (!user) notFound();
  const stored = user.subscription;
  const own = admin?.id === user.id;

  const priceIds = [...new Set((stored?.events ?? []).flatMap((line) => (line.kind === "price" ? [line.before, line.after] : [])))];
  const [named, target, payments] = await Promise.all([
    prisma.price.findMany({
      where: { id: { in: priceIds.filter((value): value is string => value !== null) } },
      select: { id: true, amount: true, currency: true, interval: true, tier: { select: { name: true } } },
    }),
    stored?.price
      ? prisma.price.findFirst({
          where: { tierId: stored.price.tierId, interval: stored.price.interval, current: true },
          orderBy: { createdAt: "desc" },
          select: { id: true, amount: true, currency: true, interval: true },
        })
      : null,
    paymentsOf(stored?.stripeCustomerId ?? null),
  ]);
  const priceNames = new Map(named.map((price) => [price.id, `${price.tier.name} ${formatPrice(price)}`]));
  const refusal = stored ? moveRefusal(stored, target) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[13px]">
        <Link href={`/admin/users?user=${user.id}`} className="text-muted hover:text-ink hover:underline">
          ← Users
        </Link>{" "}
        ·{" "}
        <Link href="/admin/billing" className="text-muted hover:text-ink hover:underline">
          Billing
        </Link>
      </p>
      <h1 className="m-0 text-lg font-semibold text-ink">
        Subscription of {user.name?.trim() || user.email}
        {user.name?.trim() && <span className="ml-2 text-sm font-normal text-muted">{user.email}</span>}
      </h1>

      {!stored ? (
        <p className="m-0 text-[13px] text-muted" data-testid="person-subscription">
          No subscription: this person has never bought a plan or been given one.
        </p>
      ) : (
        <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-2 text-[13px]" data-testid="person-subscription">
          <dt className="text-muted">Tier</dt>
          <dd className="m-0 text-ink">{stored.tier.name}</dd>
          <dt className="text-muted">How</dt>
          <dd className="m-0 text-ink">
            {stored.kind === GRANT_KIND ? "Given by hand" : stored.price ? `Bought, ${formatPrice(stored.price)}` : "Bought"}
          </dd>
          <dt className="text-muted">Status</dt>
          <dd className="m-0 text-ink">
            {stored.status}
            {stored.cancelAtPeriodEnd && !stored.endedAt && ", ends at the period's end"}
            {stored.firstFailedAt && <span className="text-danger">, a payment failing since {formatDay(stored.firstFailedAt)}</span>}
          </dd>
          <dt className="text-muted">{stored.endedAt ? "Ended" : "Until"}</dt>
          <dd className="m-0 text-ink">
            {stored.endedAt ? formatDay(stored.endedAt) : stored.currentPeriodEnd ? formatDay(stored.currentPeriodEnd) : "—"}
          </dd>
          {stored.stripeSubscriptionId && (
            <>
              <dt className="text-muted">At the provider</dt>
              <dd className="m-0 font-mono text-[12px] break-all text-ink">
                {stored.stripeSubscriptionId} · {stored.stripeCustomerId}
              </dd>
            </>
          )}
        </dl>
      )}

      <PersonBilling
        userId={user.id}
        own={own}
        move={stored && stored.kind !== GRANT_KIND && target && target.id !== stored.priceId ? { to: formatPrice(target), refusal } : null}
        payments={
          payments === null || payments === "unavailable"
            ? payments
            : payments.map((payment) => ({
                id: payment.id,
                amount: payment.amount,
                currency: payment.currency,
                paidOn: formatDay(payment.paidAt),
                refunded: payment.refunded,
                disputed: payment.disputed,
              }))
        }
      />

      <h2 className="m-0 mt-2 text-base font-semibold text-ink">History</h2>
      {!stored || stored.events.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">Nothing recorded.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]" data-testid="person-history">
          {stored.events.map((line) => (
            <li key={line.id} className="flex flex-wrap gap-x-3 border-t border-line py-1" data-testid="person-history-line">
              <span className="w-40 shrink-0 font-mono text-[12px] text-muted">{line.at.toISOString().slice(0, 16).replace("T", " ")}</span>
              <span className="min-w-0 flex-1 text-ink">{historyText(line, (priceId) => priceNames.get(priceId))}</span>
              <span className="text-[12px] text-muted">{line.source === "admin" ? "by an admin" : `from the ${line.source}`}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
