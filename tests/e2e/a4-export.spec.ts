import { test, expect } from "@playwright/test";
import path from "node:path";
import JSZip from "jszip";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function readZipEntryNames(downloadPath: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(await import("node:fs/promises").then((fs) => fs.readFile(downloadPath)));
  return Object.keys(zip.files).sort();
}

test("export as A4 pages downloads a ZIP with grid page(s) plus a legend page", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });

  await expect(page.getByText(/total \(incl\. legend\)/)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export ZIP" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("sample_A4_color.zip");

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const entries = await readZipEntryNames(downloadPath!);
  expect(entries).toContain("sample_legend.png");
  expect(entries.some((name) => /^sample_r\d{2}_c\d{2}\.png$/.test(name))).toBe(true);
});

test("export as A4 pages works in B&W mode", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "B&W", exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export ZIP" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("sample_A4_bw.zip");

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const entries = await readZipEntryNames(downloadPath!);
  expect(entries).toContain("sample_legend.png");
});
