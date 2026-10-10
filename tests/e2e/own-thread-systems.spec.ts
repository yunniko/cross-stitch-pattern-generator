import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { expectPhotoLoaded, FIXTURE, showWorkspace, waitForAutosave } from "./helpers/app";
import { deleteOwnAccount, registerReader, uniqueEmail } from "./helpers/auth";
import { featuresDb, setUserFeatures } from "./helpers/features";

/**
 * G-132 M4 (D402): a person's own thread systems. Uploaded as CSV or JSON, kept under a `my-` key, private to their owner,
 * counted by the limit and switched by `threads.custom`; offered beside the site's systems in generation, Set up palette,
 * + Add and the colour editor; listed, renamed, downloaded and deleted in the account; deleted with the account.
 */

// Twelve colours far apart, numbered so no site system's thread could be taken for one of them.
const SILK = [
  ["ZZ1", "Ivory", "fffff0"],
  ["ZZ2", "Coal", "111111"],
  ["ZZ3", "Brick", "b22222"],
  ["ZZ4", "Moss", "4a7a2a"],
  ["ZZ5", "Sky", "6fa8dc"],
  ["ZZ6", "Navy", "1f2f6f"],
  ["ZZ7", "Straw", "e6c45a"],
  ["ZZ8", "Rust", "b7602a"],
  ["ZZ9", "Plum", "6a2a6a"],
  ["ZZ10", "Ash", "8a8a8a"],
  ["ZZ11", "Rose", "e8a0b0"],
  ["ZZ12", "Teal", "2a8a8a"],
] as const;
const SILK_CSV = SILK.map((row) => row.join(",")).join("\n");

function api(page: Page) {
  const origin = new URL(page.url()).origin;
  return {
    list: () => page.request.get("/api/thread-systems"),
    upload: (body: unknown) =>
      page.request.post("/api/thread-systems", { data: body, headers: { origin, "content-type": "application/json" } }),
    rename: (id: string, name: string) => page.request.patch(`/api/thread-systems/${id}`, { data: { name }, headers: { origin } }),
    remove: (id: string) => page.request.delete(`/api/thread-systems/${id}`, { headers: { origin } }),
  };
}

const ownChoice = (scope: Page | ReturnType<Page["locator"]>) => scope.getByLabel("Your thread systems");

test("a system is uploaded under a my- key, numbered by name, renamed, refused when it is no list, deleted, and its owner's alone", async ({
  page,
  browser,
}) => {
  await registerReader(page, uniqueEmail("systems"));
  const systems = api(page);

  const visitor = await browser.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto("/");
  expect((await api(visitorPage).upload({ name: "x", text: SILK_CSV })).status()).toBe(401);
  await visitor.close();

  const made = await systems.upload({ name: " Silk ", text: SILK_CSV });
  expect(made.status()).toBe(201);
  const first = await made.json();
  expect(first).toMatchObject({ key: "my-silk", label: "Silk", threads: SILK.map((row) => [...row]) });
  const json = JSON.stringify({ name: "Silk", licence: "CC0", threads: [{ number: "S1", name: "Pearl", hex: "#f0eee8" }] });
  const second = await (await systems.upload({ text: json })).json();
  expect(second).toMatchObject({ key: "my-silk-2", label: "Silk", licence: "CC0" });

  const listed = await (await systems.list()).json();
  expect(listed.allowed).toBe(10);
  expect(listed.systems.map((s: { key: string }) => s.key)).toEqual(["my-silk", "my-silk-2"]);

  // A rename keeps the key, so the person's charts still name it.
  const renamed = await systems.rename(second.id, "Pearl silk");
  expect(renamed.status()).toBe(200);
  expect(await renamed.json()).toMatchObject({ key: "my-silk-2", label: "Pearl silk" });
  expect((await systems.rename(second.id, "")).status()).toBe(422);

  const bad = await systems.upload({ name: "Broken", text: "1,Black" });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error).toBe("Line 1 has 2 cells: each line is a number, a name and a colour.");

  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await registerReader(strangerPage, uniqueEmail("systems-stranger"));
  const theirs = api(strangerPage);
  expect((await theirs.remove(first.id)).status()).toBe(404);
  expect((await theirs.rename(first.id, "Mine")).status()).toBe(404);
  expect((await (await theirs.list()).json()).systems).toEqual([]);
  // Their editor does not offer it either.
  await strangerPage.goto("/");
  await strangerPage.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(strangerPage);
  await expect(ownChoice(strangerPage)).toHaveCount(0);
  await stranger.close();

  expect((await systems.remove(first.id)).status()).toBe(204);
  expect((await (await systems.list()).json()).systems.map((s: { key: string }) => s.key)).toEqual(["my-silk-2"]);
});

