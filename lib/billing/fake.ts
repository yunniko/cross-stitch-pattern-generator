import {
  BillingUnavailableError,
  type BillingGateway,
  type BillingInterval,
  type CheckoutInput,
  type NewPrice,
  type PaymentTotals,
  type ProviderPayment,
  type ProviderPrice,
  type SubscriptionSnapshot,
} from "./contract";
import { readEventObject } from "./event-reference";
import { signPayload, verifySignature } from "./signature";

/** The signing secret the fake uses when none is set: it guards nothing, as the fake runs only on this machine. */
export const FAKE_WEBHOOK_SECRET = "whsec_fake_local_only";

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
  /** Where the open invoice's period starts: the period's start, or the moment of a change of plan (G-129). */
  invoiceFrom: Date;
}

interface FakeCharge {
  customerId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  at: Date;
  refunded: number;
  disputed: boolean;
  period: { start: Date; end: Date };
}

const DAY = 24 * 3_600_000;
const PERIOD_MS: Record<BillingInterval, number> = { MONTH: 30 * DAY, YEAR: 365 * DAY };
/** How long after a failed attempt the fake tries again: Stripe's schedule is the account's, and this is any one schedule. */
const RETRY_MS = 3 * DAY;

export class FakeBilling implements BillingGateway {
  readonly id = "fake" as const;
  /** Every event emitted, oldest first; a test delivers them as it likes. */
  readonly events: SignedEvent[] = [];
  /** While true, every call to the provider fails as an outage would. */
  unavailable = false;
  /** While true, the card declines the payment of a change of plan made now (G-129 M3), and the change does not stand. */
  declineChanges = false;

  private readonly prices = new Map<string, ProviderPrice>();
  /** Prices made through the contract, by the request's key: the same key makes no second price, as at Stripe. */
  private readonly madePrices = new Map<string, { priceId: string; productId: string }>();
  private readonly products = new Map<string, string>();
  private readonly subscriptions = new Map<string, FakeSubscription>();
  private readonly sessions = new Map<string, CheckoutInput>();
  /** Each paid invoice's charge, by id, with its customer and subscription, oldest first. */
  private readonly charges = new Map<string, FakeCharge>();
  /** Refunds made through the contract, by the request's key: the same key refunds once, as at Stripe. */
  private readonly refundKeys = new Set<string>();
  private serial = 0;
  /** How many of `events` the app has delivered to its own webhook (`takeUndelivered`). */
  private delivered = 0;

  constructor(
    private readonly webhookSecret: string,
    private readonly siteUrl: string,
    /** The provider's clock; a test moves it. */
    public now: () => Date = () => new Date(),
    /**
     * Where a price the fake was not given comes from. On a local server it is the database's `Price` rows, so the
     * prices an admin attaches are the ones the fake sells (`gateway.ts`); unit tests add theirs with `addPrice`.
     */
    private readonly resolvePrice?: (id: string) => Promise<ProviderPrice | null>
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
    const { interval, invoiceId, invoiceFrom, ...snapshot } = subscription;
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
    if (!(await this.knownPrice(input.priceId))?.active) throw new Error(`the fake provider has no active price ${input.priceId}`);
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
    // A subscription that will not renew has no change waiting for the renewal, as releasing Stripe's schedule does.
    subscription.scheduledPriceId = null;
    if (options.atPeriodEnd) subscription.cancelAtPeriodEnd = true;
    else {
      subscription.status = "canceled";
      subscription.endedAt = this.now();
      subscription.canceledFor = "request";
      this.emit("customer.subscription.deleted", this.subscriptionObject(subscription));
      return this.snapshot(subscription);
    }
    this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
    return this.snapshot(subscription);
  }

  async resumeSubscription(id: string): Promise<SubscriptionSnapshot> {
    this.reachable();
    const subscription = this.get(id);
    subscription.cancelAtPeriodEnd = false;
    this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
    return this.snapshot(subscription);
  }

