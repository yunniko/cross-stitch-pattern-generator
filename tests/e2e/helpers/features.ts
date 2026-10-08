import { Pool } from "pg";

/**
 * The feature switches' rows, written straight into the suite's database (G-102): the site's states, a person's, and a
 * set with a tier. The admin pages (M3) are the way a person does this; the specs that test the states themselves write
 * the rows and clean them up, so they do not depend on the pages.
 *
 * Plain SQL through `pg`: the generated Prisma client is an ES module the test runner cannot load. The database is the
 * one `scripts/e2e-servers.mjs` and `scripts/playwright-servers.ts` start the servers on.
 */
const E2E_DATABASE_URL = "postgresql://cross_stitch:cross_stitch@127.0.0.1:54324/cross_stitch";

let pool: Pool | null = null;
/** The suite's database, for a spec that needs to read a table straight. */
export function featuresDb(): Pool {
  return db();
}
function db(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL ?? E2E_DATABASE_URL, max: 2 });
  return pool;
}

type State = "on" | "locked" | "hidden";
const SWITCH: Record<State, string> = { on: "ON", locked: "LOCKED", hidden: "HIDDEN" };
const id = () => `e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Sets the site's states; the ids named are the only ones touched. */
export async function setSiteFeatures(states: Record<string, State>): Promise<void> {
  for (const [featureId, state] of Object.entries(states)) {
    await db().query(
      `INSERT INTO "FeatureState" ("featureId", "state", "updatedAt", "updatedBy") VALUES ($1, $2::"FeatureSwitch", now(), 'e2e')
       ON CONFLICT ("featureId") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = now(), "updatedBy" = 'e2e'`,
      [featureId, SWITCH[state]]
    );
  }
}

/** Removes the site's rows for these ids, so the suite leaves everything on. */
export async function clearSiteFeatures(ids: readonly string[]): Promise<void> {
  await db().query(`DELETE FROM "FeatureState" WHERE "featureId" = ANY($1::text[])`, [[...ids]]);
}

async function userId(email: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>(`SELECT "id" FROM "User" WHERE "email" = $1`, [email]);
  if (rows.length === 0) throw new Error(`No account with the email ${email}`);
  return rows[0].id;
}

/** Sets a person's own states, by their email. */
export async function setUserFeatures(email: string, states: Record<string, State>): Promise<void> {
  const user = await userId(email);
  for (const [featureId, state] of Object.entries(states)) {
    await db().query(
      `INSERT INTO "UserFeature" ("userId", "featureId", "state", "updatedAt", "updatedBy") VALUES ($1, $2, $3::"FeatureSwitch", now(), 'e2e')
       ON CONFLICT ("userId", "featureId") DO UPDATE SET "state" = EXCLUDED."state", "updatedAt" = now(), "updatedBy" = 'e2e'`,
      [user, featureId, SWITCH[state]]
    );
  }
}

/** A named set with these states, attached to a tier of the same name; the person is put on that tier, live. */
export async function putOnTierWithSet(email: string, name: string, states: Record<string, State>): Promise<void> {
  const user = await userId(email);
  const setId = id();
  const { rows: sets } = await db().query<{ id: string }>(
    `INSERT INTO "FeatureSet" ("id", "name", "createdAt", "updatedAt") VALUES ($1, $2, now(), now())
     ON CONFLICT ("name") DO UPDATE SET "updatedAt" = now() RETURNING "id"`,
    [setId, name]
  );
  const set = sets[0].id;
  await db().query(`DELETE FROM "FeatureSetEntry" WHERE "setId" = $1`, [set]);
  for (const [featureId, state] of Object.entries(states)) {
    await db().query(`INSERT INTO "FeatureSetEntry" ("setId", "featureId", "state") VALUES ($1, $2, $3::"FeatureSwitch")`, [
      set,
      featureId,
      SWITCH[state],
    ]);
  }
  const { rows: tiers } = await db().query<{ id: string }>(
    `INSERT INTO "Tier" ("id", "name", "featureSetId", "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())
     ON CONFLICT ("name") DO UPDATE SET "featureSetId" = EXCLUDED."featureSetId", "updatedAt" = now() RETURNING "id"`,
    [id(), name, set]
  );
  await db().query(
    `INSERT INTO "Subscription" ("id", "userId", "tierId", "status", "currentPeriodEnd", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'active', now() + interval '30 days', now(), now())
     ON CONFLICT ("userId") DO UPDATE SET "tierId" = EXCLUDED."tierId", "status" = 'active',
       "currentPeriodEnd" = EXCLUDED."currentPeriodEnd", "updatedAt" = now()`,
    [id(), user, tiers[0].id]
  );
}

/** Takes the person off any tier and removes their own states, and the set and tier named. */
export async function clearPersonFeatures(email: string, setName?: string): Promise<void> {
  const { rows } = await db().query<{ id: string }>(`SELECT "id" FROM "User" WHERE "email" = $1`, [email]);
  if (rows.length > 0) {
    await db().query(`DELETE FROM "UserFeature" WHERE "userId" = $1`, [rows[0].id]);
    await db().query(`DELETE FROM "Subscription" WHERE "userId" = $1`, [rows[0].id]);
  }
  if (setName) {
    await db().query(`DELETE FROM "Tier" WHERE "name" = $1`, [setName]);
    await db().query(`DELETE FROM "FeatureSet" WHERE "name" = $1`, [setName]);
  }
}

/** A set with these states, given to every guest or every signed-in account (D307); returns the set's name. */
export async function giveAudienceSet(audience: "guests" | "accounts", name: string, states: Record<string, State>): Promise<void> {
  const { rows: sets } = await db().query<{ id: string }>(
    `INSERT INTO "FeatureSet" ("id", "name", "createdAt", "updatedAt") VALUES ($1, $2, now(), now())
     ON CONFLICT ("name") DO UPDATE SET "updatedAt" = now() RETURNING "id"`,
    [id(), name]
  );
  const set = sets[0].id;
  await db().query(`DELETE FROM "FeatureSetEntry" WHERE "setId" = $1`, [set]);
  for (const [featureId, state] of Object.entries(states)) {
    await db().query(`INSERT INTO "FeatureSetEntry" ("setId", "featureId", "state") VALUES ($1, $2, $3::"FeatureSwitch")`, [
      set,
      featureId,
      SWITCH[state],
    ]);
  }
  await db().query(
    `INSERT INTO "AudienceSet" ("audience", "featureSetId", "updatedAt") VALUES ($1, $2, now())
     ON CONFLICT ("audience") DO UPDATE SET "featureSetId" = EXCLUDED."featureSetId", "updatedAt" = now()`,
    [audience, set]
  );
}

/** Takes the sets away from guests and accounts, and removes the sets named. */
export async function clearAudienceSets(names: readonly string[]): Promise<void> {
  await db().query(`DELETE FROM "AudienceSet"`);
  await db().query(`DELETE FROM "FeatureSet" WHERE "name" = ANY($1::text[])`, [[...names]]);
}

/** Removes every limit row of the site and of guests and accounts, and a person's, so the suite leaves the defaults (G-108). */
export async function clearLimits(email?: string): Promise<void> {
  await db().query(`DELETE FROM "SiteLimit"`);
  await db().query(`DELETE FROM "AudienceLimit"`);
  if (email) await db().query(`DELETE FROM "UserLimit" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "email" = $1)`, [email]);
}

/** A tier of this name, made if it is missing, with no set; returns its id. */
export async function ensureTier(name: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO "Tier" ("id", "name", "createdAt", "updatedAt") VALUES ($1, $2, now(), now())
     ON CONFLICT ("name") DO UPDATE SET "updatedAt" = now() RETURNING "id"`,
    [id(), name]
  );
  return rows[0].id;
}

/** A layer's stored value for a limit: undefined for no row, null for unlimited. */
export async function storedLimit(table: "SiteLimit" | "AudienceLimit" | "TierLimit" | "UserLimit", where: string, params: unknown[]) {
  const { rows } = await db().query<{ value: number | null }>(`SELECT "value" FROM "${table}" WHERE ${where}`, params);
  return rows.length === 0 ? undefined : rows[0].value;
}
