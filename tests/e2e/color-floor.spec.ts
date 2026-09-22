import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * G-060: the colour floor, end to end through the real UI and the processor.
 *
 * The unit tests pin what the floor does to a merge and to a chart built in-process. What they cannot show is that
 * the choice made in the pane reaches the generated chart, changes the palette it comes back with, and is recorded
 * in the file it exports.
 */

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

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
  colorFloor?: number;
}

async function generateAndExport(page: Page): Promise<ExportedChart> {
  await page.getByRole("button", { name: /^(Generate pattern|Regenerate)$/ }).click();
  await expect(page.getByRole("main").locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  return JSON.parse(await readFile((await download.path())!, "utf8")) as ExportedChart;
}

test("the colour floor reaches the chart, changes the palette it delivers, and is recorded in the file", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  // Asking for far more colours than a small chart can keep is exactly the case the floor exists for.
  await page.getByLabel("Number of colors").fill("48");

  const off = await generateAndExport(page);
  expect(off.colorFloor).toBeUndefined();

  await page.getByRole("tab", { name: "Photo" }).click();
  await page.getByLabel("Keep similar colors").selectOption("1");
  const floored = await generateAndExport(page);

  expect(floored.colorFloor).toBe(1);
  expect(floored.width).toBe(off.width);
  expect(floored.palette.length).toBeGreaterThan(off.palette.length);
  expect(errors).toEqual([]);
});

test("the floor is not offered for a dithered chart, which has nothing to merge", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();

  await expect(page.getByLabel("Keep similar colors")).toBeEnabled();
  await page.getByLabel("Dither").selectOption("floyd-steinberg");
  await expect(page.getByLabel("Keep similar colors")).toBeDisabled();
});