  async changePlan(subscriptionId: string, priceId: string, when: "now" | "renewal"): Promise<{ applied: boolean }> {
    this.reachable();
    const subscription = this.get(subscriptionId);
    const price = await this.knownPrice(priceId);
    if (!price?.interval) throw new Error(`the fake provider has no recurring price ${priceId}`);
    if (when === "renewal") {
      subscription.scheduledPriceId = priceId;
      this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
      return { applied: true };
    }
    // As Stripe's `payment_behavior: "pending_if_incomplete"`: a declined payment leaves the subscription as it was.
    if (this.declineChanges) return { applied: false };
    const old = subscription.priceId ? await this.knownPrice(subscription.priceId) : undefined;
    const now = this.now();
    const left = Math.max(0, subscription.currentPeriodEnd!.getTime() - now.getTime()) / PERIOD_MS[subscription.interval];
    // The old price's unused part is credited, rounded up; the new one charged for the same time, rounded down (D386).
    const credit = Math.ceil((old?.amount ?? 0) * left);
    let amount: number;
    if (price.interval === subscription.interval) amount = Math.floor((price.amount ?? 0) * left) - credit;
    else {
      // A change of period starts a new period now, as Stripe resets the billing cycle: the new price whole, less the credit.
      subscription.currentPeriodEnd = new Date(now.getTime() + PERIOD_MS[price.interval]);
      amount = (price.amount ?? 0) - credit;
    }
    subscription.priceId = priceId;
    subscription.interval = price.interval;
    subscription.scheduledPriceId = null;
    subscription.invoiceFrom = now;
    this.newInvoice(subscription);
    if (amount > 0) this.charge(subscription, amount);
    this.emit("invoice.paid", this.invoiceObject(subscription));
    this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
    return { applied: true };
  }

  async dropScheduledChange(subscriptionId: string): Promise<void> {
    this.reachable();
    const subscription = this.get(subscriptionId);
    subscription.scheduledPriceId = null;
    this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
  }

  async chargeCustomer(chargeId: string): Promise<string | null> {
    this.reachable();
    return this.charges.get(chargeId)?.customerId ?? null;
  }

  async listPrices(): Promise<ProviderPrice[]> {
    this.reachable();
    return [...this.prices.values()];
  }

  async createPrice(input: NewPrice): Promise<{ priceId: string; productId: string }> {
    this.reachable();
    const made = this.madePrices.get(input.requestKey);
    if (made) return made;
    const productId = input.productId ?? this.nextId("prod");
    this.products.set(productId, input.productName);
    const price = this.addPrice({
      amount: input.amount,
      currency: input.currency,
      interval: input.interval,
      productName: input.productName,
    });
    const result = { priceId: price.id, productId };
    this.madePrices.set(input.requestKey, result);
    return result;
  }

  async setPriceActive(priceId: string, active: boolean): Promise<void> {
    this.reachable();
    const price = this.prices.get(priceId);
    // A price the fake does not hold in memory is one made before the server restarted: the database's row is the one
    // the fake sells by (`resolvePrice`), so there is nothing here to change.
    if (price) this.prices.set(priceId, { ...price, active });
  }

  async listPayments(customerId: string): Promise<ProviderPayment[]> {
    this.reachable();
    return [...this.charges]
      .filter(([, charge]) => charge.customerId === customerId)
      .reverse()
      .map(([id, charge]) => ({
        id,
        amount: charge.amount,
        currency: charge.currency,
        paidAt: charge.at,
        refunded: charge.refunded,
        disputed: charge.disputed,
        period: charge.period,
      }));
  }

