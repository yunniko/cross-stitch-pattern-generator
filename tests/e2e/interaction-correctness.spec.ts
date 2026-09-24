import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

/** G-031 M2 (review B4, B5, B7, B8): keyboard shortcuts read live state, Space never steals a focused control's activation, drags stay cheap on the largest grid. */

async function generateSmallPattern(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
}

/** A synthetic editable-pattern file 1000 stitches wide, opened through the file input so the test doesn't pay for a 1000-stitch generation. */
function largePatternJson(width: number, height: number, colors: number): string {
  const palette = Array.from({ length: colors }, (_, i) => ({
    rgb: [(i * 37) % 256, (i * 91) % 256, (i * 151) % 256],
    symbol: String.fromCharCode(65 + i),
    name: `Color ${i}`,
  }));
  const cellPalette = new Array<number>(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) cellPalette[y * width + x] = (Math.floor(x / 25) + Math.floor(y / 25)) % colors;
  return JSON.stringify({ formatVersion: 5, width, height, isLandscape: true, cellPalette, palette, name: "large" });
}

test("Space with a floating selection merges it where it currently is, not where the handler last saw it (B4)", async ({ page }) => {
  await generateSmallPattern(page);
  const canvas = page.getByTestId("chart-frame");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not visible");
  const cell = box.width / 50; // Small preset: 50 stitches wide

  await page.getByRole("button", { name: "Select", exact: true }).click();
  // Draw a 4x4 selection, then drag it 10 cells to the right.
  await page.mouse.move(box.x + cell * 2.5, box.y + cell * 2.5);
  await page.mouse.down();
  await page.mouse.move(box.x + cell * 5.5, box.y + cell * 5.5, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Apply here" })).toBeEnabled();
  await page.mouse.move(box.x + cell * 4, box.y + cell * 4);
  await page.mouse.down();
  await page.mouse.move(box.x + cell * 14, box.y + cell * 4, { steps: 6 });
  await page.mouse.up();

  // The pre-fix handler closed over `selection` as it was when the effect
  // last ran (null here: drawing a selection doesn't change `pattern`), so
  // Space switched tools without merging and the piece stayed floating.
  await page.keyboard.down("Space");
  await expect(page.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("Space");
  await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Apply here" })).toBeDisabled(); // merged
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled(); // ...as one history step
});

test("Space on a focused button activates the button and never switches to Pan, even while held (B5)", async ({ page }) => {
  await generateSmallPattern(page);
  const panButton = page.getByRole("button", { name: "Pan" });
  await page.getByRole("tab", { name: "Chart" }).focus();
  await page.keyboard.down("Space");
  // Pre-fix: the global handler claimed every Space keydown and flipped the
  // tool to Pan for as long as the key was held.
  await expect(panButton).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("Space");
  await expect(page.getByText("Saved automatically in this browser.")).toBeVisible(); // the Chart pane opened: the control itself fired
  await expect(panButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Brush" })).toHaveAttribute("aria-pressed", "true");

  // Same for a focused view-mode chip: Space presses it, nothing pans.
  await page.getByRole("button", { name: "B&W", exact: true }).focus();
  await page.keyboard.down("Space");
  await expect(panButton).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("Space");
  await expect(page.getByRole("button", { name: "B&W", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Space with focus on the page body still pans, and releasing restores the tool", async ({ page }) => {
  await generateSmallPattern(page);
  await page.getByRole("button", { name: "Fill" }).click();
  await page.locator("body").click({ position: { x: 5, y: 5 } }); // focus nothing in particular
  await page.keyboard.down("Space");
  await expect(page.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("Space");
  await expect(page.getByRole("button", { name: "Fill" })).toHaveAttribute("aria-pressed", "true");
});

test("Ctrl+Shift+Z redoes, alongside Ctrl+Y (B8)", async ({ page }) => {
  await generateSmallPattern(page);
  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const initialCount = await legendRows.count();

  await legendRows.nth(0).dragTo(legendRows.nth(1));
  await expect(legendRows).toHaveCount(initialCount - 1);
  await page.keyboard.press("Control+z");
  await expect(legendRows).toHaveCount(initialCount);
  await page.keyboard.press("Control+Shift+z");
  await expect(legendRows).toHaveCount(initialCount - 1);
});

test("a 50-cell brush stroke on a 1000-stitch pattern completes within a bounded time (B7)", async ({ page }) => {
  test.slow();
  await page.goto("/");
  // The file input stays mounted whatever screen is up; the New -> confirm -> card path has its own test.
  await page
    .getByLabel("Open pattern file")
    .setInputFiles({ name: "large_editable.json", mimeType: "application/json", buffer: Buffer.from(largePatternJson(1000, 625, 16)) });
  const canvas = page.getByTestId("chart-frame");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/1000 × 625, [\d,]+ stitch/)).toBeVisible();

  const legendRows = page.locator('[data-testid="legend-color-row"]');
  await legendRows.nth(0).click();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not visible");
  const cell = box.width / 1000;

  // One pointer event per cell across 50 cells. Each move is dispatched and
  // handled before the next is sent, so the wall time is the handlers'.
  await page.mouse.move(box.x + cell * 0.5, box.y + cell * 10.5);
  await page.mouse.down();
  const started = Date.now();
  for (let i = 1; i <= 50; i++) await page.mouse.move(box.x + cell * (i + 0.5), box.y + cell * 10.5);
  await page.mouse.up();
  const elapsedMs = Date.now() - started;
  test.info().annotations.push({ type: "stroke-ms", description: String(elapsedMs) });
  console.log(`50-cell stroke on 1000x625: ${elapsedMs} ms`);

  // Pre-fix each move copied and recounted all 625k cells and repainted the
  // whole 4000x2500 canvas: 21,126 ms for this gesture on the Owner's
  // machine (2026-09-13). Incremental drawing measured 1,261 ms, most of it
  // Playwright's per-event round trip; the bound leaves 4x headroom for a
  // slow CI runner while staying 4x under the pre-fix time.
  expect(elapsedMs).toBeLessThan(5_000);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
});
