import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function pngWidth(filePath: string): Promise<number> {
  const buf = await readFile(filePath);
  return buf.readUInt32BE(16);
}

test("upload an image, generate a pattern, preview it, and download both variants", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();

  await page.getByRole("radio", { name: /Small/ }).check();

  await page.getByRole("button", { name: "Generate pattern" }).click();

  const canvas = page.getByRole("main").locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/50 × \d+ stitches, \d+ colors/)).toBeVisible();

  const exportSelect = page.getByLabel("Export");
  const exportButton = page.getByRole("button", { name: "Export", exact: true });

  await exportSelect.selectOption({ label: "Color PNG (full chart)" });
  const [colorDownload] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  expect(colorDownload.suggestedFilename()).toBe("sample_color.png");

  await page.getByRole("radio", { name: "Black & white" }).check();
  await expect(canvas).toBeVisible();

  await exportSelect.selectOption({ label: "Black & white PNG (full chart)" });
  const [bwDownload] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  expect(bwDownload.suggestedFilename()).toBe("sample_bw.png");
});

test("the image input is disabled while a pattern is generating, so a mid-generation image swap can't happen (code-review 2026-09-09, finding 1)", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Large/ }).check();

  const imageInput = page.getByLabel("Image");
  await expect(imageInput).toBeEnabled();

  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(imageInput).toBeDisabled();

  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(imageInput).toBeEnabled();
});

test("a small chart's header is never clipped, even at the minimum custom size (code-review 2026-09-09, finding 5)", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: "Custom" }).check();
  await page.getByRole("spinbutton").fill("10");

  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("Export").selectOption({ label: "Color PNG (full chart)" });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const savedPath = test.info().outputPath("small-chart.png");
  await download.saveAs(savedPath);

  // The original bug: a 10x6 chart's canvas was only ~292px wide, clipping
  // the finished-size header text partway through. The fix widens the
  // canvas to fit the header when it would otherwise be narrower than the
  // chart+legend -- comfortably above that old clipped width confirms it.
  expect(await pngWidth(savedPath)).toBeGreaterThan(320);
});

test("rejects a custom size outside the 10-1000 range without crashing", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: "Custom" }).check();
  await page.getByRole("spinbutton").fill("5000");

  await page.getByRole("button", { name: "Generate pattern" }).click();

  await expect(page.getByText(/Pattern size must be a whole number/)).toBeVisible();
});

test("rejects a fractional custom size instead of crashing inside generation (code-review 2026-09-09, finding 8)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: "Custom" }).check();
  await page.getByRole("spinbutton").fill("10.5");

  await page.getByRole("button", { name: "Generate pattern" }).click();

  // The old bug: this reached buildPattern and crashed with
  // "RangeError: Invalid array length", surfaced as a misleading
  // "Couldn't generate a pattern from that image" (blaming the image, not
  // the size). It should instead be rejected up front with the same
  // size-validation message a plainly out-of-range value gets.
  await expect(page.getByText(/Pattern size must be a whole number/)).toBeVisible();
  await expect(page.getByRole("main").locator("canvas")).not.toBeVisible();
  expect(errors).toEqual([]);
});
