import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * G-045: New opens the start screen, and choosing a card there replaces the one chart this browser autosaves — so the
 * design puts a confirm in between (Atelier, B · Confirm new chart). These cover the path the other specs skip by
 * addressing the file input directly: that reaching the start screen costs nothing, that Keep editing really keeps,
 * and that Start new chart really discards.
 */

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function generateSmallPattern(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 30_000 });
}

test("New opens the start screen without touching the chart, and Back returns to it", async ({ page }) => {
  await generateSmallPattern(page);
  // The chart's own identity, not Undo: a first Generate is the undo baseline (workspace.tsx, isFirst), so an
  // untouched chart has nothing to undo and Undo's state says nothing about whether this chart came back.
  const before = await page.getByTestId("chart-frame").getAttribute("data-cell-size");

  await page.getByRole("button", { name: "New chart" }).click();
  await expect(page.getByRole("button", { name: /^Choose a photo/ })).toBeVisible();
  await expect(page.getByTestId("chart-frame")).toHaveCount(0); // the start screen covers it
  await expect(page.getByRole("dialog", { name: "Start a new chart?" })).toHaveCount(0); // nothing destructive yet

  await page.getByRole("button", { name: /^Back to / }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-cell-size", before!); // the same chart came back
});

test("choosing a card with a chart open asks first, and Keep editing keeps it", async ({ page }) => {
  await generateSmallPattern(page);
  const before = await page.getByTestId("chart-frame").getAttribute("data-cell-size");

  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();

  const dialog = page.getByRole("dialog", { name: "Start a new chart?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("replaces");
  await expect(dialog.getByRole("button", { name: "Export the editable .json first" })).toBeVisible();

  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Width in stitches")).toHaveCount(0); // the empty-grid panel never opened

  await page.getByRole("button", { name: /^Back to / }).click();
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-cell-size", before!);
});

test("Start new chart discards the chart and its autosave, and the discard survives a reload", async ({ page }) => {
  await generateSmallPattern(page);
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });

  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByRole("dialog", { name: "Start a new chart?" }).getByRole("button", { name: "Start new chart" }).click();

  await page.getByLabel("Width in stitches").fill("20");
  await page.getByLabel("Height in stitches").fill("15");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(/20 × 15, 0 stitches, 0 colors/)).toBeVisible();

  // The old chart is gone from the autosave, not merely off screen.
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByText(/20 × 15, 0 stitches, 0 colors/)).toBeVisible({ timeout: 15_000 });
});

test("with no chart open, a card acts at once — there is nothing to replace", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await expect(page.getByRole("dialog", { name: "Start a new chart?" })).toHaveCount(0);
  await expect(page.getByLabel("Width in stitches")).toBeVisible();
});
