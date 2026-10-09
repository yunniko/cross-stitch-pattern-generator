import { notFound } from "next/navigation";
import { fakeBillingGateway } from "@/lib/billing/gateway";
import { formatPrice } from "@/lib/billing/notices";
import { PillButton } from "@/app/components/ui";
import { payFakeCheckoutAction } from "../fake-actions";

/**
 * The fake provider's Checkout (G-106 M3, D373): what Stripe's page does, without a card. Found only while the fake is
 * the adapter, which runs on a local address alone.
 */

export const dynamic = "force-dynamic";

export default async function FakeCheckoutPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const gateway = await fakeBillingGateway();
  const { session = "" } = await searchParams;
  const open = gateway?.openSession(session);
  if (!open || !open.price.interval || open.price.amount === null) notFound();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="m-0 text-xl font-semibold text-ink">Test checkout</h1>
      <p className="m-0 text-[13px] text-muted">The local test provider: no card is asked for and nothing is charged.</p>
      <p className="m-0 text-sm text-ink" data-testid="fake-checkout-price">
        {open.price.productName}: {formatPrice({ amount: open.price.amount, currency: open.price.currency, interval: open.price.interval })}
      </p>
      <div className="flex items-center gap-3">
        <form action={payFakeCheckoutAction}>
          <input type="hidden" name="session" value={session} />
          <PillButton type="submit" variant="primary" size="md">
            Pay
          </PillButton>
        </form>
        <a href={open.input.cancelUrl} className="text-sm text-accent underline">
          Cancel
        </a>
      </div>
    </main>
  );
}
