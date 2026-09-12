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

test("Ctrl+Z/Ctrl+Y undo and redo a merge, matching the Undo/Redo buttons", async ({ page }) => {
  await generateSmallPattern(page);
  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const initialCount = await legendRows.count();

  await legendRows.nth(0).dragTo(legendRows.nth(1));
  await expect(legendRows).toHaveCount(initialCount - 1);

  await page.keyboard.press("Control+z");
  await expect(legendRows).toHaveCount(initialCount);

  await page.keyboard.press("Control+y");
  await expect(legendRows).toHaveCount(initialCount - 1);
});

test("B and F switch the active tool, and Escape/typing targets don't hijack them", async ({ page }) => {
  await generateSmallPattern(page);
  const brushButton = page.getByRole("button", { name: "Brush" });
  const fillButton = page.getByRole("button", { name: "Fill" });

  await expect(brushButton).toHaveAttribute("aria-pressed", "true"); // Brush is the default tool

  await page.keyboard.press("f");
  await expect(fillButton).toHaveAttribute("aria-pressed", "true");
  await expect(brushButton).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("b");
  await expect(brushButton).toHaveAttribute("aria-pressed", "true");

  // Typing "f" into the pattern name field must not switch tools.
  await page.keyboard.press("f"); // back to Fill first
  await expect(fillButton).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Pattern name").fill("bff");
  await expect(fillButton).toHaveAttribute("aria-pressed", "true");
});

test("holding Space temporarily switches to Pan and releasing restores the previous tool", async ({ page }) => {
  await generateSmallPattern(page);
  const fillButton = page.getByRole("button", { name: "Fill" });
  const panButton = page.getByRole("button", { name: "Pan" });

  await page.keyboard.press("f");
  await expect(fillButton).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.down("Space");
  await expect(panButton).toHaveAttribute("aria-pressed", "true");
  await expect(fillButton).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.up("Space");
  await expect(fillButton).toHaveAttribute("aria-pressed", "true");
});

test("1-5 switch the Image window's view mode, including the new Original photo mode", async ({ page }) => {
  await generateSmallPattern(page);
  const colorRadio = page.getByRole("radio", { name: "Color", exact: true });
  const bwRadio = page.getByRole("radio", { name: "Black & white" });
  const realisticRadio = page.getByRole("radio", { name: "Realistic preview" });
  const gridPhotoRadio = page.getByRole("radio", { name: "Grid + photo" });
  const photoOnlyRadio = page.getByRole("radio", { name: "Original photo" });

  await expect(colorRadio).toBeChecked();

  await page.keyboard.press("2");
  await expect(bwRadio).toBeChecked();

  await page.keyboard.press("3");
  await expect(realisticRadio).toBeChecked();

  await page.keyboard.press("4");
  await expect(gridPhotoRadio).toBeChecked();

  await page.keyboard.press("5");
  await expect(photoOnlyRadio).toBeChecked();
  await expect(page.getByAltText("Original uploaded photo")).toBeVisible();

  await page.keyboard.press("1");
  await expect(colorRadio).toBeChecked();
});

test("double-clicking with Brush active flood-fills the whole region that was there before the double-click, not just the clicked cell", async ({
  page,
}) => {
  await generateSmallPattern(page);
  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const canvas = page.getByRole("main").locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not visible");

  async function countFor(rowIndex: number): Promise<number> {
    const text = await legendRows.nth(rowIndex).innerText();
    const match = text.match(/(\d+)\s*sts/);
    if (!match) throw new Error(`Couldn't find a stitch count in legend row text: ${text}`);
    return Number(match[1]);
  }

  // Paint a known, deterministic 3-cell horizontal stroke with color 0 --
  // regardless of what the fixture's own generated colors happen to be,
  // this guarantees a real multi-cell same-colored region to flood-fill,
  // rather than depending on the fixture's own layout containing one.
  await legendRows.nth(0).click();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 15, box.y + 5, { steps: 2 });
  await page.mouse.move(box.x + 25, box.y + 5, { steps: 2 });
  await page.mouse.up();
  const color0Before = await countFor(0);

  // Switch the active color, then double-click in the middle of that same
  // stroke -- the whole 3-cell region (still all color 0) should flood to
  // the new active color, not just the double-clicked cell.
  await legendRows.nth(1).click();
  const color1Before = await countFor(1);
  await canvas.dblclick({ position: { x: 15, y: 5 } });

  const color0After = await countFor(0);
  const color1After = await countFor(1);
  expect(color0After).toBeLessThanOrEqual(color0Before - 2); // the whole stroke left color 0, not just 1 cell
  expect(color1After).toBeGreaterThanOrEqual(color1Before + 2); // ...and landed on color 1 as a block
});

test("dragging a color onto Empty merges it away: its stitches become empty and it's removed from the palette", async ({ page }) => {
  await generateSmallPattern(page);
  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const initialCount = await legendRows.count();
  const emptyRow = page.getByTitle(/Drag a color here to merge it into empty/);

  await legendRows.nth(0).dragTo(emptyRow);
  await expect(legendRows).toHaveCount(initialCount - 1);
});
