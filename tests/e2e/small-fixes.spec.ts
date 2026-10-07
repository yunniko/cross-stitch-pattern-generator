import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expectPhotoLoaded, pickTool, saveButton, showWorkspace, openViewSettings } from "./helpers/app";
import { clickSelectionAction, selectionFinish } from "./helpers/selection";

/**
 * G-079: errors that can be dismissed and go away by themselves, the canvas colour on the shared colour picker (and gone
 * from the top panel), and the transparency lock in every drawing and filling tool.
 */

const SUBJECT = path.join(__dirname, "fixtures", "transparent-subject.png");
const EMPTY = 255;
const SIZE = 50;

test("an error can be dismissed, and goes away by itself", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  const bad = { name: "broken.json", mimeType: "application/json", buffer: Buffer.from("this is not a chart") };
  const dismiss = page.getByRole("button", { name: "Dismiss message" });

  // Dismissed with its cross.
  await page.getByLabel("Open pattern file").setInputFiles(bad);
  await expect(dismiss).toBeVisible();
  await dismiss.click();
  await expect(dismiss).toHaveCount(0);

  // Left alone, it is gone after a while.
  await page.getByLabel("Open pattern file").setInputFiles(bad);
  await expect(dismiss).toBeVisible();
  await page.clock.fastForward(6_000);
  await expect(dismiss).toBeVisible();
  await page.clock.fastForward(8_000);
  await expect(dismiss).toHaveCount(0);
});

