import { test, expect, type Page } from "@playwright/test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expectPhotoLoaded, saveToFile, showWorkspace, generateAndWait, showPhotoTab } from "./helpers/app";
import { applySliders, changingPhoto, photoControls, photoSlider, setSlider, stageDigest } from "./helpers/photo";
import { expectView, showOverPhoto } from "./helpers/view";

/**
 * G-074 M3, changed in G-124: the sliders reach generation through Apply. They are a preview over the photo until Apply
 * writes them into it (Owner, 2026-10-07); a Generate reads the photo as applied, and never the sliders.
 *
 * `scripts/rust-photo-adjust-pipeline.ts` proves the processor applies the adjustment the browser previews; that is what a
 * chart saved before G-124 with its sliders still regenerates with. This is the real UI end to end.
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
  sourceImage?: { dataUrl: string };
}

async function exportEditable(page: Page): Promise<ExportedChart> {
  const download = await saveToFile(page);
  return JSON.parse(await readFile((await download.path())!, "utf8")) as ExportedChart;
}

async function generateAndExport(page: Page): Promise<ExportedChart> {
  await generateAndWait(page, 60_000);
  return exportEditable(page);
}

/** How far the chart's threads are from grey: the one thing "saturation all the way down" must change. */
function meanChroma(chart: ExportedChart): number {
  const spread = chart.palette.map(({ rgb }) => Math.max(...rgb) - Math.min(...rgb));
  return spread.reduce((a, b) => a + b, 0) / spread.length;
}

/** How far the photo the chart's photo view draws is from grey. Reads the chart canvas, which is where it lands. */
async function photoViewChroma(page: Page): Promise<number> {
  await showOverPhoto(page, 0);
  await expectView(page, { photo: true, visibility: 0 });
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-photo", "uploaded", { timeout: 30_000 });
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

async function loadSmall(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);
  await page.getByRole("radio", { name: /Small/ }).check();
  await expect(page.getByTestId("color-count-hint")).toBeVisible({ timeout: 15_000 });
}

test("a Generate reads the photo as applied: moved sliders count only once applied, and Undo takes them back", async ({ page }) => {
  const errors = collectErrors(page);
  await loadSmall(page);
  const plain = await generateAndExport(page);
  expect(plain.photoAdjust).toBeUndefined();
  expect(meanChroma(plain)).toBeGreaterThan(20);

  // Moved and not applied: the note says so, and a Regenerate makes the same chart.
  await setSlider(page, "Saturation", -100);
  await expect(photoControls(page).notApplied).toBeVisible();
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Regenerate", exact: true })).toBeEnabled({ timeout: 60_000 });
  await photoControls(page).cancel.click();
  await expect(photoControls(page).notApplied).toHaveCount(0);
  const unapplied = await exportEditable(page);
  expect(unapplied.cellPalette).toEqual(plain.cellPalette);

  // Applied: the photo is grey now, and so is the chart made from it. The adjustment is in the photo, not on the chart.
  await setSlider(page, "Saturation", -100);
  await applySliders(page);
  const grey = await generateAndExport(page);
  expect(meanChroma(grey)).toBeLessThan(3);
  expect(grey.photoAdjust).toBeUndefined();
  expect(grey.sourceImage?.dataUrl).not.toBe(plain.sourceImage?.dataUrl);

  // Undone: the photo as loaded again, and the chart the app made before.
  await showPhotoTab(page, "Picture");
  await changingPhoto(page, () => photoControls(page).undo.click());
  const again = await generateAndExport(page);
  expect(again.sourceImage?.dataUrl).toBe(plain.sourceImage?.dataUrl);
  expect(again.cellPalette).toEqual(plain.cellPalette);
  expect(again.palette.map((c) => c.rgb)).toEqual(plain.palette.map((c) => c.rgb));

  expect(errors).toEqual([]);
});

