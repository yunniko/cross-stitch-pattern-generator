import path from "node:path";
import { readFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { test, expect } from "@playwright/test";

/**
 * G-050 M4: a photo with a transparent background generates a chart whose background is empty stitches, and every
 * later step — the editor, the exports, the realistic preview and a save reopened — carries those empties through.
 */

const FIXTURE = path.join(__dirname, "fixtures", "transparent-subject.png");

test("a transparent background generates as empty stitches, and the exports keep them", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: transparent-subject.png")).toBeVisible();

  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 30_000 });

  // The subject is a disc covering about 55% of the frame, so well under the full stitch count is stitched.
  const status = page.getByText(/50 × \d+, [\d,]+ stitches, \d+ colors/);
  await expect(status).toBeVisible();
  const stitches = Number((await status.textContent())!.match(/, ([\d,]+) stitches/)![1].replace(/,/g, ""));
  expect(stitches, "the transparent corners are not stitched").toBeLessThan(50 * 50 * 0.8);
  expect(stitches, "but the subject is").toBeGreaterThan(50 * 50 * 0.3);

  // The legend shows the empty-stitch row, which is how the editor reports cells with no thread.
  await expect(page.getByText(/Empty \(no stitch\)/)).toBeVisible();

  // The realistic preview writes transparent pixels where the chart has no stitch.
  const exportSelect = page.getByLabel("Export");
  await exportSelect.selectOption("png-realistic");
  const [preview] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const image = await loadImage(await readFile(await preview.path()));
  const ctx = createCanvas(image.width, image.height).getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  const alphaAt = (x: number, y: number) => data[(y * image.width + x) * 4 + 3];
  expect(alphaAt(2, 2), "the corner of the preview is transparent").toBe(0);
  expect(alphaAt(Math.floor(image.width / 2), Math.floor(image.height / 2)), "the middle is stitched").toBeGreaterThan(0);

  // The editable save round-trips the empties: reopening shows the same stitch count.
  await exportSelect.selectOption("editable");
  const [save] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const savePath = await save.path();
  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByRole("button", { name: /^Open a saved pattern/ }).click();
  const confirm = page.getByRole("dialog", { name: "Start a new chart?" });
  if (await confirm.isVisible()) await confirm.getByRole("button", { name: "Start new chart" }).click();
  await page.getByLabel("Open pattern file").setInputFiles(savePath);
  await expect(page.getByText(new RegExp(`50 × \\d+, ${stitches.toLocaleString("en-US")} stitches`))).toBeVisible();
});
