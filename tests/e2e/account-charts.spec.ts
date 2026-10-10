import { test, expect, type Page } from "@playwright/test";
import { previewHref } from "../../lib/charts/saved-chart-link";
import { openSmallChart, saveButton, saveMenuItem, waitForAutosave } from "./helpers/app";
import { registerReader, uniqueEmail } from "./helpers/auth";
import { panel } from "./helpers/panel";

/**
 * G-108 part 1 M4: the account's Charts. The charts saved to the account are listed with the space they use against the
 * limit; each is renamed or deleted in place, and opens in the editor as one more way a chart arrives, after the
 * confirmation when a chart is open, with Save going back to that chart. Each shows the server's preview of it (M6).
 * M8 (D358) draws them as the design does: cards searched and put in order, pinned ones first, the count beside Charts.
 */

const rows = (page: Page) => page.getByTestId("saved-chart");
const row = (page: Page, name: string) => rows(page).filter({ has: page.getByTestId("saved-chart-name").getByText(name, { exact: true }) });
const message = (page: Page) => page.getByTestId("account-save-message");
const chartsTab = (page: Page) => panel.accountNav(page).getByRole("link", { name: /^Charts/ });
const names = (page: Page) => rows(page).getByTestId("saved-chart-name").allTextContents();

async function savedCharts(page: Page): Promise<{ id: string; name: string; version: number }[]> {
  return (await (await page.request.get("/api/charts")).json()).charts;
}

async function saveToAccount(page: Page, item: "Save" | "Save as copy" = "Save") {
  await saveButton(page).click();
  await saveMenuItem(page, item).click();
}

