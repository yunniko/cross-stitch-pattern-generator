import type { Page } from "@playwright/test";
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

const LEGAL_TEXT: Record<"terms" | "privacy" | "withdrawal", string> = {
  terms: "# Terms of service\n\nThe e2e suite's terms.",
  privacy: "# Privacy policy\n\nThe e2e suite's privacy policy.",
  withdrawal: "The plan starts at once, and I lose the right to withdraw from it.",
};

/**
 * The three documents a buyer is shown (D384), published unless some version of each already is: `admin-legal.spec`
 * publishes its own, and whichever is in force is the one agreed to.
 */
export async function ensureLegalDocuments(): Promise<void> {
  const db = featuresDb();
  for (const [kind, body] of Object.entries(LEGAL_TEXT)) {
    await db.query(
      `INSERT INTO "LegalVersion" ("id", "kind", "version", "body", "publishedAt", "publishedBy")
       SELECT $1, $2, 1, $3, now(), 'e2e@example.com'
       WHERE NOT EXISTS (SELECT 1 FROM "LegalVersion" WHERE "kind" = $2)
       ON CONFLICT DO NOTHING`,
      [id(), kind, body]
    );
  }
}

/** Agrees to the terms and the withdrawal acknowledgment on the Plan page, then chooses the price named. */
export async function agreeAndChoose(page: Page, label: string): Promise<void> {
  const consent = page.getByTestId("plan-consent");
  await consent.getByRole("checkbox", { name: /^I agree to the terms of service/ }).check();
  await consent.getByRole("checkbox", { name: "I agree to the following:" }).check();
  await page.getByRole("button", { name: label }).click();
}

/** The person's consents, newest first, with the versions agreed to and whether a subscription is tied to each. */
export async function consentsOf(email: string): Promise<Array<{ termsKind: string; withdrawalKind: string; linked: boolean }>> {
  const { rows } = await featuresDb().query<{ termsKind: string; withdrawalKind: string; linked: boolean }>(
    `SELECT t."kind" AS "termsKind", w."kind" AS "withdrawalKind", c."subscriptionId" IS NOT NULL AS "linked"
       FROM "PurchaseConsent" c
       JOIN "User" u ON u."id" = c."userId"
       JOIN "LegalVersion" t ON t."id" = c."termsVersionId"
       JOIN "LegalVersion" w ON w."id" = c."withdrawalVersionId"
     WHERE u."email" = $1 ORDER BY c."createdAt" DESC`,
    [email]
  );
  return rows;
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
