import { featuresDb } from "./features";

/**
 * A tier on sale for the buying specs (G-106 M3): a feature set, the tier pointing at it, and a monthly and a yearly
 * price. The fake provider sells the `Price` rows it finds (`lib/billing/gateway.ts`), so these rows are all a spec
 * needs. Written straight into the suite's database, as the feature helpers do; G-127's admin pages are the real way.
 */

const id = () => `e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export interface TierOnSale {
  name: string;
  monthlyPriceId: string;
}

export async function putTierOnSale(name: string, states: Record<string, "ON" | "LOCKED" | "HIDDEN">): Promise<TierOnSale> {
  const db = featuresDb();
  const setId = id();
  await db.query(`INSERT INTO "FeatureSet" ("id", "name", "createdAt", "updatedAt") VALUES ($1, $2, now(), now())`, [setId, name]);
  for (const [featureId, state] of Object.entries(states)) {
    await db.query(`INSERT INTO "FeatureSetEntry" ("setId", "featureId", "state") VALUES ($1, $2, $3::"FeatureSwitch")`, [
      setId,
      featureId,
      state,
    ]);
  }
  const tierId = id();
  await db.query(`INSERT INTO "Tier" ("id", "name", "featureSetId", "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())`, [
    tierId,
    name,
    setId,
  ]);
  const monthlyPriceId = id();
  await db.query(
    `INSERT INTO "Price" ("id", "tierId", "interval", "amount", "currency", "stripePriceId", "current", "createdAt")
     VALUES ($1, $2, 'MONTH', 1000, 'eur', $3, true, now()), ($4, $2, 'YEAR', 10000, 'eur', $5, true, now())`,
    [monthlyPriceId, tierId, `price_${monthlyPriceId}`, id(), `price_${id()}`]
  );
  return { name, monthlyPriceId };
}

/** Removes the person's subscription and the tier, its prices and its set. */
export async function takeTierOffSale(name: string, email: string): Promise<void> {
  const db = featuresDb();
  await db.query(`DELETE FROM "Subscription" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "email" = $1)`, [email]);
  await db.query(`DELETE FROM "Subscription" WHERE "tierId" IN (SELECT "id" FROM "Tier" WHERE "name" = $1)`, [name]);
  await db.query(`DELETE FROM "Price" WHERE "tierId" IN (SELECT "id" FROM "Tier" WHERE "name" = $1)`, [name]);
  await db.query(`DELETE FROM "Tier" WHERE "name" = $1`, [name]);
  await db.query(`DELETE FROM "FeatureSet" WHERE "name" = $1`, [name]);
}

/** The person's subscription history, oldest first: what the webhook wrote. */
export async function subscriptionHistory(email: string): Promise<Array<{ kind: string; source: string }>> {
  const { rows } = await featuresDb().query<{ kind: string; source: string }>(
    `SELECT e."kind", e."source" FROM "SubscriptionEvent" e
       JOIN "Subscription" s ON s."id" = e."subscriptionId"
       JOIN "User" u ON u."id" = s."userId"
     WHERE u."email" = $1 ORDER BY e."at", e."id"`,
    [email]
  );
  return rows;
}
