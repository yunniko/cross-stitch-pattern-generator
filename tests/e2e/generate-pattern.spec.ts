import { test, expect } from "@playwright/test";
import { MAX_STITCHES } from "../../lib/types";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { expectPhotoLoaded, showWorkspace, chooseExport } from "./helpers/app";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function pngWidth(filePath: string): Promise<number> {
  const buf = await readFile(filePath);
  return buf.readUInt32BE(16);
}

test("upload an image, generate a pattern, preview it, and download both variants", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);

  await page.getByRole("radio", { name: /Small/ }).check();

  await page.getByRole("button", { name: "Generate pattern" }).click();

  const canvas = page.getByTestId("chart-frame");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/50 × \d+, [\d,]+ stitches, \d+ colors/)).toBeVisible();

  await showWorkspace(page, "Export");

  const exportButton = page.getByRole("button", { name: "Export", exact: true });

  await chooseExport(page, "png-color");
  const [colorDownload] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  expect(colorDownload.suggestedFilename()).toBe("sample_color.png");

  await page.getByRole("button", { name: "B&W", exact: true }).click();
  await expect(canvas).toBeVisible();

  await chooseExport(page, "png-bw");
  const [bwDownload] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  expect(bwDownload.suggestedFilename()).toBe("sample_bw.png");
});

test("the image input is disabled while a pattern is generating, so a mid-generation image swap can't happen (code-review 2026-09-09, finding 1)", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Large/ }).check();

  const imageInput = page.getByLabel("Image");
  await expect(imageInput).toBeEnabled();

  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(imageInput).toBeDisabled();

  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await expect(imageInput).toBeEnabled();
});

test("a small chart's header is never clipped, even at the minimum custom size (code-review 2026-09-09, finding 5)", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: "Custom" }).check();
  await page.getByRole("spinbutton").fill("10");

  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });

  await showWorkspace(page, "Export");

  await chooseExport(page, "png-color");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const savedPath = test.info().outputPath("small-chart.png");
  await download.saveAs(savedPath);

  // The original bug: a 10x6 chart's canvas was only ~292px wide, clipping
  // the finished-size header text partway through. The fix widens the
  // canvas to fit the header when it would otherwise be narrower than the
  // chart+legend -- comfortably above that old clipped width confirms it.
  expect(await pngWidth(savedPath)).toBeGreaterThan(320);
});

test("a custom size outside the supported range is brought into it when the field is left, so generation never sees it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: "Custom" }).check();
  await page.getByRole("spinbutton").fill("5000");

  // The field keeps what is typed while it is being typed (bringing each keystroke into range made "50" into 100, QA
  // 2026-10-04) and is limited when it is left, which pressing Generate also does. The guard in `use-generation.ts` stays.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("spinbutton")).toHaveValue(String(MAX_STITCHES));
  expect(errors).toEqual([]);
});

test("a fractional custom size is rounded when the field is left, and never reaches generation as a fraction (code-review 2026-09-09, finding 8)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: "Custom" }).check();
  await page.getByRole("spinbutton").fill("10.5");

  // The old bug: 10.5 reached buildPattern and crashed with "RangeError: Invalid array length". Pressing Generate leaves the
  // field, which rounds it, so the chart is made at a whole size; the size check in `use-generation.ts` remains behind it.
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await showWorkspace(page, "Edit");
  await expect(page.getByText(/^11 × \d+, /)).toBeVisible();
  expect(errors).toEqual([]);
});
