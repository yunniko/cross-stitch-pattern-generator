import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

// G-028: OXS charts in both directions. Opening one from another program summarises what couldn't
// be carried over (M2); exporting one and opening it again brings the pattern back (M3). Fixtures are self-authored.
const OXS_FIXTURE = path.join(__dirname, "fixtures", "sample.oxs");
const PHOTO_FIXTURE = path.join(__dirname, "fixtures", "sample.png");

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test("opens an OXS chart, summarises what wasn't imported, and takes the file's fabric count", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Open pattern file").setInputFiles(OXS_FIXTURE);

  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  const notice = page.getByTestId("open-notice");
  await expect(notice).toContainText("Opened the OXS chart.");
  await expect(notice).toContainText("1 part stitch is shown as full stitches.");
  // From G-073 the line is imported rather than counted as a loss, so the notice must no longer mention it.
  await expect(notice).not.toContainText("backstitch");
  await expect(notice).toContainText("Not imported: 1 knot.");
  await expect(notice).toContainText("Fabric count set to 18-count, as the file states.");
  await page.getByRole("tab", { name: "Chart" }).click();
  await expect(page.getByLabel("Pattern name")).toHaveValue("Little heart");
  expect(errors).toEqual([]);
});

test("exports a generated pattern as OXS, and that file opens again with nothing lost", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(PHOTO_FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("Export").selectOption("oxs");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("sample.oxs");
  const downloadedPath = (await download.path())!;
  const text = await readFile(downloadedPath, "utf8");
  expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(text).toMatch(/<palette_item index="0" number="cloth"/);
  const width = Number(/chartwidth="(\d+)"/.exec(text)?.[1]);
  const height = Number(/chartheight="(\d+)"/.exec(text)?.[1]);
  expect(Math.max(width, height)).toBe(50);
  expect((text.match(/<stitch /g) ?? []).length).toBeGreaterThan(0);

  await page.getByLabel("Open pattern file").setInputFiles(downloadedPath);
  await expect(page.getByTestId("open-notice")).toHaveText("Opened the OXS chart; everything in it came across.");
  await expect(page.getByTestId("chart-canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