test("the photo views show the photo the chart was made from: applied, or restored", async ({ page }) => {
  const errors = collectErrors(page);
  await loadSmall(page);
  await setSlider(page, "Saturation", -100);
  await applySliders(page);
  await generateAndExport(page);
  // The photo alone draws the photo the chart came from. With every bit of colour taken out of it, it is grey.
  expect(await photoViewChroma(page)).toBeLessThan(6);

  // Restore original is a step of its own, and the chart made after it is in colour again.
  await showPhotoTab(page, "Picture");
  await changingPhoto(page, () => photoControls(page).restore.click());
  await expect(photoControls(page).restore).toBeDisabled();
  await generateAndExport(page);
  expect(await photoViewChroma(page)).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test("a file from before the sliders still opens, and one saved with them regenerates with them (D352)", async ({ page }) => {
  const errors = collectErrors(page);
  await loadSmall(page);
  const chart = await generateAndExport(page);

  // A file written by a build that had never heard of the sliders, carrying the enhancement mode instead. Named, so that
  // the chart on screen afterwards is provably the one that was opened.
  const older = { ...chart, photoAdjust: undefined, enhancementMode: "brighten", name: "older-chart" };
  const olderFile = path.join(tmpdir(), `older-chart-${process.pid}.json`);
  await writeFile(olderFile, JSON.stringify(older), "utf8");
  await page.getByLabel("Open pattern file").setInputFiles(olderFile);
  await page.getByRole("tab", { name: "Chart" }).click();
  await expect(page.getByLabel("Pattern name")).toHaveValue("older-chart");
  await page.getByRole("tab", { name: "Threads" }).click();
  const reopened = await exportEditable(page);
  expect(reopened.photoAdjust).toBeUndefined();
  expect(reopened.enhancementMode).toBe("brighten");
  await rm(olderFile, { force: true });

  // A file saved with the sliders of before G-124: it opens with the sliders in the middle, and Regenerate keeps the
  // adjustment it was made with, so the chart comes back grey and saying so.
  const adjust = { brightness: 0, contrast: 0, saturation: -100, temperature: 0 };
  const sliderFile = path.join(tmpdir(), `slider-chart-${process.pid}.json`);
  await writeFile(sliderFile, JSON.stringify({ ...chart, photoAdjust: adjust, name: "slider-chart" }), "utf8");
  await page.getByLabel("Open pattern file").setInputFiles(sliderFile);
  await expect(page.getByRole("tab", { name: "Edit", exact: true })).toHaveAttribute("aria-selected", "true");
  await showPhotoTab(page, "Picture");
  await expect(photoSlider(page, "Saturation")).toHaveValue("0");
  const regenerated = await generateAndExport(page);
  expect(regenerated.photoAdjust).toEqual(adjust);
  expect(meanChroma(regenerated)).toBeLessThan(3);
  await rm(sliderFile, { force: true });
  expect(errors).toEqual([]);
});

test("over a chart, a moved slider brings the photo up with the preview, and Cancel puts the chart back", async ({ page }) => {
  const errors = collectErrors(page);
  await loadSmall(page);
  await generateAndExport(page);
  await showPhotoTab(page, "Picture");
  await expect(page.getByTestId("photo-stage")).toHaveCount(0);

  await setSlider(page, "Saturation", -100);
  await expect(page.getByTestId("adjusted-photo")).toBeVisible();
  await expect(page.getByTestId("chart-frame")).toBeHidden();
  await expect.poll(async () => (await stageDigest(page)).chroma).toBeLessThan(6);

  await photoControls(page).cancel.click();
  await expect(page.getByTestId("photo-stage")).toHaveCount(0);
  await expect(page.getByTestId("chart-canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the preview keeps up with a slider being dragged, not just with one value", async ({ page }) => {
  // A drag is dozens of values, a `fill` is one, and the difference hid a real bug: the worker kept the
  // callback from the effect's first run, whose cleanup the *second* value fired, so every frame after the
  // first was dropped. One keystroke moved the picture; a drag never did (Owner, 2026-09-27).
  await loadSmall(page);
  await showPhotoTab(page, "Picture");

  const seen = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Saturation"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const chroma = () => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="adjusted-photo"]');
      if (!canvas) return -1;
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
  expect(seen.readings[9]).toBeGreaterThan(0);
  expect(seen.readings[19]).toBeLessThan(seen.readings[9]);
  expect(seen.settled).toBeLessThan(6);
});

test("sliders moved and not applied are given up by Cancel, by another tab and by another workspace", async ({ page }) => {
  await loadSmall(page);
  await generateAndExport(page);

  await setSlider(page, "Saturation", -100);
  await photoControls(page).cancel.click();
  await expect(photoSlider(page, "Saturation")).toHaveValue("0");

  await setSlider(page, "Saturation", -100);
  await showPhotoTab(page, "Chart settings");
  await showPhotoTab(page, "Picture");
  await expect(photoSlider(page, "Saturation")).toHaveValue("0");

  await setSlider(page, "Brightness", -40);
  await showWorkspace(page, "Edit");
  await showPhotoTab(page, "Picture");
  await expect(photoSlider(page, "Brightness")).toHaveValue("0");
  // None of them was applied: the photo is still the one loaded.
  await expect(photoControls(page).restore).toBeDisabled();
  await expect(photoControls(page).undo).toBeDisabled();
});

test("Apply writes the sliders into the photo and puts them back in the middle; Undo and Redo step through it", async ({ page }) => {
  const errors = collectErrors(page);
  await loadSmall(page);
  await showPhotoTab(page, "Picture");
  const before = await stageDigest(page);
  expect(before.chroma).toBeGreaterThan(30);
  await expect(photoControls(page).apply).toBeDisabled();

  await setSlider(page, "Saturation", -100);
  await applySliders(page);
  await expect(page.getByTestId("adjusted-photo")).toHaveCount(0);
  await expect.poll(async () => (await stageDigest(page)).chroma).toBeLessThan(6);
  await expect(photoControls(page).restore).toBeEnabled();

  await changingPhoto(page, () => photoControls(page).undo.click());
  await expect.poll(async () => (await stageDigest(page)).chroma).toBeGreaterThan(30);
  await changingPhoto(page, () => photoControls(page).redo.click());
  await expect.poll(async () => (await stageDigest(page)).chroma).toBeLessThan(6);
  expect(errors).toEqual([]);
});
