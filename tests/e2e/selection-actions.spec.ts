import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

/**
 * G-042 M1: a floating selection can be rotated either way, cropped to, or cancelled. Rotation is only visible from
 * outside through a crop, which makes the chart the piece's rectangle, so the two are asserted together.
 */

async function generateSmallPattern(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 15_000 });
}

/** The Image window header: "W × H, N stitches, K colors". */
const header = (page: Page) => page.getByText(/^\d+ × \d+, [\d,]+ stitch(es)?, \d+ colors$/);

async function stitchCount(page: Page): Promise<number> {
  const text = await header(page).innerText();
  const match = text.match(/,\s*([\d,]+)\s*stitch/);
  if (!match) throw new Error(`no stitch count in header: ${text}`);
  return Number(match[1].replace(/,/g, ""));
}

/** Draws a rectangle from cell (x1, y1) to (x2, y2) inclusive, with the Select tool active. */
async function drawSelection(page: Page, x1: number, y1: number, x2: number, y2: number) {
  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  const cell = box.width / 50; // the Small preset is 50 stitches wide
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.mouse.move(box.x + cell * (x1 + 0.5), box.y + cell * (y1 + 0.5));
  await page.mouse.down();
  await page.mouse.move(box.x + cell * (x2 + 0.5), box.y + cell * (y2 + 0.5), { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Deselect" })).toBeEnabled();
  return { box, cell };
}

test("Crop reduces the chart to the selection's rectangle, as one undo step", async ({ page }) => {
  await generateSmallPattern(page);
  await expect(header(page)).toHaveText(/^50 × \d+, /);

  await drawSelection(page, 2, 2, 7, 5); // 6 × 4 stitches
  await page.getByRole("button", { name: "Crop" }).click();

  await expect(header(page)).toHaveText(/^6 × 4, /);
  await expect(page.getByRole("button", { name: "Deselect" })).toBeDisabled();

  await page.keyboard.press("Control+z");
  await expect(header(page)).toHaveText(/^50 × \d+, /);
});

test("Rotate right turns the piece a quarter turn: cropping to it swaps the chart's sides", async ({ page }) => {
  await generateSmallPattern(page);
  await drawSelection(page, 2, 2, 7, 5); // 6 wide, 4 tall

  await page.getByRole("button", { name: "Rotate right" }).click();
  await page.getByRole("button", { name: "Crop" }).click();

  await expect(header(page), "the piece stood on its side").toHaveText(/^4 × 6, /);
});

test("Rotate left is the other way round, and four turns return the piece", async ({ page }) => {
  await generateSmallPattern(page);
  await drawSelection(page, 2, 2, 7, 5);

  await page.getByRole("button", { name: "Rotate left" }).click();
  await page.getByRole("button", { name: "Rotate left" }).click();
  await page.getByRole("button", { name: "Rotate left" }).click();
  await page.getByRole("button", { name: "Rotate left" }).click();
  await page.getByRole("button", { name: "Crop" }).click();

  await expect(header(page), "back where it started").toHaveText(/^6 × 4, /);
});

test("Cancel after drawing and moving a selection leaves the chart exactly as it was", async ({ page }) => {
  await generateSmallPattern(page);
  const before = await stitchCount(page);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  const { box, cell } = await drawSelection(page, 2, 2, 7, 5);
  // Drag the piece well away from where it was lifted.
  await page.mouse.move(box.x + cell * 4, box.y + cell * 4);
  await page.mouse.down();
  await page.mouse.move(box.x + cell * 20, box.y + cell * 12, { steps: 6 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("button", { name: "Deselect" })).toBeDisabled();
  expect(await stitchCount(page), "no stitches moved or lost").toBe(before);
  await expect(page.getByRole("button", { name: "Undo" }), "nothing was committed").toBeDisabled();
});

test("Cancel after pasting undoes the paste's merge too, and keeps the clipboard", async ({ page }) => {
  await generateSmallPattern(page);

  const { box, cell } = await drawSelection(page, 2, 2, 7, 5);
  await page.getByRole("button", { name: "Copy" }).click();

  // Merge this piece by deselecting, so the chart before the paste is a settled state.
  await page.getByRole("button", { name: "Deselect" }).click();
  const beforePaste = await stitchCount(page);

  await page.getByRole("button", { name: "Paste" }).click();
  await expect(page.getByRole("button", { name: "Deselect" })).toBeEnabled();
  // Move the pasted piece somewhere else, then merge it, so the paste has really changed the chart.
  await page.mouse.move(box.x + cell * 6, box.y + cell * 6);
  await page.mouse.down();
  await page.mouse.move(box.x + cell * 22, box.y + cell * 14, { steps: 6 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("button", { name: "Deselect" })).toBeDisabled();
  expect(await stitchCount(page), "the chart is back to before the paste").toBe(beforePaste);
  await expect(page.getByRole("button", { name: "Paste" }), "the clipboard survives a cancel").toBeEnabled();
});
