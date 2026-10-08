import Stripe from "stripe";
import { BillingSignatureError, BillingUnavailableError, type BillingGateway, type PaymentTotals, type ProviderPayment } from "./contract";
import { readEventObject } from "./event-reference";
import { failingInvoice, invoicePaymentIntentId, priceFromStripe, snapshotFromStripe } from "./stripe-mapping";

/**
 * The Stripe adapter of the billing contract (G-106 M1, D366): the one module that loads the `stripe` package (an
 * ESLint rule keeps it so). Stripe's API version is pinned here, so a change of the account's default version changes
 * nothing the app reads; the package is pinned to the version this API version belongs to.
 *
 * Not yet exercised against Stripe's test mode: that waits on the Owner's test keys (G-106 M4).
 */

export const STRIPE_API_VERSION = "2026-06-24.dahlia" as const;

/** Errors that mean Stripe could not answer now, as against a request that is wrong. */
function unavailable(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeConnectionError ||
    error instanceof Stripe.errors.StripeAPIError ||
    error instanceof Stripe.errors.StripeRateLimitError ||
    error instanceof Stripe.errors.StripeAuthenticationError ||
    (error instanceof Stripe.errors.StripeError && (error.statusCode ?? 0) >= 500)
  );
}

async function call<T>(what: string, request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (unavailable(error)) throw new BillingUnavailableError(`Stripe could not ${what}`, { cause: error });
    throw error;
  }
}

/** How many of a customer's latest payments the admin sees. */
const PAYMENTS_SHOWN = 24;

/** A charge that took money: a failed or pending one took nothing. */
const taken = (charge: Stripe.Charge) => charge.paid && charge.status === "succeeded";

const paymentFromStripe = (charge: Stripe.Charge): ProviderPayment => ({
  id: charge.id,
  amount: charge.amount,
  currency: charge.currency,
  paidAt: new Date(charge.created * 1000),
  refunded: charge.amount_refunded,
  disputed: charge.disputed,
});

