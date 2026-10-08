import { test, expect, type Page } from "@playwright/test";
import { registerReader, uniqueEmail } from "./helpers/auth";
import { featuresDb } from "./helpers/features";

/**
 * G-108 part 1 M2 (D354): the saved-chart routes against the real database, through a signed-in browser's own requests.
 * A chart is made with an id of the server's, overwritten by that id at the version last seen, refused on a stale one,
 * renamed, deleted; anyone else is answered as if it did not exist; the space limit refuses by name; the charts go with
 * the account. Each save stores a preview drawn by the server (M6, D357), its owner's alone.
 */

function chart(name: string, cells = 4): string {
  const side = Math.ceil(Math.sqrt(cells));
  return JSON.stringify({
    formatVersion: 7,
    width: side,
    height: side,
    isLandscape: false,
    cellPalette: new Array(side * side).fill(0),
    palette: [{ rgb: [200, 30, 40], symbol: "A", name: "Red" }],
    name,
  });
}

/** Requests from the page's own session, with the Origin the site's pages send. */
function api(page: Page) {
  const origin = new URL(page.url()).origin;
  const headers = (extra: Record<string, string> = {}) => ({ origin, ...extra });
  return {
    list: () => page.request.get("/api/charts"),
    create: (body: string) => page.request.post("/api/charts", { data: body, headers: headers({ "content-type": "application/json" }) }),
    read: (id: string) => page.request.get(`/api/charts/${id}`),
    overwrite: (id: string, body: string, version?: number) =>
      page.request.put(`/api/charts/${id}`, {
        data: body,
        headers: headers({ "content-type": "application/json", ...(version ? { "x-chart-version": String(version) } : {}) }),
      }),
    rename: (id: string, name: string) => page.request.patch(`/api/charts/${id}`, { data: { name }, headers: headers() }),
    remove: (id: string) => page.request.delete(`/api/charts/${id}`, { headers: headers() }),
    preview: (id: string, version?: number) => page.request.get(`/api/charts/${id}/preview${version ? `?v=${version}` : ""}`),
  };
}

