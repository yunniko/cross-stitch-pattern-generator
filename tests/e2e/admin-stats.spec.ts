import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "./helpers/auth";
import { generateSmallPattern, showWorkspace, exportChoice } from "./helpers/app";

/**
 * G-075 M4: the admin stats page's counts are read after generating and exporting a known number of times,
 * exactly as the milestone asks ("generating and exporting a known number of times in a real dev run and
 * reading the same numbers back on the page") -- not just that a `UsageEvent` row gets written somewhere.
 * PNG export is used rather than the editable JSON export, which never leaves the browser (HANDOVER.md) and
 * so never reaches `app/api/exports/route.ts`, the route that records it.
 */

async function readCount(page: import("@playwright/test").Page, testId: string): Promise<number> {
  return Number(await page.getByTestId(testId).textContent());
}

// @alone: these read site-wide counters, so any other spec generating at the same moment moves them. `npm run test:e2e`
// runs them after the rest, one at a time (G-090 M4); before that they failed in every parallel run and passed alone.
test("generating once and exporting twice moves the stats page's counts by exactly that much", { tag: "@alone" }, async ({ page }) => {
  test.setTimeout(120_000);

  await signInAsAdmin(page);
  await page.goto("/admin/stats");
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
  const exportSelect = exportChoice(page);
  const exportButton = page.getByRole("button", { name: "Export", exact: true });
  for (let i = 0; i < 2; i++) {
    await exportSelect.selectOption("png-color");
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), exportButton.click()]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
  }

  await page.goto("/admin/stats");
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
  await page.goto("/admin/stats");
  const before = {
    generateToday: await readCount(page, "admin-stats-GENERATE-today"),
    exportToday: await readCount(page, "admin-stats-EXPORT-today"),
  };

  await context.clearCookies();
  await generateSmallPattern(page);
  await showWorkspace(page, "Export");
  const exportSelect = exportChoice(page);
  const exportButton = page.getByRole("button", { name: "Export", exact: true });
  await exportSelect.selectOption("png-color");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), exportButton.click()]);
  expect(download.suggestedFilename()).toMatch(/\.png$/);

  await signInAsAdmin(page);
  await page.goto("/admin/stats");
  const after = {
    generateToday: await readCount(page, "admin-stats-GENERATE-today"),
    exportToday: await readCount(page, "admin-stats-EXPORT-today"),
  };

  expect(after.generateToday - before.generateToday).toBe(1);
  expect(after.exportToday - before.exportToday).toBe(1);
});
