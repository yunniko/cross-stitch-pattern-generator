import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expectPhotoLoaded } from "./helpers/app";

/**
 * G-085: "Texture strokes", end to end through the real UI and the processor.
 *
 * The Rust tests pin what the strokes do to a picture. What they cannot show is that the checkbox and density reach the
 * generated chart, that the strokes come back as backstitch the editor holds, that a smooth picture gets none, and that
 * the choice is remembered.
 */

const FUR = path.join(__dirname, "fixtures", "texture-fur.png");
const SMOOTH = path.join(__dirname, "fixtures", "sample.png");

interface ExportedChart {
  palette: Array<{ rgb: [number, number, number] }>;
  backstitch?: Array<{ x1: number; y1: number; x2: number; y2: number; paletteIndex: number }>;
}

const checkbox = (page: Page) => page.getByRole("checkbox", { name: "Texture strokes" });

async function generateAndExport(page: Page): Promise<ExportedChart> {
  await page.getByRole("button", { name: /^(Generate pattern|Regenerate)$/ }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  return JSON.parse(await readFile((await download.path())!, "utf8")) as ExportedChart;
}

async function openPicture(page: Page, file: string, stitches: string) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(file);
  await expectPhotoLoaded(page);
  await page.getByLabel("Custom size in stitches").fill(stitches);
}

test("a furry picture gets strokes as backstitch, more with a higher density, and off means none", async ({ page }) => {
  await openPicture(page, FUR, "60");
  const plain = await generateAndExport(page);
  expect(plain.backstitch ?? []).toEqual([]);

  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(checkbox(page)).not.toBeChecked();
  await checkbox(page).check();
  const accents = await generateAndExport(page);
  expect((accents.backstitch ?? []).length).toBeGreaterThan(8);

  await page.getByRole("tab", { name: "Photo" }).click();
  await page.getByLabel("Stroke density").fill("10");
  const coat = await generateAndExport(page);
  expect((coat.backstitch ?? []).length).toBeGreaterThan((accents.backstitch ?? []).length);
  // Every stroke is an ordinary backstitch between corners, at most three cells long, in a thread of the palette.
  for (const l of coat.backstitch ?? []) {
    expect(Math.abs(l.x2 - l.x1)).toBeLessThanOrEqual(3);
    expect(Math.abs(l.y2 - l.y1)).toBeLessThanOrEqual(3);
    expect(coat.palette[l.paletteIndex]).toBeDefined();
  }
});

test("a smooth picture gets no strokes, with the setting on", async ({ page }) => {
  await openPicture(page, SMOOTH, "30");
  await page.getByRole("tab", { name: "Photo" }).click();
  await checkbox(page).check();
  const chart = await generateAndExport(page);
  expect(chart.backstitch ?? []).toEqual([]);
});

test("the choice and its density are remembered across a reload", async ({ page }) => {
  await openPicture(page, FUR, "60");
  await page.getByRole("tab", { name: "Photo" }).click();
  await checkbox(page).check();
  await page.getByLabel("Stroke density").fill("7");
  await page.reload();
  await page.getByLabel("Image").setInputFiles(FUR);
  await expectPhotoLoaded(page);
  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(checkbox(page)).toBeChecked();
  await expect(page.getByLabel("Stroke density")).toHaveValue("7");
});
