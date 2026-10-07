import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { expectPhotoLoaded, generateAndWait, pickTool, saveButton, showPhotoTab } from "./helpers/app";
import { applySliders, changingPhoto, photoControls, setSlider } from "./helpers/photo";

/**
 * G-124: the Photo wand. It selects a colour of the photo in Photo, with New, Add and Subtract as Select has, a
 * sensitivity, and touching-only or everywhere; Delete takes the selection out with hard edges; Apply with a selection
 * changes only that part. Each change is a step of the photo's own history.
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

const selection = (page: Page) => page.getByTestId("photo-selection");

async function loadWithWand(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);
  await pickTool(page, "Photo wand");
  await expect(page.getByTestId("photo-wand-bar")).toBeVisible();
}

/** Presses the photo on the stage at a fraction of its width and height. */
async function pressPhoto(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("photo-stage").getByRole("img", { name: "Uploaded photo" }).boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

/** The photo on the stage, read at its own pixels: how many are cleared, and the pixel at a fraction of it. */
async function readPhoto(page: Page, fx: number, fy: number) {
  return page.evaluate(
    async ([fx, fy]) => {
      const img = document.querySelector<HTMLImageElement>('[data-testid="photo-stage"] img')!;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(img, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let cleared = 0;
      let chroma = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) cleared++;
        else chroma = Math.max(chroma, Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]));
      }
      const x = Math.min(canvas.width - 1, Math.floor(canvas.width * fx));
      const y = Math.min(canvas.height - 1, Math.floor(canvas.height * fy));
      const at = Array.from(context.getImageData(x, y, 1, 1).data);
      return { cleared, chroma, at };
    },
    [fx, fy] as const
  );
}

test("the wand selects a colour of the photo; Delete takes it out with hard edges, and Undo puts it back", async ({ page }) => {
  const errors = collectErrors(page);
  await loadWithWand(page);
  await expect(selection(page)).toHaveAttribute("data-selected", "no");
  expect((await readPhoto(page, 0.5, 0.5)).cleared).toBe(0);

  await pressPhoto(page, 0.5, 0.5);
  await expect(selection(page)).toHaveAttribute("data-selected", "yes");
  await page.keyboard.press("Escape");
  await expect(selection(page)).toHaveAttribute("data-selected", "no");

  await pressPhoto(page, 0.5, 0.5);
  await expect(selection(page)).toHaveAttribute("data-selected", "yes");
  await changingPhoto(page, () => page.keyboard.press("Delete"));
  await expect(selection(page)).toHaveAttribute("data-selected", "no");
  await expect.poll(async () => (await readPhoto(page, 0.5, 0.5)).cleared).toBeGreaterThan(0);
  // Hard edges: a pixel is taken out whole or left whole, never half.
  const deleted = await readPhoto(page, 0.5, 0.5);
  expect(deleted.at[3]).toBe(0);
  const partial = await page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>('[data-testid="photo-stage"] img')!;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(img, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let partial = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0 && data[i] !== 255) partial++;
    return partial;
  });
  expect(partial).toBe(0);

  // Ctrl+Z steps the photo's history while the photo is up.
  await changingPhoto(page, () => page.keyboard.press("Control+z"));
  await expect.poll(async () => (await readPhoto(page, 0.5, 0.5)).cleared).toBe(0);
  expect(errors).toEqual([]);
});

test("with a selection, Apply changes only the selected part", async ({ page }) => {
  const errors = collectErrors(page);
  await loadWithWand(page);
  await pressPhoto(page, 0.5, 0.5);
  await expect(selection(page)).toHaveAttribute("data-selected", "yes");

  await setSlider(page, "Saturation", -100);
  await expect(photoControls(page).apply).toHaveText("Apply to selection");
  await applySliders(page);
  // The selection lasts through Apply, so the next change can go to the same part.
  await expect(selection(page)).toHaveAttribute("data-selected", "yes");

  await expect
    .poll(async () => {
      const { at } = await readPhoto(page, 0.5, 0.5);
      return Math.max(at[0], at[1], at[2]) - Math.min(at[0], at[1], at[2]);
    })
    .toBeLessThanOrEqual(2);
  // Everything else keeps its colour.
  expect((await readPhoto(page, 0.5, 0.5)).chroma).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test("W picks the Photo wand in Photo, with its sensitivity in the bar of options", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);
  await showPhotoTab(page, "Picture");
  await page.getByTestId("photo-stage").click();
  await page.keyboard.press("w");
  await expect(page.getByTestId("photo-wand-bar")).toBeVisible();
  await expect(page.getByRole("slider", { name: "Wand sensitivity" })).toBeVisible();
});

test("a deleted part of the photo becomes empty stitches in the chart Generate makes", async ({ page }) => {
  const errors = collectErrors(page);
  await loadWithWand(page);
  await page.getByRole("radio", { name: /Small/ }).check();
  // The fixture is four colour fields; one of them, taken whole, is a quarter of the photo.
  const sensitivity = page.getByRole("slider", { name: "Wand sensitivity" });
  await sensitivity.fill("30");
  await sensitivity.dispatchEvent("change");
  await pressPhoto(page, 0.75, 0.75);
  await expect(selection(page)).toHaveAttribute("data-selected", "yes");
  await changingPhoto(page, () => page.keyboard.press("Delete"));

  await generateAndWait(page, 60_000);
  const [download] = await Promise.all([page.waitForEvent("download"), saveButton(page).click()]);
  const chart = JSON.parse(await readFile((await download.path())!, "utf8")) as { cellPalette: number[] };
  const empty = chart.cellPalette.filter((cell) => cell === 255).length / chart.cellPalette.length;
  expect(empty, "the deleted field is left unstitched").toBeGreaterThan(0.1);
  expect(empty, "the rest is still stitched").toBeLessThan(0.6);
  expect(errors).toEqual([]);
});