test("the account lists its saved charts with the space used; one is renamed, one deleted, one opened and saved again", async ({
  page,
}) => {
  // Signing in lands on the account's Charts (D405); its first address still leads there.
  await registerReader(page, uniqueEmail("charts"));
  await expect(page.getByTestId("saved-charts-empty")).toBeVisible();
  await page.goto("/account/charts");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId("chart-space")).toHaveText("0 charts · 0 MB of 50 MB");
  await expect(chartsTab(page)).toHaveText("Charts0");

  // Two charts: the sample, and a copy of it.
  await openSmallChart(page);
  await saveToAccount(page);
  await expect(message(page)).toHaveText("Saved to your account.");
  await saveToAccount(page, "Save as copy");
  await expect(message(page)).toContainText("you are now editing the copy");
  const [copy, first] = await savedCharts(page);
  // The editor is left for the account: the chart, and the saved chart it is, must be stored first.
  await waitForAutosave(page);

  await page.goto("/account");
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId("chart-space")).toContainText(/^2 charts · [\d.]+ MB of 50 MB$/);
  await expect(chartsTab(page)).toHaveText("Charts2");
  await expect(rows(page).first()).toContainText(/50 × 31 · \d+ colours · /);
  await expect(rows(page).first().getByTestId("saved-chart-when")).toHaveText("Just now");
  // The preview: ten pixels a stitch at this size, loaded.
  const picture = rows(page).first().getByTestId("saved-chart-preview");
  await expect(picture).toHaveAttribute("src", previewHref(copy.id, copy.version));
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => [img.complete, img.naturalWidth, img.naturalHeight]))
    .toEqual([true, 500, 310]);

  // Pinned: the older chart goes first, without being saved again; unpinned, it goes back.
  await rows(page).nth(1).getByRole("button", { name: "Pin" }).click();
  await expect(rows(page).first()).toHaveAttribute("data-chart-id", first.id);
  await expect(rows(page).first().getByRole("button", { name: "Pin" })).toHaveAttribute("aria-pressed", "true");
  expect((await savedCharts(page)).find((c) => c.id === first.id)).toMatchObject({ version: first.version });
  await page.reload();
  await expect(rows(page).first()).toHaveAttribute("data-chart-id", first.id);
  await rows(page).first().getByRole("button", { name: "Pin" }).click();
  await expect(rows(page).first()).toHaveAttribute("data-chart-id", copy.id);

  // Renamed in place: Escape gives up, Save name keeps it.
  const newest = rows(page).first();
  await newest.getByRole("button", { name: "Rename" }).click();
  await newest.getByLabel("Chart name").fill("Never kept");
  await newest.getByLabel("Chart name").press("Escape");
  await expect(newest.getByTestId("saved-chart-name")).toHaveText("sample");
  await newest.getByRole("button", { name: "Rename" }).click();
  await newest.getByLabel("Chart name").fill("Spare roses");
  await newest.getByRole("button", { name: "Save name" }).click();
  await expect(row(page, "Spare roses")).toHaveCount(1);
  expect((await savedCharts(page)).find((c) => c.id === copy.id)).toMatchObject({ name: "Spare roses" });

  // Searched by name, and put in order by name: "sample" before "Spare roses", whatever the case.
  await page.getByRole("button", { name: "Name", exact: true }).click();
  expect(await names(page)).toEqual(["sample", "Spare roses"]);
  await page.getByLabel("Search charts").fill("ROSES");
  expect(await names(page)).toEqual(["Spare roses"]);
  await page.getByLabel("Search charts").fill("tulip");
  await expect(page.getByTestId("saved-charts-none-found")).toBeVisible();
  await page.getByLabel("Search charts").fill("");
  await expect(rows(page)).toHaveCount(2);

  // Deleted after asking; Keep it changes nothing.
  await row(page, "Spare roses").getByRole("button", { name: "Delete…" }).click();
  await row(page, "Spare roses").getByRole("button", { name: "Keep it" }).click();
  await expect(rows(page)).toHaveCount(2);
  await row(page, "Spare roses").getByRole("button", { name: "Delete…" }).click();
  await row(page, "Spare roses").getByRole("button", { name: "Delete chart" }).click();
  await expect(rows(page)).toHaveCount(1);
  expect((await savedCharts(page)).map((c) => c.id)).toEqual([first.id]);
  await expect(chartsTab(page)).toHaveText("Charts1");

  // Opened: the copy is still open in the editor (deleted since), so the editor asks first.
  await rows(page).first().getByTestId("saved-chart-name").click();
  const confirm = page.getByRole("dialog", { name: "Start a new chart?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Start new chart" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("chart-name")).toHaveText("sample");
  // The address is given back, so a reload does not ask again.
  await expect(page).toHaveURL(/\/$/);

  // Save goes back to the chart opened: the same id, one version on.
  await saveToAccount(page);
  await expect(message(page)).toHaveText("Saved to your account.");
  expect(await savedCharts(page)).toEqual([expect.objectContaining({ id: first.id, version: first.version + 1 })]);
  // The list asks for the new version's preview.
  await waitForAutosave(page);
  await page.goto("/account");
  await expect(rows(page).first().getByTestId("saved-chart-preview")).toHaveAttribute("src", previewHref(first.id, first.version + 1));

  // The same chart asked for again while it is open: nothing to replace, nothing asked.
  await page.goto(`/?chart=${first.id}`);
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(confirm).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  // New chart: the editor's start screen, which costs nothing; the open chart is still there to go back to.
  await page.goto("/account");
  await page.getByRole("link", { name: "New chart" }).click();
  await expect(page.getByRole("button", { name: /^Choose a photo/ })).toBeEnabled({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: /^Back to / }).click();
  await expect(page.getByTestId("chart-name")).toHaveText("sample");
});

test("a chart that is gone, or someone else's, is not opened, and the open chart stays", async ({ page, browser }) => {
  // Someone else's chart.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await registerReader(otherPage, uniqueEmail("owner"));
  await openSmallChart(otherPage);
  await saveToAccount(otherPage);
  await expect(message(otherPage)).toHaveText("Saved to your account.");
  const [theirs] = await savedCharts(otherPage);
  await other.close();

  await registerReader(page, uniqueEmail("visitor"));
  await openSmallChart(page);
  await waitForAutosave(page);
  // Read before anything is asked: refused, so no confirmation, and nothing replaced.
  await page.goto(`/?chart=${theirs.id}`);
  await expect(page.getByText("That chart is no longer among your saved charts.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Start a new chart?" })).toHaveCount(0);
  await expect(page.getByTestId("chart-name")).toHaveText("sample");
});
