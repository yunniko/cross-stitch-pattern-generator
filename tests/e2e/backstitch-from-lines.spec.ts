import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expectPhotoLoaded } from "./helpers/app";

/**
 * G-084: "Backstitch from lines", end to end through the real UI and the processor.
 *
 * The Rust tests pin what the tracing does to a picture. What they cannot show is that the checkbox reaches the
 * generated chart, that the lines come back as backstitch the editor holds, that a photograph is left alone, and that
 * the choice is remembered.
 */

const DRAWING = path.join(__dirname, "fixtures", "line-drawing.png");
const LIGHT_DRAWING = path.join(__dirname, "fixtures", "line-drawing-light.png");
const PHOTO = path.join(__dirname, "fixtures", "sample.png");

interface ExportedChart {
  palette: Array<{ rgb: [number, number, number]; name: string }>;
  cellPalette: number[];
  backstitch?: Array<{ x1: number; y1: number; x2: number; y2: number; paletteIndex: number }>;
}

const checkbox = (page: Page) => page.getByRole("checkbox", { name: "Backstitch from lines" });

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

test("a drawing's lines come back as backstitch in a thread of their own, and off means none", async ({ page }) => {
  await openPicture(page, DRAWING, "60");

  const plain = await generateAndExport(page);
  expect(plain.backstitch ?? []).toEqual([]);

  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(checkbox(page)).not.toBeChecked();
  await checkbox(page).check();
  const traced = await generateAndExport(page);

  const lines = traced.backstitch ?? [];
  expect(lines.length).toBeGreaterThan(30);
  const thread = lines[0].paletteIndex;
  expect(lines.every((l) => l.paletteIndex === thread)).toBe(true);
  const [r, g, b] = traced.palette[thread].rgb;
  expect(0.299 * r + 0.587 * g + 0.114 * b).toBeLessThan(80); // the drawing's lines are black
  // The line is backstitch, not stitches: no cross stitch is in its thread unless the palette already had it.
  expect(traced.cellPalette.filter((c) => c === thread).length).toBeLessThan(traced.cellPalette.length * 0.05);
});

test("light lines on a dark ground are traced too, in a light thread", async ({ page }) => {
  await openPicture(page, LIGHT_DRAWING, "60");
  await page.getByRole("tab", { name: "Photo" }).click();
  await checkbox(page).check();
  const traced = await generateAndExport(page);
  const lines = traced.backstitch ?? [];
  expect(lines.length).toBeGreaterThan(20);
  const [r, g, b] = traced.palette[lines[0].paletteIndex].rgb;
  expect(0.299 * r + 0.587 * g + 0.114 * b).toBeGreaterThan(180); // the chalk lines are near white
});

test("a photograph gets no lines, with the setting on", async ({ page }) => {
  await openPicture(page, PHOTO, "30");
  await page.getByRole("tab", { name: "Photo" }).click();
  await checkbox(page).check();
  const chart = await generateAndExport(page);
  expect(chart.backstitch ?? []).toEqual([]);
});

test("the choice and its sensitivity are remembered across a reload", async ({ page }) => {
  await openPicture(page, DRAWING, "60");
  await page.getByRole("tab", { name: "Photo" }).click();
  await checkbox(page).check();
  await page.getByLabel("Line sensitivity").fill("8");
  await page.getByRole("checkbox", { name: "Also in photographs" }).check();
  await page.reload();
  await page.getByLabel("Image").setInputFiles(DRAWING);
  await expectPhotoLoaded(page);
  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(checkbox(page)).toBeChecked();
  await expect(page.getByLabel("Line sensitivity")).toHaveValue("8");
  await expect(page.getByRole("checkbox", { name: "Also in photographs" })).toBeChecked();
});