test("the canvas colour is with the view settings only, and opens the colour picker the threads use", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill("20");
  await page.getByLabel("Height in stitches").fill("20");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();

  // Not in any panel: until Preferences are opened, nothing on the page is labelled Canvas color (G-095 moved it there
  // from the Chart tab, D301; it changes what is seen, not the chart).
  await expect(page.getByLabel("Canvas color", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Chart" }).click();
  await expect(page.getByLabel("Canvas color", { exact: true })).toHaveCount(0);

  await openViewSettings(page);
  const swatch = page.getByRole("button", { name: "Canvas color", exact: true });
  await expect(swatch).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await swatch.click();
  const picker = page.getByRole("dialog", { name: "Canvas color picker" });
  await expect(picker).toBeVisible();
  // `react-colorful`: the same component the thread colour editor draws.
  await expect(picker.locator(".react-colorful")).toBeVisible();
  await picker.getByLabel("Canvas color hex").fill("#336699");
  await expect(swatch).toHaveCSS("background-color", "rgb(51, 102, 153)");
  // An unfinished or wrong hex changes nothing.
  await picker.getByLabel("Canvas color hex").fill("#12");
  await expect(swatch).toHaveCSS("background-color", "rgb(51, 102, 153)");
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  // The first Escape closed the picker alone; Preferences are still up, and the next one closes them.
  await expect(page.getByRole("dialog", { name: "Preferences" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Preferences" })).toHaveCount(0);
});

/** The chart as the editable save writes it, which is where the cells can actually be read. */
async function savedCells(page: Page): Promise<number[]> {
  await page.getByRole("tab", { name: "Threads" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), saveButton(page).click()]);
  const saved = JSON.parse(await readFile((await download.path())!, "utf8")) as { cellPalette: number[] };
  await page.getByRole("tab", { name: "Chart" }).click();
  return saved.cellPalette;
}

async function pickThread(page: Page, row: number) {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.locator('[data-testid="legend-color-row"]').nth(row).click();
  await page.getByRole("tab", { name: "Chart" }).click();
}

test("with transparency locked, drawing and filling cannot turn empty stitches into colour or the reverse", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(SUBJECT);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await showWorkspace(page, "Edit");
  await page.getByRole("tab", { name: "Chart" }).click();

  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  const cell = (box.width - 2) / SIZE;
  const at = (x: number, y: number) => ({ x: box.x + 1 + (x + 0.5) * cell, y: box.y + 1 + (y + 0.5) * cell });
  const click = async (x: number, y: number) => {
    const p = at(x, y);
    await page.mouse.click(p.x, p.y);
  };
  const cellAt = (cells: number[], x: number, y: number) => cells[y * SIZE + x];
  const lock = page.getByRole("button", { name: "Lock transparency" });
  const undo = page.getByRole("button", { name: "Undo", exact: true });

  const start = await savedCells(page);
  expect(cellAt(start, 1, 1), "the corner is empty").toBe(EMPTY);
  expect(cellAt(start, 25, 25), "the middle is stitched").not.toBe(EMPTY);

  // Unlocked, the brush paints an empty stitch (as it always did).
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await pickThread(page, 0);
  await pickTool(page, "Brush");
  await click(1, 1);
  expect(cellAt(await savedCells(page), 1, 1)).not.toBe(EMPTY);
  await undo.click();
  expect(cellAt(await savedCells(page), 1, 1)).toBe(EMPTY);
  await expect(undo).toBeDisabled();

  // Locked: the same stroke leaves it empty, and costs no undo step.
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await click(1, 1);
  expect(cellAt(await savedCells(page), 1, 1)).toBe(EMPTY);
  await expect(undo).toBeDisabled();

  // Locked, colour to colour still works: the middle takes one thread, then another.
  await click(25, 25);
  const first = cellAt(await savedCells(page), 25, 25);
  await pickThread(page, 1);
  await click(25, 25);
  const second = cellAt(await savedCells(page), 25, 25);
  expect(first).not.toBe(EMPTY);
  expect(second).not.toBe(EMPTY);

  // Locked, the shape tools cannot draw into the background either: a line across the empty corner changes nothing there.
  await pickTool(page, "Line");
  const a = at(0, 0);
  const b = at(6, 6);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  const afterLine = await savedCells(page);
  for (let i = 0; i <= 6; i++) expect(cellAt(afterLine, i, i), `line cell ${i}`).toBe(EMPTY);

  // Locked, Fill cannot flood the background, nor erase the subject. It still recolours a region of the subject: one of the
  // two threads differs from what is there, so one of the two fills changes it.
  await pickTool(page, "Fill");
  await click(1, 1);
  expect(cellAt(await savedCells(page), 1, 1)).toBe(EMPTY);
  const beforeFill = await savedCells(page);
  await pickThread(page, 0);
  await click(32, 32);
  await pickThread(page, 1);
  await click(32, 32);
  const afterFill = await savedCells(page);
  expect(afterFill.filter((v, i) => (v === EMPTY) !== (beforeFill[i] === EMPTY))).toEqual([]);
  expect(afterFill.filter((v, i) => v !== beforeFill[i]).length, "the fill recoloured the subject").toBeGreaterThan(10);

  // Unlocked again, Fill floods the background as it always did.
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await click(1, 1);
  expect(cellAt(await savedCells(page), 1, 1)).not.toBe(EMPTY);
});

test("with transparency locked, Fill selection paints only the stitches that are not empty", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(SUBJECT);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await showWorkspace(page, "Edit");
  await page.getByRole("tab", { name: "Chart" }).click();
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = (box.width - 2) / SIZE;
  const at = (x: number, y: number) => ({ x: box.x + 1 + (x + 0.5) * cell, y: box.y + 1 + (y + 0.5) * cell });
  const before = await savedCells(page);

  await page.getByRole("button", { name: "Lock transparency" }).click();
  await pickThread(page, 0);
  // A piece that holds both the empty corner and part of the subject.
  await pickTool(page, "Select");
  const from = at(0, 0);
  const to = at(24, 24);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await clickSelectionAction(page, "Fill selection");
  await selectionFinish(page, "Apply here").click();

  const after = await savedCells(page);
  const inside = (i: number) => i % SIZE <= 24 && Math.floor(i / SIZE) <= 24;
  const emptied = before.map((v, i) => (inside(i) && v === EMPTY ? i : -1)).filter((i) => i >= 0);
  const filled = before.map((v, i) => (inside(i) && v !== EMPTY ? i : -1)).filter((i) => i >= 0);
  expect(emptied.length, "the piece holds empty stitches").toBeGreaterThan(20);
  expect(filled.length, "and stitches").toBeGreaterThan(20);
  // Every empty stitch is still empty; every stitch in the piece now has the one thread; nothing outside it moved.
  expect(emptied.filter((i) => after[i] !== EMPTY)).toEqual([]);
  expect(new Set(filled.map((i) => after[i])).size).toBe(1);
  expect(after.filter((v, i) => !inside(i) && v !== before[i])).toEqual([]);
});

test("the transparency lock is remembered across a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByLabel("Width in stitches").fill("20");
  await page.getByLabel("Height in stitches").fill("20");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const lock = page.getByRole("button", { name: "Lock transparency" });
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Lock transparency" })).toHaveAttribute("aria-pressed", "true");
});

test("the top panel does not announce the loaded file's name", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(SUBJECT);
  await expectPhotoLoaded(page);
  await expect(page.getByText(/Loaded:/)).toHaveCount(0);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await showWorkspace(page, "Edit");
  await expect(page.getByText(/Loaded:/)).toHaveCount(0);
});
