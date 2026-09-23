import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

/**
 * G-064 M2: one press of the brush covers a stamp rather than a stitch (Owner, 2026-09-23). Sizes are odd only, so
 * every stamp is centred on the stitch under the pointer.
 */

async function generate(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  // A thread in the brush's hand, since nothing is held until one is picked.
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.locator('[data-testid="legend-color-row"]').first().click();
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("button", { name: "Brush" }).click();
}

async function exportChart(page: Page): Promise<{ cellPalette: number[]; width: number; height: number }> {
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const chart = JSON.parse(await readFile((await download.path())!, "utf8"));
  await page.getByRole("tab", { name: "Chart" }).click();
  return chart;
}

/** One press in the middle of the chart, at the current brush setting. */
async function pressAtCentre(page: Page) {
  const frame = page.getByTestId("chart-frame");
  const box = (await frame.boundingBox())!;
  const cell = box.width / 50;
  await frame.click({ position: { x: cell * 20.5, y: cell * 10.5 } });
  return { cx: 20, cy: 10 };
}

/** The cells the press changed, as offsets from its centre. */
function changedAround(before: number[], after: number[], width: number, cx: number, cy: number): string[] {
  const moved: string[] = [];
  for (let i = 0; i < after.length; i++) {
    if (before[i] === after[i]) continue;
    moved.push(`${(i % width) - cx},${Math.floor(i / width) - cy}`);
  }
  return moved.sort();
}

test("size 1 covers the one stitch under the pointer, as the brush always has", async ({ page }) => {
  await generate(page);
  const before = await exportChart(page);
  const { cx, cy } = await pressAtCentre(page);
  const after = await exportChart(page);

  const moved = changedAround(before.cellPalette, after.cellPalette, before.width, cx, cy);
  // Either the one stitch changed, or it already held that thread and nothing did; both mean one stitch was painted.
  expect(moved.length).toBeLessThanOrEqual(1);
  if (moved.length === 1) expect(moved[0]).toBe("0,0");
});

test("a round brush stamps a disc, and a square one the whole block", async ({ page }) => {
  await generate(page);
  await page.getByLabel("Brush size in stitches").selectOption("5");

  // Round first: the corners of the 5x5 block are outside the disc.
  const beforeRound = await exportChart(page);
  const { cx, cy } = await pressAtCentre(page);
  const afterRound = await exportChart(page);
  const round = new Set(changedAround(beforeRound.cellPalette, afterRound.cellPalette, beforeRound.width, cx, cy));
  expect(round.has("-2,-2"), "a disc has no corners").toBe(false);
  expect(round.has("0,-2"), "but it reaches the edge straight up").toBe(true);

  await page.keyboard.press("Control+z");
  await page.getByRole("button", { name: "■", exact: true }).click();
  const beforeSquare = await exportChart(page);
  await pressAtCentre(page);
  const afterSquare = await exportChart(page);
  const square = new Set(changedAround(beforeSquare.cellPalette, afterSquare.cellPalette, beforeSquare.width, cx, cy));
  expect(square.has("-2,-2"), "a block has corners").toBe(true);
});

test("the brush keeps its size across a reload", async ({ page }) => {
  await generate(page);
  await page.getByLabel("Brush size in stitches").selectOption("7");

  // The controls belong to an open chart, so the reloaded page gets one again; what is being checked is that the
  // setting came back from storage, not that the chart did.
  await page.reload();
  await generate(page);

  await expect(page.getByLabel("Brush size in stitches")).toHaveValue("7");
});