/** A preview's size in pixels, read from its PNG header; one pixel is one stitch. */
async function previewSize(response: { headers(): Record<string, string>; body(): Promise<Buffer> }): Promise<[number, number]> {
  expect(response.headers()["content-type"]).toBe("image/png");
  const png = await response.body();
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

test("a chart is saved by an id of the server's, overwritten at its version, renamed and deleted, and is its owner's alone", async ({
  page,
  browser,
}) => {
  const email = uniqueEmail("saver");
  await registerReader(page, email);
  const charts = api(page);

  // A visitor is told to sign in.
  const visitor = await browser.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto("/");
  expect((await api(visitorPage).create(chart("x"))).status()).toBe(401);

  // Made: an id of the server's, version 1, the name read from the file.
  const made = await charts.create(chart("  Rose   garden "));
  expect(made.status()).toBe(201);
  const first = await made.json();
  expect(first).toMatchObject({ name: "Rose garden", version: 1 });
  expect(first.id).toMatch(/^[a-z0-9]{20,}$/);

  // Saved again under a new name: the same chart, one version on, renamed. Not a second chart.
  const again = await charts.overwrite(first.id, chart("Roses"), 1);
  expect(again.status()).toBe(200);
  expect(await again.json()).toMatchObject({ id: first.id, name: "Roses", version: 2 });
  let listed = await (await charts.list()).json();
  expect(listed.charts).toHaveLength(1);
  expect(listed.charts[0]).toMatchObject({ id: first.id, name: "Roses", width: 2, height: 2, colors: 1, version: 2 });
  expect(listed.allowed).toBe(50);

  // A save from a browser that saw version 1 is refused with the version it is at; one naming none is refused too.
  const stale = await charts.overwrite(first.id, chart("Old"), 1);
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({ reason: "conflict", version: 2 });
  expect((await charts.overwrite(first.id, chart("Old"))).status()).toBe(400);

  // Read whole, with its version and name.
  const read = await charts.read(first.id);
  expect(read.status()).toBe(200);
  expect(read.headers()["x-chart-version"]).toBe("2");
  expect(decodeURIComponent(read.headers()["x-chart-name"])).toBe("Roses");
  expect(JSON.parse(await read.text()).name).toBe("Roses");

  // Not a chart: refused, nothing kept.
  expect((await charts.create("{}")).status()).toBe(422);

  // Renamed: the row and the file's own name, one version on.
  const renamed = await charts.rename(first.id, "Rose bed");
  expect(await renamed.json()).toMatchObject({ name: "Rose bed", version: 3 });
  expect(JSON.parse(await (await charts.read(first.id)).text()).name).toBe("Rose bed");

  // The preview: drawn at every save, kept by a rename, kept by the browser only at the version it shows.
  expect(await previewSize(await charts.preview(first.id, 3))).toEqual([2, 2]);
  expect((await charts.overwrite(first.id, chart("Rose bed", 9), 3)).status()).toBe(200);
  const redrawn = await charts.preview(first.id, 4);
  expect(await previewSize(redrawn)).toEqual([3, 3]);
  expect(redrawn.headers()["cache-control"]).toContain("immutable");
  expect((await charts.preview(first.id)).headers()["cache-control"]).toBe("private, no-cache");
  // A chart saved before previews existed: drawn on first request and kept, its save time unchanged.
  const before = await featuresDb().query<{ updatedAt: Date }>(
    `UPDATE "SavedChart" SET "preview" = NULL WHERE "id" = $1 RETURNING "updatedAt"`,
    [first.id]
  );
  expect(await previewSize(await charts.preview(first.id, 4))).toEqual([3, 3]);
  const kept = await featuresDb().query<{ drawn: boolean; updatedAt: Date }>(
    `SELECT "preview" IS NOT NULL AS drawn, "updatedAt" FROM "SavedChart" WHERE "id" = $1`,
    [first.id]
  );
  expect(kept.rows[0]).toEqual({ drawn: true, updatedAt: before.rows[0].updatedAt });

  // Someone else: every request answered as if the chart did not exist.
  const otherEmail = uniqueEmail("stranger");
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await registerReader(otherPage, otherEmail);
  const theirs = api(otherPage);
  expect((await theirs.read(first.id)).status()).toBe(404);
  expect((await theirs.preview(first.id, 4)).status()).toBe(404);
  expect((await theirs.overwrite(first.id, chart("Mine"), 4)).status()).toBe(404);
  expect((await theirs.rename(first.id, "Mine")).status()).toBe(404);
  expect((await theirs.remove(first.id)).status()).toBe(404);
  expect((await (await theirs.list()).json()).charts).toHaveLength(0);
  await other.close();

  // From another site: refused before anything is read.
  expect((await page.request.delete(`/api/charts/${first.id}`, { headers: { origin: "https://example.com" } })).status()).toBe(403);

  // Deleted.
  expect((await charts.remove(first.id)).status()).toBe(204);
  expect((await charts.read(first.id)).status()).toBe(404);
  expect((await charts.preview(first.id)).status()).toBe(404);
  listed = await (await charts.list()).json();
  expect(listed).toMatchObject({ charts: [], used: 0 });
  await visitor.close();
});

test("the space for saved charts is the person's limit; a save over it is refused by name, and the charts go with the account", async ({
  page,
}) => {
  const email = uniqueEmail("full");
  await registerReader(page, email);
  const charts = api(page);
  const { rows } = await featuresDb().query<{ id: string }>(`SELECT "id" FROM "User" WHERE "email" = $1`, [email]);
  const userId = rows[0].id;
  // This person's own limit: 0 MB, so nothing fits.
  await featuresDb().query(
    `INSERT INTO "UserLimit" ("userId", "limitId", "value", "updatedAt", "updatedBy") VALUES ($1, 'storage.charts', 0, now(), 'e2e')`,
    [userId]
  );
  const refused = await charts.create(chart("Too much"));
  expect(refused.status()).toBe(403);
  const body = await refused.json();
  expect(body.reason).toBe("storage");
  expect(body.error).toContain("of your 0 MB for saved charts");
  expect((await (await charts.list()).json()).allowed).toBe(0);

  // Unlimited: it fits.
  await featuresDb().query(`UPDATE "UserLimit" SET "value" = NULL WHERE "userId" = $1`, [userId]);
  expect((await charts.create(chart("Fits"))).status()).toBe(201);
  expect((await (await charts.list()).json()).allowed).toBe("unlimited");

  // The account deleted, its charts and its limit go with it.
  await page.goto("/account");
  await page.click('button:has-text("Delete account…")');
  await page.fill("#confirmEmail", email);
  await page.click('button:has-text("Delete my account")');
  await expect(page).toHaveURL(/\/$/);
  const left = await featuresDb().query<{ n: number }>(
    `SELECT (SELECT count(*) FROM "SavedChart" WHERE "userId" = $1)::int + (SELECT count(*) FROM "UserLimit" WHERE "userId" = $1)::int AS n`,
    [userId]
  );
  expect(left.rows[0].n).toBe(0);
});
