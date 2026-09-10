import { test, expect } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function generateSmallPattern(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });
}

test("painting a stitch empty doesn't add it to the legend or its stitch counts (G-012 M5)", async ({ page }) => {
  await generateSmallPattern(page);

  const legendRows = page.locator('[data-testid="legend-color-row"]'); // real colors only -- the fixed "Empty" row has no testid
  const initialCount = await legendRows.count();
  const emptyRow = page.getByText("Empty (no stitch)");
  await expect(emptyRow).toBeVisible();

  const canvas = page.getByRole("main").locator("canvas");
  await emptyRow.click();
  await canvas.click({ position: { x: 20, y: 20 } });

  // No new legend row was created, and the total legend count is unchanged
  // -- painting empty never adds/removes a real palette color.
  await expect(legendRows).toHaveCount(initialCount);
});

test("an empty-painted stitch renders as blank white on the live canvas, in color and B&W alike (G-012 M5)", async ({ page }) => {
  await generateSmallPattern(page);

  const emptyRow = page.getByText("Empty (no stitch)");
  const canvas = page.getByRole("main").locator("canvas");
  await emptyRow.click();

  // Cluster-fill empty at a specific point (not the canvas center default,
  // which could land in a different connected region than the pixel this
  // test later samples): drag the Empty swatch onto the same corner.
  await canvas.scrollIntoViewIfNeeded();
  await emptyRow.dragTo(canvas, { targetPosition: { x: 5, y: 5 } });

  const cellIsWhite = () =>
    canvas.evaluate((el: HTMLCanvasElement) => {
      const [r, g, b, a] = el.getContext("2d")!.getImageData(5, 5, 1, 1).data;
      return r === 255 && g === 255 && b === 255 && a === 255;
    });
  expect(await cellIsWhite()).toBe(true);

  await page.getByRole("radio", { name: "Black & white" }).check();
  expect(await cellIsWhite()).toBe(true);
});

test("Grid + photo mode leaves an empty-painted cell showing only the photo underneath, no symbol, no errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await generateSmallPattern(page);

  const photoRadio = page.getByRole("radio", { name: "Grid + photo" });
  await photoRadio.check();

  const emptyRow = page.getByText("Empty (no stitch)");
  const canvas = page.getByRole("main").locator("canvas");
  await emptyRow.click();
  await canvas.click({ position: { x: 20, y: 20 } });

  await expect(canvas).toBeVisible();
  expect(errors).toEqual([]);
});
