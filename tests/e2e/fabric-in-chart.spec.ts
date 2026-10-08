import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { generateSmallPattern, openSmallChart, saveToFile, showWorkspace } from "./helpers/app";

/**
 * G-094 (D290): fabric count and unit belong to the chart. They are saved in its file and come back with it, in a browser
 * that has other values of its own; changing them is an undo step; a chart saved before this keeps taking the browser's.
 */

const status = (page: Page) => page.getByTitle("Finished size on the chosen fabric count");
/** One of the fabric counts, which are buttons since G-095: in the Chart tab, and where an empty grid is made. */
const count = (page: Page, value: string) =>
  page.getByRole("group", { name: "Fabric count" }).getByRole("button", { name: `${value}-count`, exact: true });

async function saveEditable(page: Page): Promise<{ path: string; chart: Record<string, unknown> }> {
  await page.getByRole("tab", { name: "Threads" }).click();
  const download = await saveToFile(page);
  const path = (await download.path())!;
  return { path, chart: JSON.parse(await readFile(path, "utf8")) };
}

async function chooseFabric(page: Page, value: string, unit?: "in" | "cm") {
  await page.getByRole("tab", { name: "Chart" }).click();
  await count(page, value).click();
  if (unit) await page.getByRole("button", { name: unit, exact: true }).click();
}

test("a new chart carries the fabric it was made on, and a change of count or unit is saved in its file", async ({ page }) => {
  await generateSmallPattern(page);
  await expect(status(page)).toContainText("14-ct");
  expect((await saveEditable(page)).chart.fabric).toEqual({ count: 14, unit: "cm" });

  await chooseFabric(page, "18", "in");
  await expect(status(page)).toContainText("18-ct");
  await expect(status(page)).toContainText(" in");
  expect((await saveEditable(page)).chart.fabric).toEqual({ count: 18, unit: "in" });
});

test("the fabric comes back with the file in a browser whose own count is another", async ({ page, browser }) => {
  await openSmallChart(page);
  await chooseFabric(page, "18", "in");
  const { path } = await saveEditable(page);

  // A new browser: nothing stored, so its own fabric is the default, 14-count in centimetres.
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto("/");
  await other.getByLabel("Open pattern file").setInputFiles(path);
  await expect(status(other)).toContainText("18-ct");
  await expect(status(other)).toContainText(" in");
  await other.getByRole("tab", { name: "Chart" }).click();
  await expect(count(other, "18")).toHaveAttribute("aria-pressed", "true");
  // Opening a file does not change what this browser gives its own next chart.
  const stored = await other.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain('\\"aidaCount\\":18');
  await context.close();
});

test("changing the fabric is one undo step, and undo puts the count back", async ({ page }) => {
  await openSmallChart(page);
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeDisabled();
  await chooseFabric(page, "11");
  await expect(status(page)).toContainText("11-ct");
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(status(page)).toContainText("14-ct");
  await expect(count(page, "14")).toHaveAttribute("aria-pressed", "true");
  await expect(undo).toBeDisabled();
});

test("a file saved before fabric was kept takes the browser's, and is saved again without one", async ({ page }) => {
  await openSmallChart(page);
  const { chart } = await saveEditable(page);
  delete chart.fabric;
  const old = JSON.stringify(chart);
  await page
    .getByLabel("Open pattern file")
    .setInputFiles({ name: "old_editable.json", mimeType: "application/json", buffer: Buffer.from(old) });
  await expect(page.getByText("Start a new chart?")).toHaveCount(0);
  await expect(status(page)).toContainText("14-ct");
  const again = await saveEditable(page);
  expect(again.chart.fabric).toBeUndefined();
  expect(await readFile(again.path, "utf8")).toBe(old);
});

test("the count chosen for an empty grid is the new chart's, not the open chart's and not a new preference", async ({ page }) => {
  await openSmallChart(page);
  await chooseFabric(page, "18");
  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  // The start screen offers the count set in Preferences (14 in a browser that has set nothing), not the 18 of the chart
  // behind it, and takes another for the chart to come.
  await expect(count(page, "14")).toHaveAttribute("aria-pressed", "true");
  await count(page, "11").click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "Start new chart" }).click();
  await expect(status(page)).toContainText("11-ct");
  expect((await saveEditable(page)).chart.fabric).toMatchObject({ count: 11 });
  // Neither the 18 nor the 11 became what the next chart starts from (G-095, D299).
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).toContain('\\"aidaCount\\":14');
});

test("the editable file is the same file saved alone, inside Export all, and after a reload", async ({ page }) => {
  await openSmallChart(page);
  await chooseFabric(page, "16");
  const alone = await readFile((await saveEditable(page)).path, "utf8");

  // Until G-094 the server's writer of this file dropped what no export reads; it now writes what the editor writes.
  await showWorkspace(page, "Export");
  const [bundle] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export all" }).click()]);
  const zip = await JSZip.loadAsync(await readFile((await bundle.path())!));
  expect(await zip.files["sample_editable.json"].async("string")).toBe(alone);

  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await expect(status(page)).toContainText("16-ct");
  expect(await readFile((await saveEditable(page)).path, "utf8")).toBe(alone);
});
