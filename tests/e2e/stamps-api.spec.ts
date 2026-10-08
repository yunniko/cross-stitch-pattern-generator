import { test, expect, type Page } from "@playwright/test";
import { registerReader, uniqueEmail } from "./helpers/auth";
import { featuresDb, setUserFeatures } from "./helpers/features";
import { previewKey } from "../../lib/charts/saved-chart-link";

/**
 * G-119 M2 (D360): the stamp routes against the real database, through a signed-in browser's own requests. A stamp is kept
 * with an id of the server's, read back for placing, renamed, pinned and deleted; anyone else is answered as if it did not
 * exist; the count limit and the feature refuse by name; the stamps go with the account.
 */

/** A 2 x 1 stamp of one red stitch and an empty one, its shape the red stitch alone when `masked`. */
function stamp(name: string, masked = false): string {
  return JSON.stringify({
    formatVersion: 7,
    width: 2,
    height: 1,
    isLandscape: true,
    cellPalette: [0, 255],
    palette: [{ rgb: [200, 30, 40], symbol: "A", name: "Red" }],
    name,
    ...(masked ? { stampMask: [1, 0] } : {}),
  });
}

/** Requests from the page's own session, with the Origin the site's pages send. */
function api(page: Page) {
  const origin = new URL(page.url()).origin;
  const headers = (extra: Record<string, string> = {}) => ({ origin, ...extra });
  return {
    list: () => page.request.get("/api/stamps"),
    create: (body: string) => page.request.post("/api/stamps", { data: body, headers: headers({ "content-type": "application/json" }) }),
    read: (id: string) => page.request.get(`/api/stamps/${id}`),
    rename: (id: string, name: string) => page.request.patch(`/api/stamps/${id}`, { data: { name }, headers: headers() }),
    pin: (id: string, pinned: unknown) => page.request.patch(`/api/stamps/${id}`, { data: { pinned }, headers: headers() }),
    remove: (id: string) => page.request.delete(`/api/stamps/${id}`, { headers: headers() }),
    preview: (id: string, version?: number) => page.request.get(`/api/stamps/${id}/preview${version ? `?v=${previewKey(version)}` : ""}`),
  };
}

