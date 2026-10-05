import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { openSmallChart, showWorkspace, chooseExport } from "./helpers/app";

async function readZipEntryNames(downloadPath: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(await import("node:fs/promises").then((fs) => fs.readFile(downloadPath)));
  return Object.keys(zip.files).sort();
}

test("export as A4 pages downloads a ZIP with grid page(s) plus a legend page", async ({ page }) => {
  await openSmallChart(page);

  await showWorkspace(page, "Export");

  await chooseExport(page, "a4-color");
  await expect(page.getByText(/total \(incl\. page map, skein table \+ colour key\)/)).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("sample_A4_color.zip");

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const entries = await readZipEntryNames(downloadPath!);
  expect(entries).toContain("sample_legend.png");
  expect(entries).toContain("sample_00_page_map.png"); // the map of the pages (G-083)
  expect(entries.some((name) => /^sample_r\d{2}_c\d{2}\.png$/.test(name))).toBe(true);
});

test("export as A4 pages works in B&W mode", async ({ page }) => {
  await openSmallChart(page);

  await showWorkspace(page, "Export");

  await chooseExport(page, "a4-bw");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("sample_A4_bw.zip");

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const entries = await readZipEntryNames(downloadPath!);
  expect(entries).toContain("sample_legend.png");
});

test("the A4/PDF overlap setting lives in the Export workspace and persists across a reload", async ({ page }) => {
  // G-095: the overlap sits with the exports that read it; it was in the Chart tab, away from the choice of what to export.
  await openSmallChart(page);
  await showWorkspace(page, "Export");
  // It is offered with the two kinds that read it, as four buttons.
  await chooseExport(page, "a4-color");
  const overlap = (cells: string) => page.getByRole("group", { name: "A4/PDF overlap" }).getByRole("button", { name: cells, exact: true });
  await expect(overlap("5")).toHaveAttribute("aria-pressed", "true"); // default
  await overlap("10").click();

  // The chart must be on disk before the reload, or there is nothing to restore and Export cannot be entered.
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await showWorkspace(page, "Export");
  await chooseExport(page, "pdf-bw");
  await expect(overlap("10")).toHaveAttribute("aria-pressed", "true");
});
