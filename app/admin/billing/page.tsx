import { prisma } from "@/lib/prisma";
import { currentBillingSettings } from "@/lib/billing/gateway";
import { formatPrice } from "@/lib/billing/notices";
import { PageHead } from "@/app/components/panel/panel-parts";
import { BillingAdmin, type BillingTierRow } from "./billing-admin";
import { SubscriptionsOverview } from "./subscriptions-overview";

/**
 * `/admin/billing` (G-127): people's subscriptions (M2), then the tiers and their prices (M1). A price is made at the
 * provider and kept as a row (D380); a new one for a tier and period is offered in place of the current one, and the
 * people on the old one keep it (D368) unless the admin moves them (D381).
 */
export const dynamic = "force-dynamic";

export default async function AdminBillingPage() {
  const tiers = await prisma.tier.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      stripeProductId: true,
      featureSet: { select: { name: true } },
      _count: { select: { subscriptions: true } },
      prices: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          interval: true,
          amount: true,
          currency: true,
          current: true,
          createdAt: true,
          _count: { select: { subscriptions: { where: { endedAt: null } } } },
        },
      },
    },
  });
  const rows: BillingTierRow[] = tiers.map((tier) => ({
    id: tier.id,
    name: tier.name,
    setName: tier.featureSet?.name ?? null,
    productId: tier.stripeProductId,
    people: tier._count.subscriptions,
    prices: tier.prices.map((price) => ({
      id: price.id,
      label: formatPrice(price),
      interval: price.interval,
      current: price.current,
      subscribers: price._count.subscriptions,
      made: price.createdAt.toISOString().slice(0, 10),
    })),
  }));
  const settings = currentBillingSettings();
  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Billing"
        lead="People's subscriptions, and the tiers they can buy with their prices. A new price for a tier and period is offered in place of the current one; the people already on the old one keep it unless you move them."
      />
      <SubscriptionsOverview billingOn={settings.on} />
      <h2 className="m-0 mt-2 text-base font-semibold text-ink">Tiers and prices</h2>
      <BillingAdmin tiers={rows} billingOn={settings.on} />
    </div>
  );
}
