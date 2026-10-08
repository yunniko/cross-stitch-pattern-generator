import {
  BillingUnavailableError,
  type BillingGateway,
  type BillingInterval,
  type CheckoutInput,
  type ProviderPrice,
  type SubscriptionSnapshot,
} from "./contract";
import { readEventObject } from "./event-reference";
import { signPayload, verifySignature } from "./signature";

/**
 * The fake billing provider (G-106 M1): the contract kept in memory, with a clock the caller sets. Tests drive a
 * subscription's life through it — Checkout completed, renewals paid or failed, cancellation — and every change emits
 * the signed events Stripe would send, which the test then delivers to the webhook in whatever order, twice, or not at
 * all. It never touches a network. `settings.ts` lets it run only on a local address.
 *
 * Its statuses and event types are Stripe's, as recorded in docs/reviews/2026-10-08-stripe-billing-reference.md.
 */

export interface SignedEvent {
  id: string;
  type: string;
  rawBody: string;
  signature: string;
}

interface FakeSubscription extends SubscriptionSnapshot {
  interval: BillingInterval;
  invoiceId: string;
}

const DAY = 24 * 3_600_000;
const PERIOD_MS: Record<BillingInterval, number> = { MONTH: 30 * DAY, YEAR: 365 * DAY };

export class FakeBilling implements BillingGateway {
  readonly id = "fake" as const;
  /** Every event emitted, oldest first; a test delivers them as it likes. */
  readonly events: SignedEvent[] = [];
  /** While true, every call to the provider fails as an outage would. */
  unavailable = false;

  private readonly prices = new Map<string, ProviderPrice>();
  private readonly subscriptions = new Map<string, FakeSubscription>();
  private readonly sessions = new Map<string, CheckoutInput>();
  private serial = 0;

  constructor(
    private readonly webhookSecret: string,
    private readonly siteUrl: string,
    /** The provider's clock; a test moves it. */
    public now: () => Date = () => new Date()
  ) {}

  private nextId(prefix: string): string {
    this.serial += 1;
    return `${prefix}_fake${String(this.serial).padStart(6, "0")}`;
  }

  private reachable(): void {
    if (this.unavailable) throw new BillingUnavailableError("the fake provider is set unavailable");
  }

  private emit(type: string, object: Record<string, unknown>): void {
    const id = this.nextId("evt");
    const rawBody = JSON.stringify({ id, object: "event", type, created: Math.floor(this.now().getTime() / 1000), data: { object } });
    this.events.push({ id, type, rawBody, signature: signPayload(rawBody, this.webhookSecret, this.now()) });
  }

  private subscriptionObject(subscription: FakeSubscription): Record<string, unknown> {
    return { object: "subscription", id: subscription.id, customer: subscription.customerId, status: subscription.status };
  }

  private invoiceObject(subscription: FakeSubscription): Record<string, unknown> {
    return {
      object: "invoice",
      id: subscription.invoiceId,
      customer: subscription.customerId,
      parent: { subscription_details: { subscription: subscription.id } },
    };
  }

  private snapshot(subscription: FakeSubscription): SubscriptionSnapshot {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { interval, invoiceId, ...snapshot } = subscription;
    return { ...snapshot };
  }

  private get(id: string): FakeSubscription {
    const subscription = this.subscriptions.get(id);
    if (!subscription) throw new Error(`the fake provider has no subscription ${id}`);
    return subscription;
  }

  // --- The contract ---

  async startCheckout(input: CheckoutInput): Promise<{ url: string }> {
    this.reachable();
    if (!this.prices.get(input.priceId)?.active) throw new Error(`the fake provider has no active price ${input.priceId}`);
    const session = this.nextId("cs");
    this.sessions.set(session, input);
    return { url: `${this.siteUrl}/billing/fake-checkout?session=${session}` };
  }

