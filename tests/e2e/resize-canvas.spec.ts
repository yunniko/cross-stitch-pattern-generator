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

/** The Image window header: "W × H, N stitches, K colors" -- the canvas size, then only filled stitches (D120). */
const patternHeader = (page: import("@playwright/test").Page) => page.getByText(/^\d+ × \d+, [\d,]+ stitch(es)?, \d+ colors$/);

test("expanding the canvas adds empty stitches, no palette color, as a single undoable step (D109)", async ({ page }) => {
  await generateSmallPattern(page);
  const header = patternHeader(page);
  await expect(header).toHaveText(/^50 × \d+, /);
  const stitches = /, ([\d,]+ stitch(?:es)?),/.exec((await header.textContent()) ?? "")![1];

  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const initialCount = await legendRows.count();

  await page.getByRole("tab", { name: "Chart" }).click();
  await expect(page.getByLabel("Fill color")).toHaveCount(0); // no color choice: new cells are always empty
  await page.getByLabel("Right").fill("5");
  await page.getByRole("button", { name: "Apply" }).click();

  // The canvas grows; the new empty cells aren't stitches, so the count stays the same (D120).
  await expect(header).toHaveText(new RegExp(`^55 × \\d+, ${stitches},`));
  await page.getByRole("tab", { name: "Threads" }).click(); // the Chart pane replaced the Threads pane; the rows only exist while Threads is up
  await expect(legendRows).toHaveCount(initialCount);

  const undoButton = page.getByRole("button", { name: "Undo" });
  await expect(undoButton).toBeEnabled();
  await undoButton.click();
  await expect(header).toHaveText(new RegExp(`^50 × \\d+, ${stitches},`));
  await page.getByRole("tab", { name: "Threads" }).click(); // the Chart pane replaced the Threads pane; the rows only exist while Threads is up
  await expect(legendRows).toHaveCount(initialCount);
});

test("cropping the canvas shrinks it", async ({ page }) => {
  await generateSmallPattern(page);

  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByLabel("Left", { exact: true }).fill("-5");
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(patternHeader(page)).toHaveText(/^45 × \d+, /);
});

test("rejects cropping away the entire pattern with a visible error, not a crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await generateSmallPattern(page);

  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByLabel("Left", { exact: true }).fill("-60"); // more than the pattern's own 50-stitch width
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page.getByText(/entire pattern/)).toBeVisible();
  await expect(patternHeader(page)).toHaveText(/^50 × \d+, /); // unchanged
  expect(errors).toEqual([]);
});
