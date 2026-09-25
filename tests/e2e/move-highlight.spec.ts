import { test, expect } from "@playwright/test";
import { generateSmallPattern, pickTool } from "./helpers/app";

async function cornerPixel(canvas: import("@playwright/test").Locator) {
  return canvas.evaluate((el: HTMLCanvasElement) => {
    // The viewport canvas holds chart pixel (2, 2) at its own (2, 2) only while it is painted from the chart origin (D135).
    if (el.style.left !== "0px" || el.style.top !== "0px") throw new Error("the canvas is not painted from the chart origin");
    return el.getContext("2d")!.getImageData(2, 2, 1, 1).data.join(",");
  });
}

test("the Move tool repositions the whole design as a single undoable step (G-012)", async ({ page }) => {
  await generateSmallPattern(page);

  const canvas = page.getByTestId("chart-frame");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not visible");

  const before = await cornerPixel(page.getByTestId("chart-canvas"));

  await pickTool(page, "Move");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();

  expect(await cornerPixel(page.getByTestId("chart-canvas"))).not.toBe(before);

  // One undo fully reverts the move (a single history step, like any edit).
  const undoButton = page.getByRole("button", { name: "Undo" });
  await expect(undoButton).toBeEnabled();
  await undoButton.click();
  expect(await cornerPixel(page.getByTestId("chart-canvas"))).toBe(before);
});

test("the Move tool does nothing (no undo step) when the drag doesn't cross a stitch cell", async ({ page }) => {
  await generateSmallPattern(page);

  const canvas = page.getByTestId("chart-frame");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not visible");

  await pickTool(page, "Move");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2, { steps: 1 });
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("lighting a thread dims the others as a pure view overlay -- no undo step, no pattern change (G-012, D158)", async ({ page }) => {
  await generateSmallPattern(page);

  // G-045 M4: Highlight stopped being a tool. Isolate is a view mode, and each thread carries its own light.
  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const stsTextBefore = await legendRows.nth(0).textContent();
  const light = page.getByRole("button", { name: /^Show only / }).first();
  const isolate = page.getByRole("button", { name: "Isolate lit threads" });

  const readCanvas = () =>
    page
      .getByTestId("chart-canvas")
      .evaluate((el: HTMLCanvasElement) => Array.from(el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data));

  const plain = await readCanvas();
  await expect(isolate).toHaveAttribute("aria-pressed", "false");

  await light.click(); // lighting the first thread turns Isolate on by itself
  await expect(isolate).toHaveAttribute("aria-pressed", "true");
  const highlighted = await readCanvas();
  expect(highlighted).not.toEqual(plain); // the dimming overlay changed pixels somewhere

  await light.click(); // and putting the light out restores the exact original pixels
  await expect(isolate).toHaveAttribute("aria-pressed", "false");
  expect(await readCanvas()).toEqual(plain);

  // Purely visual: no undo step was created, and the color's own stitch count is untouched.
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  expect(await legendRows.nth(0).textContent()).toBe(stsTextBefore);
});