  async refundPayment(paymentId: string, requestKey: string, amount?: number): Promise<void> {
    this.reachable();
    if (this.refundKeys.has(requestKey)) return;
    const charge = this.charges.get(paymentId);
    if (!charge) throw new Error(`the fake provider has no charge ${paymentId}`);
    if (charge.refunded >= charge.amount) throw new Error(`the fake provider's charge ${paymentId} is already refunded`);
    // As Stripe refuses an amount above what is left of the charge, or not above zero.
    if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0 || amount > charge.amount - charge.refunded)) {
      throw new Error(`the fake provider cannot refund ${amount} of its charge ${paymentId}`);
    }
    this.refundKeys.add(requestKey);
    this.refund(paymentId, amount);
  }

  async paymentTotals(from: Date, to: Date): Promise<PaymentTotals[]> {
    this.reachable();
    const totals = new Map<string, PaymentTotals>();
    for (const charge of this.charges.values()) {
      if (charge.at < from || charge.at >= to) continue;
      const total = totals.get(charge.currency) ?? { currency: charge.currency, payments: 0, taken: 0, refunded: 0 };
      total.payments += 1;
      total.taken += charge.amount;
      total.refunded += charge.refunded;
      totals.set(charge.currency, total);
    }
    return [...totals.values()];
  }

  async countSubscriptions(): Promise<Record<string, number>> {
    this.reachable();
    const counts: Record<string, number> = {};
    for (const subscription of this.subscriptions.values()) {
      if (subscription.endedAt === null) counts[subscription.status] = (counts[subscription.status] ?? 0) + 1;
    }
    return counts;
  }

  async movePrice(subscriptionId: string, priceId: string): Promise<void> {
    this.reachable();
    const subscription = this.get(subscriptionId);
    const price = await this.knownPrice(priceId);
    if (!price?.interval) throw new Error(`the fake provider has no recurring price ${priceId}`);
    // As with Stripe's `proration_behavior: "none"`: the price changes now, and the next renewal charges it.
    subscription.priceId = priceId;
    subscription.interval = price.interval;
    this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
  }

  async priceInUse(priceId: string): Promise<boolean> {
    this.reachable();
    return [...this.subscriptions.values()].some((subscription) => subscription.priceId === priceId);
  }

  /** A price held in memory, or else the one `resolvePrice` finds, which is then held. */
  private async knownPrice(id: string): Promise<ProviderPrice | undefined> {
    if (!this.prices.has(id) && this.resolvePrice) {
      const found = await this.resolvePrice(id);
      if (found) this.prices.set(found.id, found);
    }
    return this.prices.get(id);
  }

  // --- Driving the fake, as Stripe and the person would ---

  /** An event as delivered now: Stripe signs each delivery attempt anew, so a late one is not refused as stale. */
  delivery(event: SignedEvent): { rawBody: string; signature: string } {
    return { rawBody: event.rawBody, signature: signPayload(event.rawBody, this.webhookSecret, this.now()) };
  }

  /** The events emitted since the last call, oldest first: what the local server's fake pages deliver to its webhook. */
  takeUndelivered(): SignedEvent[] {
    const pending = this.events.slice(this.delivered);
    this.delivered = this.events.length;
    return pending;
  }

  /** A Checkout session not yet paid, with its price; undefined when there is none. */
  openSession(session: string): { input: CheckoutInput; price: ProviderPrice } | undefined {
    const input = this.sessions.get(session);
    const price = input && this.prices.get(input.priceId);
    return input && price ? { input, price } : undefined;
  }

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
      scheduledPriceId: null,
      startedAt: this.now(),
      currentPeriodEnd: new Date(this.now().getTime() + PERIOD_MS[price.interval]),
      cancelAtPeriodEnd: false,
      endedAt: null,
      firstFailedAt: null,
      nextAttemptAt: null,
      payUrl: null,
      actionNeeded: false,
      canceledFor: null,
      userId: input.userId,
      consentId: input.consentId,
      interval: price.interval,
      invoiceId: this.nextId("in"),
      invoiceFrom: this.now(),
    };
    this.subscriptions.set(subscription.id, subscription);
    this.charge(subscription);
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
      subscription.canceledFor = "request";
      this.emit("customer.subscription.deleted", this.subscriptionObject(subscription));
      return this.snapshot(subscription);
    }
    // A change of plan waiting for the renewal takes effect now, before the renewal is charged (D388).
    const scheduled = subscription.scheduledPriceId ? this.prices.get(subscription.scheduledPriceId) : undefined;
    if (scheduled?.interval) {
      subscription.priceId = scheduled.id;
      subscription.interval = scheduled.interval;
    }
    subscription.scheduledPriceId = null;
    subscription.invoiceFrom = subscription.currentPeriodEnd!;
    subscription.currentPeriodEnd = new Date(subscription.currentPeriodEnd!.getTime() + PERIOD_MS[subscription.interval]);
    this.newInvoice(subscription);
    if (payment === "paid") return this.pay(id);
    return this.fail(id);
  }

  /** A payment attempt on the open invoice fails (the first, or a retry). */
  fail(id: string): SubscriptionSnapshot {
    return this.attemptFails(id, "invoice.payment_failed");
  }

  /** A payment attempt needs the person to authenticate: for a renewal, the subscription goes past due as on a failure. */
  requireAction(id: string): SubscriptionSnapshot {
    return this.attemptFails(id, "invoice.payment_action_required");
  }

  private attemptFails(id: string, type: string): SubscriptionSnapshot {
    const subscription = this.get(id);
    subscription.status = "past_due";
    subscription.firstFailedAt ??= this.now();
    subscription.nextAttemptAt = new Date(this.now().getTime() + RETRY_MS);
    subscription.actionNeeded = type === "invoice.payment_action_required";
    // The fake's stand-in for the invoice's own payment page is its Portal, whose button pays the open invoice.
    subscription.payUrl = `${this.siteUrl}/billing/fake-portal?customer=${encodeURIComponent(subscription.customerId)}`;
    this.emit(type, this.invoiceObject(subscription));
    this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
    return this.snapshot(subscription);
  }

  /**
   * The person changes plan in the Portal and the prorated invoice is charged at once. As Stripe does by default, the
   * change is applied whether or not that payment succeeds; a failed one leaves the subscription past due on the new price.
   */
  changePrice(id: string, priceId: string, payment: "paid" | "failed"): SubscriptionSnapshot {
    const subscription = this.get(id);
    if (!this.prices.get(priceId)?.interval) throw new Error(`the fake provider has no recurring price ${priceId}`);
    subscription.priceId = priceId;
    subscription.interval = this.prices.get(priceId)!.interval!;
    subscription.invoiceFrom = this.now();
    this.newInvoice(subscription);
    return payment === "paid" ? this.pay(id) : this.fail(id);
  }

  /** The charge of the last invoice paid; disputes and refunds name it. */
  lastCharge(id: string): string {
    const found = [...this.charges].filter(([, charge]) => charge.subscriptionId === id).pop();
    if (!found) throw new Error(`the fake provider has no charge for ${id}`);
    return found[0];
  }

  /** The person's bank disputes a charge: the event names the charge only, as Stripe's does. */
  dispute(chargeId: string): void {
    const charge = this.charges.get(chargeId);
    if (charge) charge.disputed = true;
    this.emit("charge.dispute.created", { object: "dispute", id: this.nextId("dp"), charge: chargeId });
  }

  /** A charge is refunded, in full or by `amount`, from the provider's dashboard or through the contract. */
  refund(chargeId: string, amount?: number): void {
    const charge = this.charges.get(chargeId);
    if (charge) charge.refunded = amount === undefined ? charge.amount : Math.min(charge.amount, charge.refunded + amount);
    this.emit("charge.refunded", { object: "charge", id: chargeId, customer: charge?.customerId ?? null });
  }

  /** A new invoice becomes the latest: the failure date, read from the latest invoice as Stripe's mapping does, starts again. */
  private newInvoice(subscription: FakeSubscription): void {
    subscription.invoiceId = this.nextId("in");
    this.clearFailure(subscription);
  }

  /** The latest invoice is no longer failing: what Stripe's mapping reads of a failure goes with it. */
  private clearFailure(subscription: FakeSubscription): void {
    subscription.firstFailedAt = null;
    subscription.nextAttemptAt = null;
    subscription.payUrl = null;
    subscription.actionNeeded = false;
  }

  /**
   * The open invoice's first failure moved back by whole days, as if it had failed earlier: how a browser test reaches the
   * end of the grace without waiting for it. Only the date moves and no event is emitted; the app reads it on reconciling.
   */
  backdateFailure(id: string, days: number): SubscriptionSnapshot {
    const subscription = this.get(id);
    if (!subscription.firstFailedAt) throw new Error(`the fake provider's subscription ${id} has no failing invoice`);
    subscription.firstFailedAt = new Date(subscription.firstFailedAt.getTime() - days * DAY);
    return this.snapshot(subscription);
  }

  /**
   * The subscription moved back `days`, as if it had begun that long ago (G-129): its start, its period and its charges
   * all move, so a test reaches day 3 or day 15 of a withdrawal's period without waiting. No event comes of it.
   */
  backdateStart(id: string, days: number): SubscriptionSnapshot {
    const subscription = this.get(id);
    const back = (date: Date) => new Date(date.getTime() - days * DAY);
    if (subscription.startedAt) subscription.startedAt = back(subscription.startedAt);
    if (subscription.currentPeriodEnd) subscription.currentPeriodEnd = back(subscription.currentPeriodEnd);
    subscription.invoiceFrom = back(subscription.invoiceFrom);
    for (const charge of this.charges.values()) {
      if (charge.subscriptionId !== id) continue;
      charge.at = back(charge.at);
      charge.period = { start: back(charge.period.start), end: back(charge.period.end) };
    }
    return this.snapshot(subscription);
  }

  /**
   * The subscription's price is taken, or `amount` when given (a change of plan's difference); a price the fake does not
   * hold charges nothing, as no test reads its amount.
   */
  private charge(subscription: FakeSubscription, amount?: number): void {
    const price = subscription.priceId ? this.prices.get(subscription.priceId) : undefined;
    this.charges.set(this.nextId("ch"), {
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      amount: amount ?? price?.amount ?? 0,
      currency: price?.currency ?? "eur",
      at: this.now(),
      refunded: 0,
      disputed: false,
      period: { start: subscription.invoiceFrom, end: subscription.currentPeriodEnd! },
    });
  }

  /** The open invoice is paid: by a retry, a new card, or the person on the invoice's page. */
  pay(id: string): SubscriptionSnapshot {
    const subscription = this.get(id);
    subscription.status = "active";
    this.clearFailure(subscription);
    this.charge(subscription);
    this.emit("invoice.paid", this.invoiceObject(subscription));
    this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
    return this.snapshot(subscription);
  }

  /** Stripe's retries end: the subscription is cancelled, marked unpaid, or left past due, as the account is set. */
  giveUp(id: string, outcome: "canceled" | "unpaid" | "past_due"): SubscriptionSnapshot {
    const subscription = this.get(id);
    subscription.status = outcome;
    // The retries have ended; whatever the outcome, no further try is planned.
    subscription.nextAttemptAt = null;
    if (outcome === "canceled") {
      subscription.endedAt = this.now();
      subscription.canceledFor = "payment";
      this.emit("customer.subscription.deleted", this.subscriptionObject(subscription));
    } else this.emit("customer.subscription.updated", this.subscriptionObject(subscription));
    return this.snapshot(subscription);
  }
}
