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

test("expanding the canvas adds a new fill color and is a single undoable step (G-012)", async ({ page }) => {
  await generateSmallPattern(page);
  await expect(page.getByText(/50 × \d+ stitches/)).toBeVisible();

  const legendRows = page.locator("div[draggable='true']");
  const initialCount = await legendRows.count();

  await page.getByRole("button", { name: "Resize canvas…" }).click();
  await page.getByLabel("Right").fill("5");
  await page.locator('input[type="color"]').fill("#123456");
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page.getByText(/55 × \d+ stitches/)).toBeVisible();
  await expect(legendRows).toHaveCount(initialCount + 1); // new fill color appended

  const undoButton = page.getByRole("button", { name: "Undo" });
  await expect(undoButton).toBeEnabled();
  await undoButton.click();
  await expect(page.getByText(/50 × \d+ stitches/)).toBeVisible();
  await expect(legendRows).toHaveCount(initialCount);
});

test("cropping the canvas shrinks it without needing a fill color", async ({ page }) => {
  await generateSmallPattern(page);

  await page.getByRole("button", { name: "Resize canvas…" }).click();
  await expect(page.getByLabel("Fill color")).not.toBeVisible(); // no fill needed until something expands
  await page.getByLabel("Left").fill("-5");
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page.getByText(/45 × \d+ stitches/)).toBeVisible();
});

test("rejects cropping away the entire pattern with a visible error, not a crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await generateSmallPattern(page);

  await page.getByRole("button", { name: "Resize canvas…" }).click();
  await page.getByLabel("Left").fill("-60"); // more than the pattern's own 50-stitch width
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page.getByText(/entire pattern/)).toBeVisible();
  await expect(page.getByText(/50 × \d+ stitches/)).toBeVisible(); // unchanged
  expect(errors).toEqual([]);
});
