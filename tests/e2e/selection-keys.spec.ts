import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

/**
 * G-063: the two committing actions answer the keyboard, and history refuses to move while a piece is in hand
 * (Owner, 2026-09-23). Escape used to merge, which is the opposite of what Cancel means everywhere else here.
 *
 * Enter and Escape are checked against the buttons they stand for rather than against a stitch count guessed in
 * advance: a floating piece counts as stitches wherever it sits, so the number only settles once it is let go.
 */

/** The Image window header: "W × H, N stitches, K colors". */
const header = (page: Page) => page.getByText(/^\d+ × \d+, [\d,]+ stitch(es)?, \d+ colors$/);

async function stitchCount(page: Page): Promise<number> {
  const text = await header(page).innerText();
  const match = text.match(/,\s*([\d,]+)\s*stitch/);
  if (!match) throw new Error(`no stitch count in header: ${text}`);
  return Number(match[1].replace(/,/g, ""));
}

async function generateAndSelect(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas").first()).toBeVisible({ timeout: 30_000 });

  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / 50;
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.mouse.move(box.x + cell * 2.5, box.y + cell * 2.5);
  await page.mouse.down();
  await page.mouse.move(box.x + cell * 9.5, box.y + cell * 6.5, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Apply here" })).toBeEnabled();
  return { box, cell };
}

/** The same gesture every time: select, drag the piece somewhere else, then let it go the way `finish` says. */
async function selectDragAndFinish(page: Page, finish: (page: Page) => Promise<void>): Promise<number> {
  const { box, cell } = await generateAndSelect(page);
  await page.mouse.move(box.x + cell * 5, box.y + cell * 4);
  await page.mouse.down();
  await page.mouse.move(box.x + cell * 20, box.y + cell * 14, { steps: 6 });
  await page.mouse.up();
  await finish(page);
  await expect(page.getByRole("button", { name: "Apply here" })).toBeDisabled();
  return stitchCount(page);
}

test("Enter applies the piece, exactly as the Apply here button does", async ({ page }) => {
  const byButton = await selectDragAndFinish(page, (p) => p.getByRole("button", { name: "Apply here" }).click());
  const byKey = await selectDragAndFinish(page, (p) => p.keyboard.press("Enter"));

  expect(byKey).toBe(byButton);
});

test("Escape cancels the piece, exactly as the Cancel button does, and both restore the chart", async ({ page }) => {
  await generateAndSelect(page);
  const untouched = await stitchCount(page);

  const byButton = await selectDragAndFinish(page, (p) => p.getByRole("button", { name: "Cancel" }).click());
  const byKey = await selectDragAndFinish(page, (p) => p.keyboard.press("Escape"));

  expect(byKey).toBe(byButton);
  expect(byKey, "cancelling puts the chart back as it was before the selection").toBe(untouched);
});

test("Undo and Redo refuse to move while a piece is in hand, and work again once it is let go", async ({ page }) => {
  const { box, cell } = await generateAndSelect(page);
  await page.mouse.move(box.x + cell * 5, box.y + cell * 4);
  await page.mouse.down();
  await page.mouse.move(box.x + cell * 20, box.y + cell * 14, { steps: 6 });
  await page.mouse.up();
  const held = await stitchCount(page);

  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
  await page.keyboard.press("Control+z");
  expect(await stitchCount(page), "the keyboard is refused too").toBe(held);

  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();
});
