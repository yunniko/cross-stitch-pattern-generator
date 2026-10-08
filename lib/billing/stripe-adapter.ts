import Stripe from "stripe";
import { BillingSignatureError, BillingUnavailableError, type BillingGateway } from "./contract";
import { readEventObject } from "./event-reference";
import { priceFromStripe, snapshotFromStripe } from "./stripe-mapping";

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

export function createStripeGateway(settings: { secretKey: string; webhookSecret: string }): BillingGateway {
  const stripe = new Stripe(settings.secretKey, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 20_000 });

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
          return snapshotFromStripe(await stripe.subscriptions.retrieve(id, { expand: ["latest_invoice"] }));
        } catch (error) {
          if (error instanceof Stripe.errors.StripeInvalidRequestError && error.statusCode === 404) return null;
          throw error;
        }
      }),

    listSubscriptions: (customerId) =>
      call("list subscriptions", async () => {
        const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100, expand: ["data.latest_invoice"] });
        return list.data.map(snapshotFromStripe).filter((snapshot) => snapshot.endedAt === null);
      }),

    cancelSubscription: (id, { atPeriodEnd }) =>
      call("cancel a subscription", async () =>
        snapshotFromStripe(
          atPeriodEnd
            ? await stripe.subscriptions.update(id, { cancel_at_period_end: true, expand: ["latest_invoice"] })
            : await stripe.subscriptions.cancel(id, { expand: ["latest_invoice"] })
        )
      ),

    listPrices: () =>
      call("list prices", async () => {
        const list = await stripe.prices.list({ active: true, type: "recurring", limit: 100, expand: ["data.product"] });
        return list.data.map(priceFromStripe);
      }),
  };
}
