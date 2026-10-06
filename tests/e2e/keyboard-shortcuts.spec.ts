import { test, expect } from "@playwright/test";
import { openSmallChart } from "./helpers/app";
import { expectView, viewControls } from "./helpers/view";

test("Ctrl+Z/Ctrl+Y undo and redo a merge, matching the Undo/Redo buttons", async ({ page }) => {
  await openSmallChart(page);
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
  await openSmallChart(page);
  const brushButton = page.getByRole("button", { name: "Brush" });
  const fillButton = page.getByRole("button", { name: "Fill", exact: true });

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

test("L, R and O take the three shape tools, and typing them does not (G-064)", async ({ page }) => {
  await openSmallChart(page);
  const tool = (name: string) => page.getByRole("button", { name, exact: true });

  for (const [key, name] of [
    ["l", "Line"],
    ["r", "Rectangle"],
    ["o", "Oval"],
  ] as const) {
    await page.keyboard.press(key);
    await expect(tool(name), key).toHaveAttribute("aria-pressed", "true");
  }

  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByLabel("Pattern name").fill("lower orbit");
  await expect(tool("Oval"), "typing a name is not a shortcut").toHaveAttribute("aria-pressed", "true");
});

test("holding Space temporarily switches to Pan and releasing restores the previous tool", async ({ page }) => {
  await openSmallChart(page);
  const fillButton = page.getByRole("button", { name: "Fill", exact: true });
  const panButton = page.getByRole("button", { name: "Pan" });

  await page.keyboard.press("f");
  await expect(fillButton).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.down("Space");
  await expect(panButton).toHaveAttribute("aria-pressed", "true");
  await expect(fillButton).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.up("Space");
  await expect(fillButton).toHaveAttribute("aria-pressed", "true");
});

test("1-3 pick the pattern mode, Y and P switch Symbols and Photo, 4 and 5 put the pattern over the photo (G-110)", async ({ page }) => {
  await openSmallChart(page);
  const controls = viewControls(page);
  await expectView(page, { pattern: "color", symbols: true, photo: false, visibility: 100 });

  await page.keyboard.press("2");
  await expectView(page, { pattern: "bw" });
  await expect(controls.mode("B&W")).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("y");
  await expectView(page, { pattern: "bw", symbols: false });
  await expect(controls.symbols).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("y");
  await expectView(page, { symbols: true });

  await page.keyboard.press("p");
  await expectView(page, { pattern: "bw", photo: true, visibility: 100 });
  await expect(controls.photo).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("p");
  await expectView(page, { photo: false });

  // Stitched draws neither symbols nor the photo, and 4 and 5 leave it for Color.
  await page.keyboard.press("3");
  await expectView(page, { pattern: "realistic", symbols: false, photo: false });
  await page.keyboard.press("4");
  await expectView(page, { pattern: "color", photo: true, visibility: 50 });
  await page.keyboard.press("5");
  await expectView(page, { pattern: "color", photo: true, visibility: 0 });

  // A pattern key leaves the photo as it is.
  await page.keyboard.press("2");
  await expectView(page, { pattern: "bw", photo: true, visibility: 0 });
  await page.keyboard.press("1");
  await expectView(page, { pattern: "color", photo: true });
});

test("dragging a color onto Empty merges it away: its stitches become empty and it's removed from the palette", async ({ page }) => {
  await openSmallChart(page);
  const legendRows = page.locator('[data-testid="legend-color-row"]');
  const initialCount = await legendRows.count();
  const emptyRow = page.getByTitle(/Drag a color here to merge it into empty/);

  await legendRows.nth(0).dragTo(emptyRow);
  await expect(legendRows).toHaveCount(initialCount - 1);
});