test("the count of systems is the person's limit, the switch refuses, and the systems go with the account", async ({ page }) => {
  const email = uniqueEmail("systems-full");
  await registerReader(page, email);
  const systems = api(page);
  const { rows } = await featuresDb().query<{ id: string }>(`SELECT "id" FROM "User" WHERE "email" = $1`, [email]);
  const userId = rows[0].id;

  await featuresDb().query(
    `INSERT INTO "UserLimit" ("userId", "limitId", "value", "updatedAt", "updatedBy") VALUES ($1, 'threads.systems', 1, now(), 'e2e')`,
    [userId]
  );
  expect((await systems.upload({ name: "One", text: SILK_CSV })).status()).toBe(201);
  const refused = await systems.upload({ name: "Two", text: SILK_CSV });
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toMatchObject({ reason: "limit", error: expect.stringContaining("You keep 1 thread system, as many as") });

  await setUserFeatures(email, { "threads.custom": "locked" });
  const locked = await systems.upload({ name: "Two", text: SILK_CSV });
  expect(locked.status()).toBe(403);
  expect((await locked.json()).error).toBe("Thread systems of your own are not available to you.");
  await page.goto("/account/thread-systems");
  await expect(page.getByTestId("own-systems-unavailable")).toBeVisible();
  await setUserFeatures(email, { "threads.custom": "on" });

  await deleteOwnAccount(page, email);
  const left = await featuresDb().query<{ n: number }>(`SELECT count(*)::int AS n FROM "ThreadSystem" WHERE "ownerId" = $1`, [userId]);
  expect(left.rows[0].n).toBe(0);
});

