/**
 * The billing contract (G-106 M1, D366): everything the app asks of a payment provider, and the only way it asks. Two
 * adapters keep it: Stripe's (`stripe-adapter.ts`, the only module that may load the `stripe` package; an ESLint rule
 * enforces it) and a fake (`fake.ts`) for tests and for working without keys. Pages, routes and the webhook see these
 * types and nothing of Stripe's.
 *
 * No card data passes through here: Checkout and the Portal are the provider's own pages, and the app keeps only ids,
 * statuses and dates.
 */

export type BillingInterval = "MONTH" | "YEAR";

/** A subscription as the provider holds it now: what the webhook and the reconciliation write to the database. */
export interface SubscriptionSnapshot {
  /** "sub_..." */
  id: string;
  /** "cus_..." */
  customerId: string;
  /** The provider's status, unchanged; `entitlement.ts` names every one. */
  status: string;
  /** The provider's id of the price subscribed to (the first item's). */
  priceId: string | null;
  /** The end of the period paid for, read from the subscription's item. */
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  endedAt: Date | null;
  /** The first failed attempt of the latest invoice while it is open and unpaid; null otherwise. */
  firstFailedAt: Date | null;
  /** While that invoice is failing: when the provider tries it again; null when no further try is planned. */
  nextAttemptAt: Date | null;
  /** While that invoice is failing: the provider's page where the person pays it, by a new card or by confirming it. */
  payUrl: string | null;
  /** While that invoice is failing: its payment waits for the person to authenticate it, rather than being declined. */
  actionNeeded: boolean;
  /** Why an ended subscription was ended: the person asked, or a payment failed; null for neither, or not ended. */
  canceledFor: "request" | "payment" | null;
  /** Our user id, as Checkout wrote it into the subscription's metadata; null if it is missing. */
  userId: string | null;
}

/** A provider event, verified. Only what the webhook needs to find the subscription; the payload is not kept. */
export interface BillingEventRead {
  /** "evt_..." */
  id: string;
  type: string;
  /** The subscription the event concerns, read from the event's object whatever its kind; null if none. */
  subscriptionId: string | null;
  customerId: string | null;
  /** Our user id where the event carries one (a Checkout session's `client_reference_id`). */
  userId: string | null;
  /** The charge a dispute or refund concerns ("ch_..."); null for other events. */
  chargeId: string | null;
}

export interface ProviderPrice {
  id: string;
  active: boolean;
  /** In the currency's minor unit; null for a price not set as a fixed amount. */
  amount: number | null;
  currency: string;
  /** Null for a price that does not recur monthly or yearly: not one a tier can use. */
  interval: BillingInterval | null;
  productName: string | null;
}

/** A price the admin makes for a tier (G-127, D380). */
export interface NewPrice {
  /** The provider's product of the tier; null for the tier's first price, which makes the product. */
  productId: string | null;
  /** The tier's name, for a product made now. */
  productName: string;
  /** Our tier's id, kept in the provider's metadata so its dashboard can be read back to the tier. */
  tierId: string;
  /** In the currency's minor unit. */
  amount: number;
  currency: string;
  interval: BillingInterval;
  /** One key per admin's form: the same form sent twice makes one price. */
  requestKey: string;
}

export interface CheckoutInput {
  /** The provider's price id (`Price.stripePriceId`). */
  priceId: string;
  userId: string;
  email: string;
  /** The person's customer id from an earlier subscription, so the provider keeps one customer per person. */
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
}

/** The provider refused the event's signature: missing, malformed, wrong or too old. The webhook answers 400. */
export class BillingSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingSignatureError";
  }
}

/** The provider could not be reached, or failed. A caller that needs the answer refuses rather than guesses. */
export class BillingUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BillingUnavailableError";
  }
}

export interface BillingGateway {
  readonly id: "stripe" | "fake";
  /** A Checkout page for one subscription; the person is sent to its address. */
  startCheckout(input: CheckoutInput): Promise<{ url: string }>;
  /** The Customer Portal, where the person changes their card, period or cancels. */
  openPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Verifies the signature over the raw body and reads the event. Throws `BillingSignatureError`. */
  readEvent(rawBody: string, signature: string | null): BillingEventRead;
  /** The subscription as the provider holds it now; null if the provider does not know it. */
  fetchSubscription(id: string): Promise<SubscriptionSnapshot | null>;
  /** Every subscription of a customer that has not ended: how a second one is found. */
  listSubscriptions(customerId: string): Promise<SubscriptionSnapshot[]>;
  /** Cancels now, or at the end of the period paid for; returns the subscription after. */
  cancelSubscription(id: string, options: { atPeriodEnd: boolean }): Promise<SubscriptionSnapshot>;
  /** The customer a charge was made to: a dispute names only its charge (G-126). Null if the provider does not know it. */
  chargeCustomer(chargeId: string): Promise<string | null>;
  /** The provider's recurring prices, for the admin to attach to tiers (G-127). */
  listPrices(): Promise<ProviderPrice[]>;
  /** Makes a recurring price, and the tier's product with its first one (G-127, D380). */
  createPrice(input: NewPrice): Promise<{ priceId: string; productId: string }>;
  /** Offers a price for new subscriptions or stops offering it; subscriptions already on it keep it either way. */
  setPriceActive(priceId: string, active: boolean): Promise<void>;
}
