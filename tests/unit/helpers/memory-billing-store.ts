import type { NoticeQueue, PendingNotice, PlannedNotice } from "../../../lib/billing/notices";
import { NOTICE_MAX_AGE_MS, NOTICE_MAX_ATTEMPTS } from "../../../lib/billing/notices";
import type { ConsentRecord } from "../../../lib/billing/consent";
import type { BillingStore, BillingTx, HistoryEntry, HistoryMeta, StoredSubscription, SubscriptionFields } from "../../../lib/billing/sync";

/**
 * The billing store in memory, for the unit tests of `lib/billing/sync.ts`. A locked unit of work runs one at a time
 * per key and is rolled back whole when it throws, as the Postgres store's transaction is. It is also the notice queue.
 */

export interface NoticeRecord extends PlannedNotice {
  id: string;
  subscriptionId: string;
  createdAt: Date;
  sentAt: Date | null;
  attempts: number;
}

export interface HistoryRow extends HistoryEntry, HistoryMeta {
  subscriptionId: string;
}

interface State {
  subscriptions: StoredSubscription[];
  history: HistoryRow[];
  events: Map<string, string>;
  notices: NoticeRecord[];
  /** Consents recorded before Checkout (D384), with whose they are. */
  consents: (ConsentRecord & { userId: string })[];
}

const found = (row: StoredSubscription | undefined): StoredSubscription | null => (row ? { ...row } : null);

const copy = (state: State): State => ({
  subscriptions: state.subscriptions.map((row) => ({ ...row })),
  history: state.history.map((row) => ({ ...row })),
  events: new Map(state.events),
  notices: state.notices.map((row) => ({ ...row })),
  consents: state.consents.map((row) => ({ ...row })),
});

export class MemoryBillingStore implements BillingStore, NoticeQueue {
  state: State = { subscriptions: [], history: [], events: new Map(), notices: [], consents: [] };
  readonly users = new Set<string>();
  /** Each person's address, for delivery; a user without one is given `<id>@example.test`. */
  readonly emails = new Map<string, string>();
  readonly prices = new Map<string, { id: string; tierId: string }>();
  private serial = 0;
  private readonly queues = new Map<string, Promise<unknown>>();

  /** The person's row, or the row holding a provider id. */
  row(userId: string): StoredSubscription | undefined {
    return this.state.subscriptions.find((row) => row.userId === userId);
  }

  historyOf(userId: string): HistoryRow[] {
    const row = this.row(userId);
    return row ? this.state.history.filter((entry) => entry.subscriptionId === row.id) : [];
  }

  private tx(state: State): BillingTx {
    const appendHistory = async (subscriptionId: string, entries: HistoryEntry[], meta: HistoryMeta) => {
      for (const entry of entries) state.history.push({ subscriptionId, ...entry, ...meta });
    };
    return {
      eventSeen: async (id) => state.events.has(id),
      recordEvent: async (id, type) => {
        if (state.events.has(id)) throw new Error(`unique constraint: event ${id}`);
        state.events.set(id, type);
      },
      // Copies, as a query returns: a row read before a write must not change with it.
      subscriptionByProviderId: async (id) => found(state.subscriptions.find((row) => row.stripeSubscriptionId === id)),
      subscriptionByUser: async (userId) => found(state.subscriptions.find((row) => row.userId === userId)),
      subscriptionByCustomer: async (customerId) => found(state.subscriptions.find((row) => row.stripeCustomerId === customerId)),
      userExists: async (userId) => this.users.has(userId),
      priceByProviderId: async (id) => this.prices.get(id) ?? null,
      save: async (id: string | null, fields: SubscriptionFields, entries: HistoryEntry[], meta: HistoryMeta) => {
        let row = id ? state.subscriptions.find((candidate) => candidate.id === id) : undefined;
        if (id && !row) throw new Error(`no subscription row ${id}`);
        if (!row) {
          if (state.subscriptions.some((candidate) => candidate.userId === fields.userId)) throw new Error("unique constraint: userId");
          this.serial += 1;
          row = { id: `row${this.serial}`, ...fields };
          state.subscriptions.push(row);
        } else Object.assign(row, fields);
        await appendHistory(row.id, entries, meta);
        return row.id;
      },
      appendHistory,
      noticesOf: async (subscriptionId) => state.notices.filter((row) => row.subscriptionId === subscriptionId),
      queueNotices: async (subscriptionId, notices) => {
        for (const notice of notices) {
          const same = (row: NoticeRecord) =>
            row.subscriptionId === subscriptionId && row.slot === notice.slot && row.failedAt.getTime() === notice.failedAt.getTime();
          if (state.notices.some(same)) continue;
          this.serial += 1;
          state.notices.push({ ...notice, id: `notice${this.serial}`, subscriptionId, createdAt: this.clock(), sentAt: null, attempts: 0 });
        }
      },
      consentFor: async (id, userId) => {
        const row = state.consents.find((consent) => consent.id === id && consent.userId === userId);
        if (!row) return null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { userId: _owner, ...record } = row;
        return record;
      },
      linkConsent: async (id, subscriptionId) => {
        state.consents.find((consent) => consent.id === id)!.subscriptionId = subscriptionId;
      },
    };
  }

  locked<T>(key: string, work: (tx: BillingTx) => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const run = previous.then(async () => {
      const draft = copy(this.state);
      const result = await work(this.tx(draft));
      this.state = draft;
      return result;
    });
    this.queues.set(
      key,
      run.catch(() => undefined)
    );
    return run;
  }

  async eventSeen(id: string): Promise<boolean> {
    return this.state.events.has(id);
  }

  async recordEvent(id: string, type: string): Promise<void> {
    this.state.events.set(id, type);
  }

  /** The clock queued notices are stamped with; a test moves it with its own. */
  clock: () => Date = () => new Date();

  async pending(now: Date): Promise<PendingNotice[]> {
    return this.state.notices
      .filter(
        (row) => row.sentAt === null && row.attempts < NOTICE_MAX_ATTEMPTS && row.createdAt.getTime() > now.getTime() - NOTICE_MAX_AGE_MS
      )
      .map((row) => {
        const userId = this.state.subscriptions.find((sub) => sub.id === row.subscriptionId)!.userId;
        return { id: row.id, message: row.message, values: row.values, email: this.emails.get(userId) ?? `${userId}@example.test` };
      });
  }

  async claim(id: string, now: Date): Promise<boolean> {
    const row = this.state.notices.find((candidate) => candidate.id === id);
    if (!row || row.sentAt !== null) return false;
    row.sentAt = now;
    row.attempts += 1;
    return true;
  }

  async release(id: string): Promise<void> {
    this.state.notices.find((row) => row.id === id)!.sentAt = null;
  }

  async openSubscriptionIds(): Promise<string[]> {
    return this.state.subscriptions
      .filter((row) => row.endedAt === null && row.stripeSubscriptionId && !["canceled", "incomplete_expired"].includes(row.status))
      .map((row) => row.stripeSubscriptionId!);
  }
}
