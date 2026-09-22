import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * G-061: the Color detail switch, end to end through the real UI and the processor.
 *
 * The unit tests pin what Vivid does to a cell. What they cannot show is that the choice made in the pane reaches
 * the generated chart, changes it, is recorded in the exported file, and is remembered for the next Generate.
 */

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

/**
 * Photo fix has a Vivid of its own until it is redone (Owner, 2026-09-22), so every lookup here is scoped to the
 * Color detail section rather than to the label alone.
 */
function colorDetail(page: Page) {
  return page.locator("section").filter({ hasText: "Color detail" }).getByRole("button");
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

interface ExportedChart {
  width: number;
  height: number;
  cellPalette: number[];
  palette: Array<{ rgb: [number, number, number] }>;
  vivid?: boolean;
}

async function generateAndExport(page: Page): Promise<ExportedChart> {
  await page.getByRole("button", { name: /^(Generate pattern|Regenerate)$/ }).click();
  await expect(page.getByRole("main").locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  return JSON.parse(await readFile((await download.path())!, "utf8")) as ExportedChart;
}

test("Vivid reaches the chart, changes it, and is recorded in the file", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  // `sample.png` is 160x100, so a stitch covers 24 pixels or more only at about 32 stitches and under; the Small
  // preset's 50 would put Vivid below its floor and it would stand down (the case the second test covers).
  await page.getByLabel("Custom size in stitches").fill("30");

  const averaged = await generateAndExport(page);
  expect(averaged.vivid).toBeUndefined();

  await page.getByRole("tab", { name: "Photo" }).click();
  await colorDetail(page).filter({ hasText: "Vivid" }).click();
  const vivid = await generateAndExport(page);

  expect(vivid.vivid).toBe(true);
  expect(vivid.width).toBe(averaged.width);
  // The same photo and the same size, so a different chart is Vivid's doing.
  expect(vivid.cellPalette).not.toEqual(averaged.cellPalette);
  expect(errors).toEqual([]);
});

test("the choice is remembered, and stands down on a photo with too few pixels a stitch", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();

  await expect(colorDetail(page).filter({ hasText: "Averaged" })).toHaveAttribute("aria-pressed", "true");
  await colorDetail(page).filter({ hasText: "Vivid" }).click();

  // The pane's settings need a photo to configure, so the reloaded page gets one again; what is being checked is
  // that the choice came back from storage, not that the photo did.
  await page.reload();
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await expect(colorDetail(page).filter({ hasText: "Vivid" })).toHaveAttribute("aria-pressed", "true");

  // At 50 stitches this 160x100 photo gives a stitch about 10 pixels, below Vivid's floor: the chart records
  // nothing, because what a chart records is what happened to it (D211).
  await page.getByRole("radio", { name: /Small/ }).check();
  expect((await generateAndExport(page)).vivid).toBeUndefined();
});
