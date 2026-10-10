import { test, expect } from "@playwright/test";
import { deleteOwnAccount, registerReader, signInAsAdmin, uniqueEmail } from "./helpers/auth";
import { generateSmallPattern, showWorkspace, chooseExport } from "./helpers/app";
import { featuresDb } from "./helpers/features";

/**
 * G-075 M4: the admin stats page's counts are read after generating and exporting a known number of times,
 * exactly as the milestone asks ("generating and exporting a known number of times in a real dev run and
 * reading the same numbers back on the page") -- not just that a `UsageEvent` row gets written somewhere.
 * PNG export is used rather than the editable JSON export, which never leaves the browser (HANDOVER.md) and
 * so never reaches `app/api/exports/route.ts`, the route that records it.
 */

async function readCount(page: import("@playwright/test").Page, testId: string): Promise<number> {
  // The cell shows "1 203"; the number itself is its data-count (G-107 M3).
  return Number(await page.getByTestId(testId).getAttribute("data-count"));
}

// @alone: these read site-wide counters, so any other spec generating at the same moment moves them. `npm run test:e2e`
// runs them after the rest, one at a time (G-090 M4); before that they failed in every parallel run and passed alone.
test("generating once and exporting twice moves the stats page's counts by exactly that much", { tag: "@alone" }, async ({ page }) => {
  test.setTimeout(120_000);

  await signInAsAdmin(page);
  await page.goto("/admin/overview");
  const before = {
    generateToday: await readCount(page, "admin-stats-GENERATE-today"),
    generateAllTime: await readCount(page, "admin-stats-GENERATE-allTime"),
    exportToday: await readCount(page, "admin-stats-EXPORT-today"),
    exportAllTime: await readCount(page, "admin-stats-EXPORT-allTime"),
  };

  // One generation, as the signed-in admin (still on the page from signInAsAdmin's cookie).
  await generateSmallPattern(page);

  // Two server-side exports (png-color survives a repeat generate; the editable-JSON export would not count).
  await showWorkspace(page, "Export");
  const exportButton = page.getByRole("button", { name: "Export", exact: true });
  for (let i = 0; i < 2; i++) {
    await chooseExport(page, "png-color");
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), exportButton.click()]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
  }

  await page.goto("/admin/overview");
  const after = {
    generateToday: await readCount(page, "admin-stats-GENERATE-today"),
    generateAllTime: await readCount(page, "admin-stats-GENERATE-allTime"),
    exportToday: await readCount(page, "admin-stats-EXPORT-today"),
    exportAllTime: await readCount(page, "admin-stats-EXPORT-allTime"),
  };

  expect(after.generateToday - before.generateToday).toBe(1);
  expect(after.generateAllTime - before.generateAllTime).toBe(1);
  expect(after.exportToday - before.exportToday).toBe(2);
  expect(after.exportAllTime - before.exportAllTime).toBe(2);
});

test("an anonymous generation and export are still counted, with no userId", { tag: "@alone" }, async ({ page, context }) => {
  test.setTimeout(120_000);

  await signInAsAdmin(page);
  await page.goto("/admin/overview");
  const before = {
    generateToday: await readCount(page, "admin-stats-GENERATE-today"),
    exportToday: await readCount(page, "admin-stats-EXPORT-today"),
  };

  await context.clearCookies();
  await generateSmallPattern(page);
  await showWorkspace(page, "Export");
  const exportButton = page.getByRole("button", { name: "Export", exact: true });
  await chooseExport(page, "png-color");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), exportButton.click()]);
  expect(download.suggestedFilename()).toMatch(/\.png$/);

  await signInAsAdmin(page);
  await page.goto("/admin/overview");
  const after = {
    generateToday: await readCount(page, "admin-stats-GENERATE-today"),
    exportToday: await readCount(page, "admin-stats-EXPORT-today"),
  };

  expect(after.generateToday - before.generateToday).toBe(1);
  expect(after.exportToday - before.exportToday).toBe(1);
});

test(
  "Active accounts counts only accounts that exist; a deleted account's usage stays, untied from it",
  { tag: "@alone" },
  async ({ page, browser }) => {
    // G-133 M4, D406. One use is written straight for a new reader, and one for an id that has no account.
    const db = featuresDb();
    const active = async () => {
      await page.goto("/admin/overview?range=all");
      return Number((await page.getByTestId("overview-active-accounts").locator("span").nth(1).textContent())!.replace(/\D/g, ""));
    };
    await signInAsAdmin(page);
    const before = await active();

    const reader = await (await browser.newContext()).newPage();
    const email = uniqueEmail("active");
    await registerReader(reader, email);
    const { rows } = await db.query<{ id: string }>(`SELECT "id" FROM "User" WHERE "email" = $1`, [email]);
    const stamp = `e2e_${Date.now().toString(36)}`;
    await db.query(
      `INSERT INTO "UsageEvent" ("id", "kind", "userId", "createdAt") VALUES ($1, 'GENERATE', $2, now()), ($3, 'GENERATE', $4, now())`,
      [`${stamp}_reader`, rows[0].id, `${stamp}_gone`, `${stamp}_no_such_account`]
    );
    try {
      expect(await active()).toBe(before + 1);

      await deleteOwnAccount(reader, email);
      expect(await active()).toBe(before);
      const kept = await db.query<{ userId: string | null }>(`SELECT "userId" FROM "UsageEvent" WHERE "id" = $1`, [`${stamp}_reader`]);
      expect(kept.rows).toEqual([{ userId: null }]);
    } finally {
      await db.query(`DELETE FROM "UsageEvent" WHERE "id" LIKE $1`, [`${stamp}_%`]);
    }
  }
);
