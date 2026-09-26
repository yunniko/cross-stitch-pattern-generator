import { test, expect, type Page } from "@playwright/test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * G-074 M3: the sliders reach generation, and the chart says what it was made with.
 *
 * `scripts/rust-photo-adjust-pipeline.ts` proves the pipeline applies exactly the adjustment the browser
 * previews. What it cannot show is that the values the reader set actually leave the page, survive the request
 * and the processor's validation, and come back on the chart — which is what this does, through the real UI.
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
  photoAdjust?: { brightness: number; contrast: number; saturation: number; temperature: number };
  enhancementMode?: string;
}

async function exportEditable(page: Page): Promise<ExportedChart> {
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  return JSON.parse(await readFile((await download.path())!, "utf8")) as ExportedChart;
}

async function generateAndExport(page: Page): Promise<ExportedChart> {
  await page.getByRole("button", { name: /^(Generate pattern|Regenerate)$/ }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 60_000 });
  return exportEditable(page);
}

async function setSlider(page: Page, name: string, value: number) {
  await page.getByRole("tab", { name: "Photo" }).click();
  await page.getByRole("slider", { name }).fill(String(value));
  await page.getByRole("slider", { name }).dispatchEvent("change");
}

/** How far the chart's threads are from grey: the one thing "saturation all the way down" must change. */
function meanChroma(chart: ExportedChart): number {
  const spread = chart.palette.map(({ rgb }) => Math.max(...rgb) - Math.min(...rgb));
  return spread.reduce((a, b) => a + b, 0) / spread.length;
}

test("a chart generated with the sliders is made from the adjusted photo, and records them", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();

  const plain = await generateAndExport(page);
  expect(plain.photoAdjust).toBeUndefined();
  expect(meanChroma(plain)).toBeGreaterThan(20);

  await setSlider(page, "Saturation", -100);
  const grey = await generateAndExport(page);
  // Taking every bit of colour out of the photo has to leave a chart of greys: nothing else explains this.
  expect(meanChroma(grey)).toBeLessThan(3);
  expect(grey.photoAdjust).toEqual({ brightness: 0, contrast: 0, saturation: -100, temperature: 0 });

  // Back to neutral, and the chart is the one the app made before the sliders existed (criterion 4).
  await setSlider(page, "Saturation", 0);
  const again = await generateAndExport(page);
  expect(again.photoAdjust).toBeUndefined();
  expect(again.cellPalette).toEqual(plain.cellPalette);
  expect(again.palette.map((c) => c.rgb)).toEqual(plain.palette.map((c) => c.rgb));

  expect(errors).toEqual([]);
});

test("a chart saved with the sliders reopens with them, and a file from before them still opens", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();

  await setSlider(page, "Warm / cool", 70);
  await setSlider(page, "Contrast", 35);
  const chart = await generateAndExport(page);
  expect(chart.photoAdjust).toEqual({ brightness: 0, contrast: 35, saturation: 0, temperature: 70 });

  // A file written by a build that had never heard of the sliders, carrying the enhancement mode instead
  // (criterion 5). Named, so that the chart on screen afterwards is provably the one that was opened.
  const older = { ...chart, photoAdjust: undefined, enhancementMode: "brighten", name: "older-chart" };
  const file = path.join(tmpdir(), `older-chart-${process.pid}.json`);
  await writeFile(file, JSON.stringify(older), "utf8");
  await page.getByLabel("Open pattern file").setInputFiles(file);
  await page.getByRole("tab", { name: "Chart" }).click();
  await expect(page.getByLabel("Pattern name")).toHaveValue("older-chart");
  await expect(page.getByTestId("chart-canvas")).toBeVisible();

  // Saving it again keeps what it said and invents nothing: no sliders, the mode it was made with.
  // Export lives in the footer of the Threads tab, which is where Generate leaves the inspector.
  await page.getByRole("tab", { name: "Threads" }).click();
  const reopened = await exportEditable(page);
  expect(reopened.photoAdjust).toBeUndefined();
  expect(reopened.enhancementMode).toBe("brighten");
  await rm(file, { force: true });
  expect(errors).toEqual([]);
});