  async openPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    this.reachable();
    return { url: `${this.siteUrl}/billing/fake-portal?customer=${encodeURIComponent(input.customerId)}` };
  }

  readEvent(rawBody: string, signature: string | null) {
    verifySignature(rawBody, signature, this.webhookSecret, this.now());
    return readEventObject(JSON.parse(rawBody));
  }

  async fetchSubscription(id: string): Promise<SubscriptionSnapshot | null> {
    this.reachable();
    const subscription = this.subscriptions.get(id);
    return subscription ? this.snapshot(subscription) : null;
  }

  async listSubscriptions(customerId: string): Promise<SubscriptionSnapshot[]> {
    this.reachable();
    return [...this.subscriptions.values()]
      .filter((subscription) => subscription.customerId === customerId && subscription.endedAt === null)
      .map((subscription) => this.snapshot(subscription));
  }

  async cancelSubscription(id: string, options: { atPeriodEnd: boolean }): Promise<SubscriptionSnapshot> {
    this.reachable();
    const subscription = this.get(id);
    if (options.atPeriodEnd) subscription.cancelAtPeriodEnd = true;
    else {
      subscription.status = "canceled";
      subscription.endedAt = this.now();
      this.emit("customer.subscription.deleted", this.subscriptionObject(subscription));
      return this.snapshot(subscription);
    }
    this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
    return this.snapshot(subscription);
  }

  async listPrices(): Promise<ProviderPrice[]> {
    this.reachable();
    return [...this.prices.values()];
  }

  // --- Driving the fake, as Stripe and the person would ---

  addPrice(price: Omit<ProviderPrice, "id" | "active"> & { id?: string; active?: boolean }): ProviderPrice {
    const added: ProviderPrice = { ...price, id: price.id ?? this.nextId("price"), active: price.active ?? true };
    this.prices.set(added.id, added);
    return added;
  }

  /** The person pays on the fake Checkout page: the subscription starts, as Stripe's events would say. */
  completeCheckout(session: string, customerId: string | null = null): SubscriptionSnapshot {
    const input = this.sessions.get(session);
    const price = input && this.prices.get(input.priceId);
    if (!input || !price?.interval) throw new Error(`the fake provider has no open session ${session}`);
    this.sessions.delete(session);
    const subscription: FakeSubscription = {
      id: this.nextId("sub"),
      customerId: customerId ?? input.customerId ?? this.nextId("cus"),
      status: "active",
      priceId: price.id,
      currentPeriodEnd: new Date(this.now().getTime() + PERIOD_MS[price.interval]),
      cancelAtPeriodEnd: false,
      endedAt: null,
      firstFailedAt: null,
      userId: input.userId,
      interval: price.interval,
      invoiceId: this.nextId("in"),
    };
    this.subscriptions.set(subscription.id, subscription);
    this.emit("checkout.session.completed", {
      object: "checkout.session",
      id: session,
      customer: subscription.customerId,
      subscription: subscription.id,
      client_reference_id: input.userId,
    });
    this.emit("customer.subscription.created", this.subscriptionObject(subscription));
    this.emit("invoice.paid", this.invoiceObject(subscription));
    return this.snapshot(subscription);
  }

  /**
   * The period ends: a subscription set to cancel ends; any other renews, and its invoice is paid or fails. As at
   * Stripe, a renewal moves the period on whether or not the payment succeeds.
   */
  endPeriod(id: string, payment: "paid" | "failed"): SubscriptionSnapshot {
    const subscription = this.get(id);
    if (subscription.cancelAtPeriodEnd) {
      subscription.status = "canceled";
      subscription.endedAt = subscription.currentPeriodEnd;
      this.emit("customer.subscription.deleted", this.subscriptionObject(subscription));
      return this.snapshot(subscription);
    }
    subscription.currentPeriodEnd = new Date(subscription.currentPeriodEnd!.getTime() + PERIOD_MS[subscription.interval]);
    subscription.invoiceId = this.nextId("in");
    if (payment === "paid") return this.pay(id);
    return this.fail(id);
  }

  /** A payment attempt on the open invoice fails (the first, or a retry). */
  fail(id: string): SubscriptionSnapshot {
    const subscription = this.get(id);
    subscription.status = "past_due";
    subscription.firstFailedAt ??= this.now();
    this.emit("invoice.payment_failed", this.invoiceObject(subscription));
    this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
    return this.snapshot(subscription);
  }

  /** The open invoice is paid: by a retry, a new card, or the person on the invoice's page. */
  pay(id: string): SubscriptionSnapshot {
    const subscription = this.get(id);
    subscription.status = "active";
    subscription.firstFailedAt = null;
    this.emit("invoice.paid", this.invoiceObject(subscription));
    this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
    return this.snapshot(subscription);
  }

  /** Stripe's retries end: the subscription is cancelled, marked unpaid, or left past due, as the account is set. */
  giveUp(id: string, outcome: "canceled" | "unpaid" | "past_due"): SubscriptionSnapshot {
    const subscription = this.get(id);
    subscription.status = outcome;
    if (outcome === "canceled") {
      subscription.endedAt = this.now();
      this.emit("customer.subscription.deleted", this.subscriptionObject(subscription));
    } else this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
    return this.snapshot(subscription);
  }
}
