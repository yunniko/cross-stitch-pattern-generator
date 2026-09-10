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

async function cornerPixel(canvas: import("@playwright/test").Locator) {
  return canvas.evaluate((el: HTMLCanvasElement) => el.getContext("2d")!.getImageData(2, 2, 1, 1).data.join(","));
}

test("the Move tool repositions the whole design as a single undoable step (G-012)", async ({ page }) => {
  await generateSmallPattern(page);

  const canvas = page.getByRole("main").locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not visible");

  const before = await cornerPixel(canvas);

  await page.getByRole("button", { name: "Move" }).click();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();

  expect(await cornerPixel(canvas)).not.toBe(before);

  // One undo fully reverts the move (a single history step, like any edit).
  const undoButton = page.getByRole("button", { name: "Undo" });
  await expect(undoButton).toBeEnabled();
  await undoButton.click();
  expect(await cornerPixel(canvas)).toBe(before);
});

test("the Move tool does nothing (no undo step) when the drag doesn't cross a stitch cell", async ({ page }) => {
  await generateSmallPattern(page);

  const canvas = page.getByRole("main").locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not visible");

  await page.getByRole("button", { name: "Move" }).click();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2, { steps: 1 });
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("the Highlight tool dims non-selected colors as a pure view overlay -- no undo step, no pattern change (G-012)", async ({ page }) => {
  await generateSmallPattern(page);

  await page.getByRole("button", { name: "Highlight" }).click();
  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const stsTextBefore = await legendRows.nth(0).textContent();

  const canvas = page.getByRole("main").locator("canvas");
  const readCanvas = () =>
    canvas.evaluate((el: HTMLCanvasElement) => Array.from(el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data));

  const plain = await readCanvas();
  await legendRows.nth(0).click(); // select this color for highlighting
  const highlighted = await readCanvas();
  expect(highlighted).not.toEqual(plain); // the dimming overlay changed pixels somewhere

  await legendRows.nth(0).click(); // deselect
  const restored = await readCanvas();
  expect(restored).toEqual(plain); // and removing it restores the exact original pixels

  // Purely visual: no undo step was created, and the color's own stitch count is untouched.
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  expect(await legendRows.nth(0).textContent()).toBe(stsTextBefore);
});
