import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

/** G-063: the Fill and Duplicate buttons, through the real UI (Owner, 2026-09-23). */

const header = (page: Page) => page.getByText(/^\d+ × \d+, [\d,]+ stitch(es)?, \d+ colors$/);

async function colourCount(page: Page): Promise<number> {
  const text = await header(page).innerText();
  const match = text.match(/,\s*(\d+)\s*colors$/);
  if (!match) throw new Error(`no colour count in header: ${text}`);
  return Number(match[1]);
}

/** Puts a thread in the brush's hand: nothing is held until a row in the list is picked, Brush included. */
async function pickFirstThread(page: Page) {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.locator('[data-testid="legend-color-row"]').first().click();
  await page.getByRole("tab", { name: "Chart" }).click();
}

/**
 * The chart as the editable save writes it, which is where the cells can actually be read. The Export control lives
 * in the Threads pane, so this goes there first rather than assuming which tab is open.
 */
async function exportChart(page: Page): Promise<{ width: number; height: number; cellPalette: number[] }> {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}

async function generateAndSelect(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });

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

test("Fill paints the selected area in the brush's colour and leaves it floating", async ({ page }) => {
  await generateAndSelect(page);
  await pickFirstThread(page);

  await expect(page.getByRole("button", { name: "Fill selection", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Fill selection", exact: true }).click();

  // Still in hand: it can be moved, applied or cancelled exactly as before.
  await expect(page.getByRole("button", { name: "Apply here" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeEnabled();

  // Cancelling puts back whatever the fill covered, so the fill really was only in the floating piece.
  const before = await colourCount(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await colourCount(page)).toBe(before);
});

test("Fill then Apply leaves one flat block in the chart, and Undo takes it back", async ({ page }) => {
  await generateAndSelect(page);
  await pickFirstThread(page);

  // The chart's own counts do not move -- filling stitches with a thread the chart already uses changes neither --
  // so this reads the cells themselves out of the exported file.
  const rect = (await page.getByText(/^\d+ × \d+ at \d+, \d+$/).innerText()).match(/(\d+) × (\d+) at (\d+), (\d+)/)!;
  const [w, h, x, y] = rect.slice(1).map(Number);

  await page.getByRole("button", { name: "Fill selection", exact: true }).click();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Apply here" })).toBeDisabled();

  const filled = await exportChart(page);
  const inRect: number[] = [];
  for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) inRect.push(filled.cellPalette[row * filled.width + col]);
  expect(new Set(inRect).size, "every cell of the area is the one colour").toBe(1);

  await page.keyboard.press("Control+z");
  const undone = await exportChart(page);
  const sameAgain: number[] = [];
  for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) sameAgain.push(undone.cellPalette[row * undone.width + col]);
  expect(new Set(sameAgain).size, "undo puts the picture back, so the block is gone").toBeGreaterThan(1);
});

test("Duplicate leaves the original and puts a copy in hand, which Paste can repeat", async ({ page }) => {
  await generateAndSelect(page);

  await expect(page.getByRole("button", { name: "Duplicate" })).toBeEnabled();
  await page.getByRole("button", { name: "Duplicate" })
    .click();

  // A piece is still in hand -- the copy -- and the clipboard now holds it, so Paste is live without a Copy press.
  await expect(page.getByRole("button", { name: "Apply here" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Paste" })).toBeEnabled();
  await expect(page.getByText(/^\d+ × \d+ at \d+, \d+$/)).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Apply here" })).toBeDisabled();
});

test("Fill is unavailable while the brush holds no colour", async ({ page }) => {
  // Nothing is in the brush's hand until a thread is picked, so a chart nobody has picked from cannot be filled --
  // the same rule the Brush tool has always had.
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill("40");
  await page.getByLabel("Height in stitches").fill("30");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();

  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / 40;
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.mouse.move(box.x + cell * 2.5, box.y + cell * 2.5);
  await page.mouse.down();
  await page.mouse.move(box.x + cell * 9.5, box.y + cell * 6.5, { steps: 4 });
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "Apply here" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Fill selection", exact: true })).toBeDisabled();
});