export function createStripeGateway(settings: { secretKey: string; webhookSecret: string }): BillingGateway {
  const stripe = new Stripe(settings.secretKey, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 20_000 });

  // A failing invoice's payment may wait on the person (3-D Secure) rather than be declined: its payment intent says
  // which, so it is read for a failing subscription only (D378; unverified until the test keys, G-126 M3).
  const snapshot = async (subscription: Stripe.Subscription) => {
    const failing = failingInvoice(subscription);
    const intentId = failing ? invoicePaymentIntentId(failing) : null;
    const intent = intentId ? await stripe.paymentIntents.retrieve(intentId) : null;
    return snapshotFromStripe(subscription, intent?.status === "requires_action");
  };
  const EXPAND = ["latest_invoice.payments"];

  return {
    id: "stripe",

    startCheckout: ({ priceId, userId, email, customerId, successUrl, cancelUrl }) =>
      call("start a checkout", async () => {
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          line_items: [{ price: priceId, quantity: 1 }],
          client_reference_id: userId,
          ...(customerId ? { customer: customerId } : { customer_email: email }),
          // The webhook finds the person from the subscription itself, whichever event arrives first.
          subscription_data: { metadata: { userId } },
          success_url: successUrl,
          cancel_url: cancelUrl,
        });
        if (!session.url) throw new Error("Stripe's Checkout session has no address");
        return { url: session.url };
      }),

    openPortal: ({ customerId, returnUrl }) =>
      call("open the portal", async () => {
        const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
        return { url: session.url };
      }),

    readEvent(rawBody, signature) {
      if (!signature) throw new BillingSignatureError("no signature");
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, settings.webhookSecret);
      } catch (error) {
        if (error instanceof Stripe.errors.StripeSignatureVerificationError) throw new BillingSignatureError(error.message);
        throw error;
      }
      return readEventObject(event);
    },

    fetchSubscription: (id) =>
      call("read a subscription", async () => {
        try {
          return await snapshot(await stripe.subscriptions.retrieve(id, { expand: EXPAND }));
        } catch (error) {
          if (error instanceof Stripe.errors.StripeInvalidRequestError && error.statusCode === 404) return null;
          throw error;
        }
      }),

    listSubscriptions: (customerId) =>
      call("list subscriptions", async () => {
        const list = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 100,
          expand: ["data.latest_invoice.payments"],
        });
        const open = list.data.filter((subscription) => subscription.ended_at === null);
        return Promise.all(open.map(snapshot));
      }),

    cancelSubscription: (id, { atPeriodEnd }) =>
      call("cancel a subscription", async () =>
        snapshot(
          atPeriodEnd
            ? await stripe.subscriptions.update(id, { cancel_at_period_end: true, expand: EXPAND })
            : await stripe.subscriptions.cancel(id, { expand: EXPAND })
        )
      ),

    chargeCustomer: (chargeId) =>
      call("read a charge", async () => {
        try {
          const charge = await stripe.charges.retrieve(chargeId);
          return typeof charge.customer === "string" ? charge.customer : (charge.customer?.id ?? null);
        } catch (error) {
          if (error instanceof Stripe.errors.StripeInvalidRequestError && error.statusCode === 404) return null;
          throw error;
        }
      }),

    listPrices: () =>
      call("list prices", async () => {
        const list = await stripe.prices.list({ active: true, type: "recurring", limit: 100, expand: ["data.product"] });
        return list.data.map(priceFromStripe);
      }),

    createPrice: ({ productId, productName, tierId, amount, currency, interval, requestKey }) =>
      call("make a price", async () => {
        // Whether the amount includes VAT (`tax_behavior`) is left to the account's default: the Owner's to settle (G-128).
        const price = await stripe.prices.create(
          {
            currency,
            unit_amount: amount,
            recurring: { interval: interval === "MONTH" ? "month" : "year" },
            metadata: { tierId },
            ...(productId ? { product: productId } : { product_data: { name: productName, metadata: { tierId } } }),
          },
          { idempotencyKey: `price-${requestKey}` }
        );
        return { priceId: price.id, productId: typeof price.product === "string" ? price.product : price.product.id };
      }),

    setPriceActive: (priceId, active) =>
      call("change a price", async () => {
        await stripe.prices.update(priceId, { active });
      }),

    listPayments: (customerId) =>
      call("list payments", async () => {
        const list = await stripe.charges.list({ customer: customerId, limit: PAYMENTS_SHOWN });
        return list.data.filter(taken).map(paymentFromStripe);
      }),

    refundPayment: (paymentId, requestKey) =>
      call("refund a payment", async () => {
        await stripe.refunds.create({ charge: paymentId }, { idempotencyKey: `refund-${requestKey}` });
      }),

    paymentTotals: (from, to) =>
      call("add up payments", async () => {
        const totals = new Map<string, PaymentTotals>();
        const created = { gte: Math.floor(from.getTime() / 1000), lt: Math.floor(to.getTime() / 1000) };
        for await (const charge of stripe.charges.list({ created, limit: 100 })) {
          if (!taken(charge)) continue;
          const total = totals.get(charge.currency) ?? { currency: charge.currency, payments: 0, taken: 0, refunded: 0 };
          total.payments += 1;
          total.taken += charge.amount;
          total.refunded += charge.amount_refunded;
          totals.set(charge.currency, total);
        }
        return [...totals.values()];
      }),

    countSubscriptions: () =>
      call("count subscriptions", async () => {
        const counts: Record<string, number> = {};
        // With no status asked for, Stripe lists every subscription that is not cancelled.
        for await (const subscription of stripe.subscriptions.list({ limit: 100 })) {
          if (subscription.ended_at !== null) continue;
          counts[subscription.status] = (counts[subscription.status] ?? 0) + 1;
        }
        return counts;
      }),

    movePrice: (subscriptionId, priceId) =>
      call("move a subscription to a price", async () => {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const item = subscription.items.data[0];
        if (!item) throw new Error(`Stripe's subscription ${subscriptionId} has no item`);
        // No proration: the new price is charged from the next renewal, and nothing now (D381).
        await stripe.subscriptions.update(subscriptionId, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: "none",
        });
      }),
  };
}
