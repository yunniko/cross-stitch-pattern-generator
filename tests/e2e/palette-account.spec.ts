import { test, expect, type Page } from "@playwright/test";
import { FIXTURE, openSmallChart, showWorkspace } from "./helpers/app";
import { deleteOwnAccount, registerReader, uniqueEmail } from "./helpers/auth";
import { featuresDb, setUserFeatures } from "./helpers/features";

/**
 * G-131 M4 (D398): palettes kept with an account. The routes keep one per name with each colour's name and thread, refuse
 * by the limit and the feature, and answer anyone but the owner as if it did not exist; both pages show the one list; the
 * palettes an earlier version kept in the browser are offered once for moving in; locked or hidden, saving is to a file.
 */

const sea = { mode: "full", colors: [{ rgb: [10, 20, 30], name: "Night sea", system: "anchor", number: "X-403" }, { rgb: [200, 0, 0] }] };

function api(page: Page) {
  const origin = new URL(page.url()).origin;
  return {
    list: () => page.request.get("/api/palettes"),
    save: (body: unknown) => page.request.post("/api/palettes", { data: body, headers: { origin, "content-type": "application/json" } }),
    rename: (id: string, name: string) => page.request.patch(`/api/palettes/${id}`, { data: { name }, headers: { origin } }),
    remove: (id: string) => page.request.delete(`/api/palettes/${id}`, { headers: { origin } }),
    move: (palettes: unknown[]) =>
      page.request.post("/api/palettes/move", { data: { palettes }, headers: { origin, "content-type": "application/json" } }),
  };
}

const block = (page: Page) => page.getByTestId("chart-palette");

async function openChartPalette(page: Page) {
  await openSmallChart(page);
  await showWorkspace(page, "Edit");
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await expect(block(page)).toBeVisible();
}

test("a palette is kept by name with its colours' names and threads, saved over by name, renamed, deleted, and its owner's alone", async ({
  page,
  browser,
}) => {
  await registerReader(page, uniqueEmail("palettes"));
  const palettes = api(page);

  const visitor = await browser.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto("/");
  expect((await api(visitorPage).save({ name: "x", ...sea })).status()).toBe(401);
  await visitor.close();

  const made = await palettes.save({ name: "  Sea  ", ...sea });
  expect(made.status()).toBe(201);
  const first = await made.json();
  expect(first).toMatchObject({ name: "Sea", replaced: false });
  const listed = await (await palettes.list()).json();
  expect(listed.allowed).toBe(100);
  expect(listed.palettes).toHaveLength(1);
  expect(listed.palettes[0].set.colors[0]).toEqual({ rgb: [10, 20, 30], name: "Night sea", source: { brand: "anchor", code: "X-403" } });

  // The same name saves over it; nothing more is counted.
  const over = await palettes.save({ name: "Sea", mode: "full", colors: [{ rgb: [1, 2, 3] }] });
  expect(over.status()).toBe(200);
  expect(await over.json()).toMatchObject({ id: first.id, replaced: true });
  expect((await (await palettes.list()).json()).palettes).toHaveLength(1);

  // Refused by name: an empty palette, a name another one has.
  expect((await palettes.save({ name: "Empty", mode: "full", colors: [] })).status()).toBe(422);
  const other = await (await palettes.save({ name: "Wine", ...sea })).json();
  const clash = await palettes.rename(other.id, "Sea");
  expect(clash.status()).toBe(409);
  expect((await palettes.rename(other.id, "Port")).status()).toBe(200);

  // Someone else is answered as if it did not exist.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await registerReader(strangerPage, uniqueEmail("palette-stranger"));
  const theirs = api(strangerPage);
  expect((await theirs.remove(first.id)).status()).toBe(404);
  expect((await theirs.rename(first.id, "Mine")).status()).toBe(404);
  expect((await (await theirs.list()).json()).palettes).toEqual([]);
  await stranger.close();

  expect((await palettes.remove(first.id)).status()).toBe(204);
  expect((await (await palettes.list()).json()).palettes.map((p: { name: string }) => p.name)).toEqual(["Port"]);
});

