import type { BillingStore, BillingTx, HistoryEntry, HistoryMeta, StoredSubscription, SubscriptionFields } from "../../../lib/billing/sync";

/**
 * The billing store in memory, for the unit tests of `lib/billing/sync.ts`. A locked unit of work runs one at a time
 * per key and is rolled back whole when it throws, as the Postgres store's transaction is.
 */

export interface HistoryRow extends HistoryEntry, HistoryMeta {
  subscriptionId: string;
}

interface State {
  subscriptions: StoredSubscription[];
  history: HistoryRow[];
  events: Map<string, string>;
}

const copy = (state: State): State => ({
  subscriptions: state.subscriptions.map((row) => ({ ...row })),
  history: state.history.map((row) => ({ ...row })),
  events: new Map(state.events),
});

export class MemoryBillingStore implements BillingStore {
  state: State = { subscriptions: [], history: [], events: new Map() };
  readonly users = new Set<string>();
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
      subscriptionByProviderId: async (id) => state.subscriptions.find((row) => row.stripeSubscriptionId === id) ?? null,
      subscriptionByUser: async (userId) => state.subscriptions.find((row) => row.userId === userId) ?? null,
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
      },
      appendHistory,
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

  async openSubscriptionIds(): Promise<string[]> {
    return this.state.subscriptions
      .filter((row) => row.endedAt === null && row.stripeSubscriptionId && !["canceled", "incomplete_expired"].includes(row.status))
      .map((row) => row.stripeSubscriptionId!);
  }
}
