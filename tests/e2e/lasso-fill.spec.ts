import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { generateSmallPattern } from "./helpers/app";

/**
 * G-072 M3: Lasso fill draws an outline and paints what it encloses when the pointer comes up.
 *
 * The chart is read by exporting it, as `two-colours.spec.ts` does: comparing whole cell arrays says exactly how
 * many stitches a gesture changed, without depending on the order the Threads list happens to be in.
 */

async function exportCells(page: Page): Promise<number[]> {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const chart = JSON.parse(await readFile((await download.path())!, "utf8"));
  await page.getByRole("tab", { name: "Chart" }).click();
  return chart.cellPalette;
}

const changed = (a: number[], b: number[]) => a.reduce((n, v, i) => (v === b[i] ? n : n + 1), 0);

async function pickFirstThread(page: Page) {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.locator('[data-testid="legend-color-row"]').first().click();
  await page.getByRole("tab", { name: "Chart" }).click();
}

/** A diamond whose bounding box is 9 x 9; its corners are outside the shape. */
const DIAMOND: Array<[number, number]> = [
  [10, 4],
  [14, 8],
  [10, 12],
  [6, 8],
];

/** Presses at the first cell and drags through the rest, leaving the pointer down. */
async function dragLasso(page: Page, cells: Array<[number, number]>) {
  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  const cell = box.width / 50; // the Small preset is 50 stitches wide
  const at = (cx: number, cy: number) => [box.x + cell * (cx + 0.5), box.y + cell * (cy + 0.5)] as const;
  const [sx, sy] = at(cells[0][0], cells[0][1]);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (const [cx, cy] of cells.slice(1)) {
    const [x, y] = at(cx, cy);
    await page.mouse.move(x, y, { steps: 6 });
  }
}

test("a lasso fill paints the area it encloses, as one undo step", async ({ page }) => {
  await generateSmallPattern(page);
  await pickFirstThread(page);
  const before = await exportCells(page);

  await page.getByRole("button", { name: "Lasso fill", exact: true }).click();
  await dragLasso(page, DIAMOND);
  await page.mouse.up();

  const after = await exportCells(page);
  // The inside is filled, not just the boundary: the centre must end up the same colour as a cell on the path.
  // A count alone would pass for an outline-only fill, which is the mistake this guards against.
  const cell = (x: number, y: number) => y * 50 + x;
  expect(after[cell(10, 8)]).toBe(after[cell(10, 4)]);
  // And the shape is respected: (6,4) is a corner of the bounding box that the diamond does not cover.
  expect(after[cell(6, 4)]).toBe(before[cell(6, 4)]);
  expect(changed(before, after)).toBeGreaterThan(10);

  await page.keyboard.press("Control+z");
  expect(await exportCells(page)).toEqual(before);
});

test("nothing is painted until the pointer comes up, and Escape paints nothing at all", async ({ page }) => {
  await generateSmallPattern(page);
  await pickFirstThread(page);
  const before = await exportCells(page);

  await page.getByRole("button", { name: "Lasso fill", exact: true }).click();
  await dragLasso(page, DIAMOND);
  // Mid-drag the outline is up, but the chart must still be untouched — Escape then drops the whole gesture.
  await page.keyboard.press("Escape");
  await page.mouse.up();

  expect(await exportCells(page)).toEqual(before);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("symmetry mirrors every filled cell, as it does a brush stroke", async ({ page }) => {
  await generateSmallPattern(page);
  await pickFirstThread(page);

  await page.getByRole("button", { name: "Lasso fill", exact: true }).click();
  await dragLasso(page, DIAMOND);
  await page.mouse.up();
  const withoutSymmetry = await exportCells(page);
  await page.keyboard.press("Control+z");
  const before = await exportCells(page);

  await page.getByRole("button", { name: "Vertical symmetry" }).click();
  await page.getByRole("button", { name: "Lasso fill", exact: true }).click();
  await dragLasso(page, DIAMOND);
  await page.mouse.up();
  const withSymmetry = await exportCells(page);

  // The same gesture mirrored has to touch strictly more cells than it did on its own.
  expect(changed(before, withSymmetry)).toBeGreaterThan(changed(before, withoutSymmetry));
});
