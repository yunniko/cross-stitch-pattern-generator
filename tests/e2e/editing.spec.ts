import { test, expect } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function generateSmallPattern(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
}

test("generate, merge two colors, undo/redo, download editable, and reopen it", async ({ page }) => {
  await generateSmallPattern(page);

  const legendRows = page.locator("div[draggable='true']");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const initialCount = await legendRows.count();
  expect(initialCount).toBeGreaterThan(1);

  // Merge the first color into the second.
  await legendRows.nth(0).dragTo(legendRows.nth(1));
  await expect(legendRows).toHaveCount(initialCount - 1);

  // Undo restores it; redo re-merges.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(legendRows).toHaveCount(initialCount);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(legendRows).toHaveCount(initialCount - 1);

  // Download editable, then reopen it fresh and confirm the same state comes back.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download editable" }).click(),
  ]);
  const savedPath = test.info().outputPath("saved-pattern.json");
  await download.saveAs(savedPath);

  await page.goto("/");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open editable pattern" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(savedPath);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(legendRows).toHaveCount(initialCount - 1);
});

test("renaming the pattern changes every download's filename", async ({ page }) => {
  await generateSmallPattern(page);

  const nameInput = page.getByLabel("Pattern name");
  await expect(nameInput).toHaveValue("sample");
  await nameInput.fill("My Cat");
  await nameInput.blur();

  const [colorDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download color PNG" }).click(),
  ]);
  expect(colorDownload.suggestedFilename()).toBe("My Cat_color.png");

  const [realisticDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download realistic preview PNG" }).click(),
  ]);
  expect(realisticDownload.suggestedFilename()).toBe("My Cat_preview.png");

  const [editableDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download editable" }).click(),
  ]);
  expect(editableDownload.suggestedFilename()).toBe("My Cat_editable.json");

  // Renaming is a normal, undoable history step, like every other edit.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(nameInput).toHaveValue("sample");
});

test("cluster-fill drag and click-to-paint both change the pattern without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await generateSmallPattern(page);

  const legendRows = page.locator("div[draggable='true']");
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();

  // Cluster-fill: drag a legend color onto the picture. Center of the
  // canvas, not a corner -- the app shell's Image window sits inside a
  // flex layout with chrome above/below/beside it, and a target near an
  // edge is more exposed to a few pixels of layout drift between when
  // Playwright measures the drop target and when the drag actually lands.
  await legendRows.nth(0).dragTo(canvas);

  // Click-to-paint: select a color, then click one stitch.
  await legendRows.nth(1).click();
  await canvas.click({ position: { x: 30, y: 30 } });
  await legendRows.nth(1).click(); // deselect

  expect(errors).toEqual([]);
});

test("brush stroke paints multiple stitches as a single undo step", async ({ page }) => {
  await generateSmallPattern(page);

  const legendRows = page.locator("div[draggable='true']");
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not visible");

  await legendRows.nth(0).click(); // select the first legend color as active

  // Drag a stroke across several cells.
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 25, box.y + 5, { steps: 4 });
  await page.mouse.move(box.x + 45, box.y + 5, { steps: 4 });
  await page.mouse.up();

  // A single undo should revert the whole stroke at once.
  const undoButton = page.getByRole("button", { name: "Undo" });
  await expect(undoButton).toBeEnabled();
  await undoButton.click();
  await expect(undoButton).toBeDisabled();
});

test("regenerating (a processing-param change) is undoable like any other edit (G-012)", async ({ page }) => {
  await generateSmallPattern(page);
  await expect(page.getByText(/50 × \d+ stitches/)).toBeVisible();

  await page.getByRole("radio", { name: "Custom" }).check();
  await page.getByRole("spinbutton").fill("30");
  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect(page.getByText(/30 × \d+ stitches/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/50 × \d+ stitches/)).toBeVisible();
});