test("the count of palettes is the person's limit, the feature refuses by name, and the palettes go with the account", async ({ page }) => {
  const email = uniqueEmail("palettes-full");
  await registerReader(page, email);
  const palettes = api(page);
  const { rows } = await featuresDb().query<{ id: string }>(`SELECT "id" FROM "User" WHERE "email" = $1`, [email]);
  const userId = rows[0].id;

  await featuresDb().query(
    `INSERT INTO "UserLimit" ("userId", "limitId", "value", "updatedAt", "updatedBy") VALUES ($1, 'palettes.count', 1, now(), 'e2e')`,
    [userId]
  );
  expect((await palettes.save({ name: "One", ...sea })).status()).toBe(201);
  const refused = await palettes.save({ name: "Two", ...sea });
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toMatchObject({ reason: "limit", error: expect.stringContaining("You keep 1 palette, as many as") });
  // Saving over the one kept is no more palettes.
  expect((await palettes.save({ name: "One", ...sea })).status()).toBe(200);
  // A move stops at the limit and says why.
  const move = await palettes.move([{ name: "Moved", ...sea }]);
  expect(move.status()).toBe(200);
  expect(await move.json()).toMatchObject({ moved: [], refusal: expect.stringContaining("You keep 1 palette") });

  await setUserFeatures(email, { "palettes.account": "locked" });
  const locked = await palettes.save({ name: "One", ...sea });
  expect(locked.status()).toBe(403);
  expect((await locked.json()).error).toBe("Palettes are not available to you.");

  await deleteOwnAccount(page, email);
  const left = await featuresDb().query<{ n: number }>(`SELECT count(*)::int AS n FROM "Palette" WHERE "userId" = $1`, [userId]);
  expect(left.rows[0].n).toBe(0);
});

test("a palette saved to the account while setting up is in the Edit page's list after a reload, loads there and is deleted there", async ({
  page,
}) => {
  await registerReader(page, uniqueEmail("palette-pages"));
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByRole("button", { name: /^(Generate pattern|Regenerate)$/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Set up palette" }).click();
  await page.getByLabel("Colour to add").fill("#123456");
  await page.getByRole("button", { name: "Add colour" }).click();
  await expect(page.getByText("Sign in to keep palettes with your account.")).toHaveCount(0);
  await page.getByLabel("Palette name").fill("Deep");
  await page.getByRole("button", { name: "Save to account" }).click();
  await expect(page.getByTestId("palette-note")).toHaveText("Saved “Deep” to your account.");
  await expect(page.getByLabel("Saved palettes").locator("option")).toHaveText(["Your palettes…", "Deep (1)"]);

  await openChartPalette(page);
  await block(page).getByLabel("Saved palettes").selectOption({ label: "Deep (1)" });
  await block(page).getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByTestId("palette-load-choice")).toContainText("1 not in this chart");
  await page.getByTestId("palette-load-choice").getByRole("button", { name: "Cancel" }).click();

  await block(page).getByLabel("Saved palettes").selectOption({ label: "Deep (1)" });
  await block(page).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByTestId("chart-palette-note")).toHaveText("Deleted “Deep”.");
  await expect(block(page).getByLabel("Saved palettes")).toHaveCount(0);
});

test("the palettes kept in this browser are offered once for moving into the account, a name taken there getting a number", async ({
  page,
}) => {
  await registerReader(page, uniqueEmail("palette-move"));
  expect((await api(page).save({ name: "Old", ...sea })).status()).toBe(201);
  await page.evaluate(() =>
    window.localStorage.setItem(
      "cross-stitch:saved-palettes",
      JSON.stringify([
        { name: "Old", mode: "full", colors: [{ rgb: [1, 1, 1] }] },
        { name: "Moss", mode: "dmc", colors: [{ code: "310", rgb: [0, 0, 0] }] },
      ])
    )
  );
  await openChartPalette(page);
  const offer = page.getByTestId("palette-move-offer");
  await expect(offer).toContainText("This browser keeps 2 palettes from before.");
  await offer.getByRole("button", { name: "Move to account" }).click();
  await expect(page.getByTestId("chart-palette-note")).toHaveText("Moved 2 palettes into your account.");
  await expect(offer).toHaveCount(0);
  const names = ((await (await api(page).list()).json()).palettes as { name: string }[]).map((p) => p.name).sort();
  expect(names).toEqual(["Moss", "Old", "Old (2)"]);

  await openChartPalette(page);
  await expect(block(page).getByLabel("Saved palettes").locator("option")).toHaveCount(4);
  await expect(page.getByTestId("palette-move-offer")).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem("cross-stitch:saved-palettes"))).toBe("[]");
});

test("locked, Save to account says so and takes no press; hidden, a palette is saved as a file only", async ({ page }) => {
  const email = uniqueEmail("palette-gated");
  await registerReader(page, email);
  await setUserFeatures(email, { "palettes.account": "locked" });
  await openChartPalette(page);
  const save = block(page).getByRole("button", { name: "Save to account" });
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute("data-feature-locked", "palettes.account");

  await setUserFeatures(email, { "palettes.account": "hidden" });
  await openChartPalette(page);
  await expect(block(page).getByRole("button", { name: "Save to account" })).toHaveCount(0);
  await expect(block(page).getByRole("button", { name: "Save as file" })).toBeVisible();
  await expect(block(page).getByText("Sign in to keep palettes with your account.")).toHaveCount(0);
});