test("a stamp is kept by an id of the server's, read back, renamed, pinned and deleted, and is its owner's alone", async ({
  page,
  browser,
}) => {
  await registerReader(page, uniqueEmail("stamper"));
  const stamps = api(page);

  // A visitor is told to sign in.
  const visitor = await browser.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto("/");
  expect((await api(visitorPage).create(stamp("x"))).status()).toBe(401);
  await visitor.close();

  const made = await stamps.create(stamp("  Little   rose ", true));
  expect(made.status()).toBe(201);
  const first = await made.json();
  expect(first).toMatchObject({
    name: "Little rose",
    width: 2,
    height: 1,
    colors: 1,
    swatches: ["#c81e28"],
    backstitch: false,
    pinned: false,
    version: 1,
  });
  expect(first.id).toMatch(/^[a-z0-9]{20,}$/);

  // Read back with its shape; the preview is sixteen pixels a stitch at this size.
  const read = await stamps.read(first.id);
  expect(read.status()).toBe(200);
  expect(read.headers()["x-stamp-version"]).toBe("1");
  expect(JSON.parse(await read.text())).toMatchObject({ name: "Little rose", stampMask: [1, 0], cellPalette: [0, 255] });
  const preview = await stamps.preview(first.id, 1);
  expect(preview.headers()["content-type"]).toBe("image/png");
  expect(preview.headers()["cache-control"]).toContain("immutable");
  const png = await preview.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([32, 16]);
  // A stamp kept before the current drawing has none: drawn on first request, the same picture, and kept.
  await featuresDb().query(`UPDATE "Stamp" SET "preview" = NULL WHERE "id" = $1`, [first.id]);
  expect(Buffer.compare(await (await stamps.preview(first.id, 1)).body(), png)).toBe(0);
  const drawn = await featuresDb().query<{ drawn: boolean }>(`SELECT "preview" IS NOT NULL AS drawn FROM "Stamp" WHERE "id" = $1`, [
    first.id,
  ]);
  expect(drawn.rows[0].drawn).toBe(true);

  // Not a stamp: refused, nothing kept.
  expect((await stamps.create("{}")).status()).toBe(422);
  const blank = await stamps.create(JSON.stringify({ ...JSON.parse(stamp("b")), cellPalette: [255, 255] }));
  expect(blank.status()).toBe(422);
  expect((await blank.json()).error).toContain("nothing in it");

  // Renamed: the row and the document, one version on. Pinned: kept first, not a change.
  expect(await (await stamps.rename(first.id, "Rose bud")).json()).toMatchObject({ name: "Rose bud", version: 2 });
  expect(JSON.parse(await (await stamps.read(first.id)).text()).name).toBe("Rose bud");
  expect((await stamps.create(stamp("Second"))).status()).toBe(201);
  expect((await (await stamps.list()).json()).stamps.map((s: { name: string }) => s.name)).toEqual(["Second", "Rose bud"]);
  expect(await (await stamps.pin(first.id, true)).json()).toEqual({ id: first.id, pinned: true });
  const listed = await (await stamps.list()).json();
  expect(listed.stamps.map((s: { name: string }) => s.name)).toEqual(["Rose bud", "Second"]);
  expect(listed.stamps[0]).toMatchObject({ pinned: true, version: 2 });
  expect(listed.allowed).toBe(100);
  expect((await stamps.pin(first.id, "yes")).status()).toBe(400);

  // Someone else: every request answered as if the stamp did not exist.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await registerReader(otherPage, uniqueEmail("stranger"));
  const theirs = api(otherPage);
  expect((await theirs.read(first.id)).status()).toBe(404);
  expect((await theirs.preview(first.id, 2)).status()).toBe(404);
  expect((await theirs.pin(first.id, false)).status()).toBe(404);
  expect((await theirs.rename(first.id, "Mine")).status()).toBe(404);
  expect((await theirs.remove(first.id)).status()).toBe(404);
  expect((await (await theirs.list()).json()).stamps).toHaveLength(0);
  await other.close();

  // From another site: refused before anything is read.
  expect((await page.request.delete(`/api/stamps/${first.id}`, { headers: { origin: "https://example.com" } })).status()).toBe(403);

  // Deleted.
  expect((await stamps.remove(first.id)).status()).toBe(204);
  expect((await stamps.read(first.id)).status()).toBe(404);
  expect((await (await stamps.list()).json()).stamps).toHaveLength(1);
});

test("the count of stamps is the person's limit, the feature refuses by name, and the stamps go with the account", async ({ page }) => {
  const email = uniqueEmail("stamps-full");
  await registerReader(page, email);
  const stamps = api(page);
  const { rows } = await featuresDb().query<{ id: string }>(`SELECT "id" FROM "User" WHERE "email" = $1`, [email]);
  const userId = rows[0].id;

  // A limit of one: the first fits, the second is refused by name.
  await featuresDb().query(
    `INSERT INTO "UserLimit" ("userId", "limitId", "value", "updatedAt", "updatedBy") VALUES ($1, 'stamps.count', 1, now(), 'e2e')`,
    [userId]
  );
  expect((await stamps.create(stamp("One"))).status()).toBe(201);
  const refused = await stamps.create(stamp("Two"));
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toMatchObject({ reason: "limit", error: expect.stringContaining("You keep 1 stamp, as many as") });
  expect((await (await stamps.list()).json()).allowed).toBe(1);

  // The feature locked: refused by name, though the limit would allow it.
  await featuresDb().query(`UPDATE "UserLimit" SET "value" = NULL WHERE "userId" = $1`, [userId]);
  await setUserFeatures(email, { "stamps.account": "locked" });
  const locked = await stamps.create(stamp("Three"));
  expect(locked.status()).toBe(403);
  expect((await locked.json()).error).toBe("Stamps are not available to you.");

  // The account deleted, its stamps go with it.
  await page.goto("/account");
  await page.click('button:has-text("Delete account…")');
  await page.fill("#confirmEmail", email);
  await page.click('button:has-text("Delete my account")');
  await expect(page).toHaveURL(/\/$/);
  const left = await featuresDb().query<{ n: number }>(`SELECT count(*)::int AS n FROM "Stamp" WHERE "userId" = $1`, [userId]);
  expect(left.rows[0].n).toBe(0);
});
