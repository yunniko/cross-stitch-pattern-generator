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

/**
 * The bare photo. One press shows the grid over it, a second the photo alone, a third returns to the chart
 * (context-bar.tsx), so this presses until it arrives rather than assuming where it started.
 */
async function showPhotoOnly(page: Page) {
  const button = page.getByRole("button", { name: "Show the photo behind the chart" });
  const frame = page.getByTestId("chart-frame");
  for (let press = 0; press < 3; press++) {
    if ((await frame.getAttribute("data-view-mode")) === "photo-only") break;
    await button.click();
  }
  await expect(frame).toHaveAttribute("data-view-mode", "photo-only");
}

/** Waits for the frame to be showing the photo *as the chart was made from it*, then reads it. */
async function adjustedPhotoChroma(page: Page): Promise<number> {
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-photo", "adjusted", { timeout: 30_000 });
  return photoViewChroma(page);
}

/** The same, for a chart made with the sliders centred: the photo shown is the file as uploaded. */
async function uploadedPhotoChroma(page: Page): Promise<number> {
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-photo", "uploaded", { timeout: 30_000 });
  return photoViewChroma(page);
}

/** How far the photo the view is drawing is from grey. Reads the chart canvas, which is where it lands. */
async function photoViewChroma(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="chart-canvas"]');
    if (!canvas) return -1;
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    let worst = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      worst = Math.max(worst, Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]));
    }
    return worst;
  });
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

test("the photo views show the photo the chart was made from, and reopening restores the sliders", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();

  await setSlider(page, "Saturation", -100);
  const chart = await generateAndExport(page);
  expect(chart.photoAdjust).toEqual({ brightness: 0, contrast: 0, saturation: -100, temperature: 0 });

  // "Original photo" draws the photo the chart came from. With every bit of colour taken out of it, it is grey.
  await showPhotoOnly(page);
  // Waited for, not polled for: a poll would be satisfied by the frame still holding the grey chart
  // from a moment ago, and would pass just as happily with the adjustment never applied.
  expect(await adjustedPhotoChroma(page)).toBeLessThan(6);

  // And with the sliders centred it is the photo as uploaded, which this one is not: it is vividly coloured.
  await page.getByRole("tab", { name: "Photo" }).click();
  await setSlider(page, "Saturation", 0);
  await generateAndExport(page);
  await showPhotoOnly(page);
  expect(await uploadedPhotoChroma(page)).toBeGreaterThan(30);

  expect(errors).toEqual([]);
});

test("a chart saved with the sliders opens with them set, so Regenerate reproduces it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();

  await setSlider(page, "Brightness", -45);
  await setSlider(page, "Saturation", 70);
  const saved = await generateAndExport(page);
  const file = path.join(tmpdir(), `sliders-${process.pid}.json`);
  await writeFile(file, JSON.stringify({ ...saved, name: "slider-chart" }), "utf8");

  // A fresh page, with the sliders left somewhere else entirely.
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await setSlider(page, "Brightness", 100);

  await page.getByLabel("Open pattern file").setInputFiles(file);
  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(page.getByRole("slider", { name: "Brightness" })).toHaveValue("-45");
  await expect(page.getByRole("slider", { name: "Saturation" })).toHaveValue("70");

  // The point of restoring them: pressing Regenerate gives back the chart that was opened, not another one.
  const again = await generateAndExport(page);
  expect(again.photoAdjust).toEqual(saved.photoAdjust);
  expect(again.cellPalette).toEqual(saved.cellPalette);
  await rm(file, { force: true });
});

test("with a photo view up, the Photo tab's sliders move the photo without regenerating", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  await generateAndExport(page);

  await showPhotoOnly(page);
  await page.getByRole("tab", { name: "Photo" }).click();
  expect(await uploadedPhotoChroma(page)).toBeGreaterThan(30);

  // No Generate: the sliders alone must move what the photo view is showing.
  await page.getByRole("slider", { name: "Saturation" }).fill("-100");
  expect(await adjustedPhotoChroma(page)).toBeLessThan(6);
  expect(errors).toEqual([]);
});

test("the photo keeps up with a slider being dragged, not just with one value", async ({ page }) => {
  // A drag is dozens of values, a `fill` is one, and the difference hid a real bug: the worker kept the
  // callback from the effect's first run, whose cleanup the *second* value fired, so every frame after the
  // first was dropped. One keystroke moved the picture; a drag never did (Owner, 2026-09-27).
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  await generateAndExport(page);

  await showPhotoOnly(page);
  await page.getByRole("tab", { name: "Photo" }).click();
  const before = await uploadedPhotoChroma(page);
  expect(before).toBeGreaterThan(30);

  const seen = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Saturation"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const chroma = () => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="chart-canvas"]')!;
      const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
      let worst = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue;
        worst = Math.max(worst, Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]));
      }
      return worst;
    };
    const readings: number[] = [];
    // Twenty values, as a drag delivers them, with the change event only at the end.
    for (let step = 1; step <= 20; step++) {
      setter.call(input, String(-5 * step));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
      readings.push(chroma());
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1200));
    return { readings, settled: chroma() };
  });

  // It kept up on the way down, rather than only arriving at the end -- or never.
  expect(seen.readings[9]).toBeLessThan(before);
  expect(seen.readings[19]).toBeLessThan(seen.readings[9]);
  expect(seen.settled).toBeLessThan(6);
});

test("sliders moved but never generated are given up on the way out", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  await setSlider(page, "Brightness", -40);
  await generateAndExport(page);

  await showPhotoOnly(page);
  await page.getByRole("tab", { name: "Photo" }).click();
  await page.getByRole("slider", { name: "Saturation" }).fill("-100");
  await expect(page.getByRole("slider", { name: "Saturation" })).toHaveValue("-100");

  // Another tab: the chart on screen was not made with that slider, so it goes back to what made it.
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(page.getByRole("slider", { name: "Saturation" })).toHaveValue("0");
  await expect(page.getByRole("slider", { name: "Brightness" })).toHaveValue("-40");

  // And the same on leaving the photo view, rather than the tab.
  await page.getByRole("slider", { name: "Saturation" }).fill("-100");
  await page.getByRole("button", { name: "Show the photo behind the chart" }).click();
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-view-mode", "color");
  await expect(page.getByRole("slider", { name: "Saturation" })).toHaveValue("0");
});

test("a slider that was generated with is kept, not given up", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  // The photo view belongs to a chart, so there has to be one before it can be shown.
  await generateAndExport(page);

  await showPhotoOnly(page);
  await page.getByRole("tab", { name: "Photo" }).click();
  await page.getByRole("slider", { name: "Saturation" }).fill("-100");
  const chart = await generateAndExport(page);
  expect(chart.photoAdjust).toEqual({ brightness: 0, contrast: 0, saturation: -100, temperature: 0 });

  // Generate committed it, so leaving must leave it alone.
  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(page.getByRole("slider", { name: "Saturation" })).toHaveValue("-100");
});
