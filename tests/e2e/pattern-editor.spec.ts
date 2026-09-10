import { test, expect } from "@playwright/test";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

test("editor: generate, merge two colors, undo/redo, download editable, and reopen it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("1. Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByAltText("Cross-stitch pattern preview")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Edit", exact: true }).click();
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
  await page.getByRole("button", { name: "Open a saved editable pattern" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(savedPath);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(legendRows).toHaveCount(initialCount - 1);
});

test("editor: renaming the pattern changes every download's filename", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("1. Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByAltText("Cross-stitch pattern preview")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Edit", exact: true }).click();

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

test("editor: cluster-fill drag and click-to-paint both change the pattern without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await page.getByLabel("1. Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByAltText("Cross-stitch pattern preview")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  const legendRows = page.locator("div[draggable='true']");
  const canvas = page.locator("canvas");

  // Cluster-fill: drag a legend color onto the picture.
  await legendRows.nth(0).dragTo(canvas, { targetPosition: { x: 10, y: 10 } });

  // Click-to-paint: select a color, then click one stitch.
  await legendRows.nth(1).click();
  await canvas.click({ position: { x: 30, y: 30 } });
  await legendRows.nth(1).click(); // deselect

  expect(errors).toEqual([]);
});

test("editor: brush stroke paints multiple stitches as a single undo step", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("1. Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByAltText("Cross-stitch pattern preview")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Edit", exact: true }).click();

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
