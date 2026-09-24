import { test, expect, type Page } from "@playwright/test";
import { generateSmallPattern } from "./helpers/app";

/**
 * G-072 M2: Lasso Select takes a freehand shape, and everything downstream treats it as any other piece.
 *
 * The shape itself is asserted through Crop, which makes the chart the piece's bounding box — the only way the
 * geometry is visible from outside — and through the status bar, which names the selection's size and origin.
 */

/** The Image window header: "W × H, N stitches, K colors". */
const header = (page: Page) => page.getByText(/^\d+ × \d+, [\d,]+ stitch(es)?, \d+ colors$/);

/** Drags a closed freehand path through the given cells, with the Lasso tool active. */
async function drawLasso(page: Page, cells: Array<[number, number]>) {
  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  const cell = box.width / 50; // the Small preset is 50 stitches wide
  const at = (cx: number, cy: number) => [box.x + cell * (cx + 0.5), box.y + cell * (cy + 0.5)] as const;

  await page.getByRole("button", { name: "Lasso", exact: true }).click();
  const [sx, sy] = at(cells[0][0], cells[0][1]);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (const [cx, cy] of cells.slice(1)) {
    const [x, y] = at(cx, cy);
    await page.mouse.move(x, y, { steps: 6 });
  }
  await page.mouse.up();
  return { box, cell };
}

/** A diamond: its bounding box is 9 x 9 but its corners are outside the shape. */
const DIAMOND: Array<[number, number]> = [
  [10, 4],
  [14, 8],
  [10, 12],
  [6, 8],
];

test("a lasso selects a shape, and the piece behaves like any other", async ({ page }) => {
  await generateSmallPattern(page);
  await drawLasso(page, DIAMOND);

  await expect(page.getByRole("button", { name: "Apply here" })).toBeEnabled();
  // The bounding box of the diamond above, which is what the status bar reports.
  await expect(page.getByText(/^9 × 9 at 6, 4$/)).toBeVisible();
});

test("cropping to a lasso gives its bounding box, as one undo step", async ({ page }) => {
  await generateSmallPattern(page);
  await expect(header(page)).toHaveText(/^50 × \d+, /);

  await drawLasso(page, DIAMOND);
  await page.getByRole("button", { name: "Crop" }).click();
  await expect(header(page)).toHaveText(/^9 × 9, /);

  await page.keyboard.press("Control+z");
  await expect(header(page)).toHaveText(/^50 × \d+, /);
});

test("Escape drops a lasso selection, as it drops a shape", async ({ page }) => {
  await generateSmallPattern(page);
  await drawLasso(page, DIAMOND);
  await expect(page.getByRole("button", { name: "Apply here" })).toBeEnabled();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Apply here" })).toBeDisabled();
});

test("the corners of the box are not in the piece: pressing one starts a new selection", async ({ page }) => {
  await generateSmallPattern(page);
  const { box, cell } = await drawLasso(page, DIAMOND);
  await expect(page.getByText(/^9 × 9 at 6, 4$/)).toBeVisible();

  // (6,4) is the top-left of the bounding box and well outside the diamond. Pressing there must begin a fresh
  // lasso rather than pick the piece up — the difference between a mask and a rectangle, from the user's side.
  const at = (cx: number, cy: number) => [box.x + cell * (cx + 0.5), box.y + cell * (cy + 0.5)] as const;
  const [cx, cy] = at(6, 4);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const [ex, ey] = at(8, 6);
  await page.mouse.move(ex, ey, { steps: 6 });
  await page.mouse.up();

  await expect(page.getByText(/^9 × 9 at 6, 4$/)).toBeHidden();
});

test("a rectangle selection is still a rectangle", async ({ page }) => {
  await generateSmallPattern(page);
  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  const cell = box.width / 50;

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.mouse.move(box.x + cell * 2.5, box.y + cell * 2.5);
  await page.mouse.down();
  await page.mouse.move(box.x + cell * 7.5, box.y + cell * 5.5, { steps: 4 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Crop" }).click();
  await expect(header(page)).toHaveText(/^6 × 4, /);
});
