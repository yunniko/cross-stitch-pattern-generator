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
  await page.getByRole("tab", { name: "Chart" }).click();
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
  // 1b replaced the five view radios with three chips and a Photo toggle that cycles; the frame's own
  // data-view-mode is the mode itself, so it outlives whatever shape the control takes.
  const frame = page.getByTestId("chart-frame");
  const mode = async (expected: string) => expect(frame).toHaveAttribute("data-view-mode", expected);

  await mode("color");

  await page.keyboard.press("2");
  await mode("bw");
  await expect(page.getByRole("button", { name: "B&W", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("3");
  await mode("realistic");

  await page.keyboard.press("4");
  await mode("photo");

  await page.keyboard.press("5");
  await mode("photo-only");
  await expect(page.getByRole("button", { name: "Show the photo behind the chart" })).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("1");
  await mode("color");
});

test("double-clicking with Brush active flood-fills the whole region that was there before the double-click, not just the clicked cell", async ({
  page,
}) => {
  await generateSmallPattern(page);
  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const canvas = page.getByTestId("chart-frame");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not visible");

  async function countFor(rowIndex: number): Promise<number> {
    // 1b's row prints the count on its own line with the skein estimate beneath it, so the old "123 sts" text is
    // gone; the count carries its own testid rather than being picked out of the row's text by position.
    const text = (await legendRows.nth(rowIndex).getByTestId("legend-color-count").innerText()).trim();
    const value = Number(text.replace(/,/g, ""));
    if (!Number.isFinite(value)) throw new Error(`Couldn't read a stitch count from legend row: ${text}`);
    return value;
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

  await expect.poll(() => countFor(0)).toBeLessThanOrEqual(color0Before - 2); // the whole stroke left color 0, not just 1 cell
  const color0After = await countFor(0);
  const color1After = await countFor(1);
  expect(color1After).toBeGreaterThanOrEqual(color1Before + 2); // ...and landed on color 1 as a block

  // The double-click is one undo step (D138): one undo returns to before its first click, one redo brings the fill back.
  await page.keyboard.press("Control+z");
  await expect.poll(() => countFor(0)).toBe(color0Before);
  expect(await countFor(1)).toBe(color1Before);
  await page.keyboard.press("Control+y");
  await expect.poll(() => countFor(0)).toBe(color0After);
  expect(await countFor(1)).toBe(color1After);
});

test("with the Options switch off, a double-click paints only the stitch under it, as two ordinary clicks (G-041)", async ({ page }) => {
  await generateSmallPattern(page);
  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const canvas = page.getByTestId("chart-frame");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not visible");

  async function countFor(rowIndex: number): Promise<number> {
    // 1b's row prints the count on its own line with the skein estimate beneath it, so the old "123 sts" text is
    // gone; the count carries its own testid rather than being picked out of the row's text by position.
    const text = (await legendRows.nth(rowIndex).getByTestId("legend-color-count").innerText()).trim();
    const value = Number(text.replace(/,/g, ""));
    if (!Number.isFinite(value)) throw new Error(`Couldn't read a stitch count from legend row: ${text}`);
    return value;
  }

  // Switch the fill off; the checkbox is on by default.
  await page.getByRole("tab", { name: "Chart" }).click();
  const fillSwitch = page.getByRole("checkbox", { name: "Double-click fills a region" });
  await expect(fillSwitch).toBeChecked();
  await fillSwitch.uncheck();
  await page.getByRole("tab", { name: "Threads" }).click();

  // The same deterministic 3-cell stroke the flood-fill test paints.
  await legendRows.nth(0).click();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 15, box.y + 5, { steps: 2 });
  await page.mouse.move(box.x + 25, box.y + 5, { steps: 2 });
  await page.mouse.up();
  const color0Before = await countFor(0);

  await legendRows.nth(1).click();
  const color1Before = await countFor(1);
  await canvas.dblclick({ position: { x: 15, y: 5 } });

  // Only the double-clicked stitch changes hands: the stroke keeps its other two cells.
  await expect.poll(() => countFor(0)).toBe(color0Before - 1);
  expect(await countFor(1)).toBe(color1Before + 1);

  // Two clicks are two undo steps -- the fill's single step (D138) belongs to the switched-on behaviour only.
  await page.keyboard.press("Control+z");
  await expect.poll(() => countFor(0)).toBe(color0Before - 1);
  await page.keyboard.press("Control+z");
  await expect.poll(() => countFor(0)).toBe(color0Before);
  expect(await countFor(1)).toBe(color1Before);
});

test("dragging a color onto Empty merges it away: its stitches become empty and it's removed from the palette", async ({ page }) => {
  await generateSmallPattern(page);
  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const initialCount = await legendRows.count();
  const emptyRow = page.getByTitle(/Drag a color here to merge it into empty/);

  await legendRows.nth(0).dragTo(emptyRow);
  await expect(legendRows).toHaveCount(initialCount - 1);
});