test("the account's page uploads a system, renames it, downloads it as CSV and deletes it", async ({ page }) => {
  await registerReader(page, uniqueEmail("systems-page"));
  await page.goto("/account/thread-systems");
  await expect(page.getByTestId("own-systems-empty")).toBeVisible();
  await expect(page.getByTestId("own-system-count")).toHaveText("0 systems · up to 10");

  const upload = page.getByTestId("own-system-upload");
  await upload.getByTestId("own-system-file").setInputFiles({ name: "silk.csv", mimeType: "text/csv", buffer: Buffer.from(SILK_CSV) });
  await expect(upload.getByTestId("own-system-name")).toHaveValue("silk");
  await expect(upload.getByTestId("own-system-check")).toHaveText("12 threads read.");
  await upload.getByTestId("own-system-name").fill("Silk");
  await upload.getByRole("button", { name: "Keep it" }).click();

  const card = page.getByTestId("own-system");
  await expect(card).toHaveAttribute("data-key", "my-silk");
  await expect(card.getByTestId("own-system-label")).toHaveText("Silk");
  await expect(card.getByTestId("own-system-threads")).toHaveText("12 threads");
  await expect(page.getByTestId("own-system-count")).toHaveText("1 system · up to 10");

  await card.getByRole("button", { name: "Rename" }).click();
  await card.getByLabel("Thread system name").fill("Fine silk");
  await card.getByRole("button", { name: "Save name" }).click();
  await expect(card.getByTestId("own-system-label")).toHaveText("Fine silk");
  await expect(card).toHaveAttribute("data-key", "my-silk");

  const [download] = await Promise.all([page.waitForEvent("download"), card.getByRole("button", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toBe("my-silk.csv");
  const text = await readFile((await download.path())!, "utf8");
  expect(text).toContain("ZZ1,Ivory,#fffff0");
  expect(text).toContain("ZZ12,Teal,#2a8a8a");

  await card.getByRole("button", { name: "Delete…" }).click();
  await card.getByRole("button", { name: "Delete system" }).click();
  await expect(page.getByTestId("own-systems-empty")).toBeVisible();
});

test("a system uploaded in the editor generates the chart in its threads, sets up a palette, adds a colour and edits one", async ({
  page,
}) => {
  await registerReader(page, uniqueEmail("systems-editor"));
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);
  await page.getByRole("radio", { name: /Small/ }).check();

  await page.getByRole("button", { name: "Add a thread system of your own" }).click();
  const upload = page.getByTestId("own-system-upload");
  await upload.getByTestId("own-system-file").setInputFiles({ name: "silk.csv", mimeType: "text/csv", buffer: Buffer.from(SILK_CSV) });
  await upload.getByTestId("own-system-name").fill("Silk");
  await upload.getByRole("button", { name: "Keep it" }).click();
  await expect(upload).toHaveCount(0);
  await expect(ownChoice(page)).toHaveValue("my-silk");
  await expect(ownChoice(page).locator("option")).toHaveText(["Choose one of yours…", "Silk (12)"]);

  // Set up palette offers the system's threads.
  await page.getByRole("button", { name: "Set up palette" }).click();
  const setup = page.getByTestId("palette-setup");
  await expect(setup.getByRole("button", { name: /^Silk ZZ1\b/ })).toBeVisible();
  await page.getByRole("button", { name: "Automatic", exact: true }).click();

  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await showWorkspace(page, "Edit");
  const edits = page.getByRole("button", { name: /^Edit / });
  await expect(edits.first()).toBeVisible();
  for (const label of await edits.evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")))) {
    expect(label).toMatch(/^Edit ZZ\d+\b/);
  }

  // The colour editor opens on the system, picked from "Yours".
  await edits.first().click();
  const editor = page.getByRole("dialog", { name: /^Edit color / });
  await expect(ownChoice(editor)).toHaveValue("my-silk");
  await expect(editor.getByTestId("swatch-grid").getByRole("button", { name: /^Silk ZZ12\b/ })).toBeVisible();
  await editor.getByRole("button", { name: "Done" }).click();

  // + Add offers it too.
  const before = await edits.count();
  await page.getByRole("button", { name: "+ Add" }).click();
  const adding = page.getByTestId("add-color-panel");
  await ownChoice(adding).selectOption("my-silk");
  const unused = adding.getByTestId("swatch-grid").getByRole("button", { name: /^Silk ZZ/ });
  await expect(unused.first()).toBeVisible();
  const taken = new Set(
    (await edits.evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")))).map((l) => /ZZ\d+/.exec(l ?? "")?.[0])
  );
  const labels = await unused.evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label") ?? ""));
  const fresh = labels.findIndex((label) => !taken.has(/ZZ\d+/.exec(label)?.[0]));
  expect(fresh, "the picture leaves a thread of the twelve unused").toBeGreaterThanOrEqual(0);
  await unused.nth(fresh).click();
  await expect(edits).toHaveCount(before + 1);

  // Deleted, the system leaves the chart its numbers; its colours are then edited with the common picker (G-132 AC2).
  await waitForAutosave(page);
  const id = (await (await api(page).list()).json()).systems[0].id;
  expect((await api(page).remove(id)).status()).toBe(204);
  await page.reload();
  await showWorkspace(page, "Edit");
  await expect(edits.first()).toHaveAttribute("aria-label", /^Edit ZZ\d+\b/);
  await edits.first().click();
  await expect(ownChoice(editor)).toHaveCount(0);
  await expect(editor.locator(".react-colorful")).toBeVisible();
});
