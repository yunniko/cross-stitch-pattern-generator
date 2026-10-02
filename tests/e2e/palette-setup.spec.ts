import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FIXTURE, generateSmallPattern } from "./helpers/app";

/**
 * G-087: "Set up palette" -- the user chooses the colours a chart is made from, can fill them from the picture's predicted
 * colours, save and load them, and the chart's file carries them. The count slider is held to the prediction's ceiling.
 */

async function loadPhoto(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByRole("button", { name: /^(Generate pattern|Regenerate)$/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("radio", { name: /Small/ }).check();
}

const setupSwitch = (page: Page) => page.getByRole("button", { name: "Set up palette" });

test("by default the palette is automatic, the count has a ceiling and a hint of what works best", async ({ page }) => {
  await loadPhoto(page);
  await expect(page.getByRole("button", { name: "Automatic" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("palette-setup")).toHaveCount(0);

  const hint = page.getByTestId("color-count-hint");
  await expect(hint).toContainText(/Suggested \d+/, { timeout: 15_000 });
  const ceiling = Number(((await hint.textContent()) ?? "").match(/up to (\d+)/)?.[1]);
  expect(ceiling).toBeGreaterThanOrEqual(2);
  await expect(page.getByLabel("Number of colors")).toHaveAttribute("max", String(ceiling));
});

test("set up palette: the count slider goes, predicted colours fill the set, which can be edited and makes the chart", async ({ page }) => {
  await loadPhoto(page);
  await setupSwitch(page).click();
  await expect(page.getByLabel("Number of colors")).toHaveCount(0);
  await expect(page.getByTestId("palette-set-count")).toHaveText("0");

  // Nothing chosen: Generate refuses rather than building a chart from no colours.
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByText("Add at least one colour to the palette")).toBeVisible();

  const fill = page.getByRole("button", { name: "Fill with predicted colours" });
  await expect(fill).toBeEnabled({ timeout: 15_000 });
  await fill.click();
  const filled = Number(await page.getByTestId("palette-set-count").textContent());
  expect(filled).toBeGreaterThanOrEqual(2);

  // Edit: drop one colour.
  await page
    .getByRole("list", { name: "Chosen colours" })
    .getByRole("button", { name: /^Remove/ })
    .first()
    .click();
  await expect(page.getByTestId("palette-set-count")).toHaveText(String(filled - 1));

  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(new RegExp(`stitches, ${filled - 1} colors`))).toBeVisible();
});

test("the chosen colours are kept in the browser, and a new photo starts without them", async ({ page }) => {
  await loadPhoto(page);
  await setupSwitch(page).click();
  await page.getByLabel("Colour to add").fill("#336699");
  await page.getByRole("button", { name: "Add colour" }).click();
  await expect(page.getByTestId("palette-set-count")).toHaveText("1");
  // The options are written to the browser shortly after they change, and read back after a reload (the pane itself waits for a photo).
  const stored = async () =>
    page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        const value = JSON.parse(localStorage.getItem(key) ?? "null");
        if (value && typeof value === "object" && "paletteSet" in value)
          return value as { paletteSetup: boolean; paletteSet: { colors: unknown[] } };
      }
      return null;
    });
  await expect.poll(async () => (await stored())?.paletteSet.colors.length).toBe(1);

  await page.reload();
  await expect.poll(async () => (await stored())?.paletteSet.colors.length).toBe(1);
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect.poll(async () => (await stored())?.paletteSet.colors.length).toBe(0);
});

test("in a thread brand the colours are threads, found by code", async ({ page }) => {
  await loadPhoto(page);
  await page.getByRole("button", { name: "DMC", exact: true }).click();
  await setupSwitch(page).click();
  // Every thread of the brand is shown as a swatch, as in the colour editor.
  expect(await page.getByTestId("swatch-grid").getByRole("button").count()).toBeGreaterThan(300);
  await page.getByLabel(/Search DMC threads/).fill("310");
  await page.getByRole("button", { name: /^DMC 310/ }).click();
  await expect(page.getByRole("button", { name: /^DMC 310/ })).toHaveAttribute("data-current", "true");
  // The chosen colours are bare cells; the name is the tooltip.
  const cells = page.getByRole("list", { name: "Chosen colours" }).getByRole("listitem");
  await expect(cells).toHaveCount(1);
  await expect(cells.first()).toHaveAttribute("title", /310/);
  await expect(cells.first()).not.toContainText("310");

  // Changing the palette mode empties the set: its threads mean nothing in another brand.
  await page.getByRole("button", { name: "Anchor", exact: true }).click();
  await expect(page.getByTestId("palette-set-count")).toHaveText("0");
});

test("palettes are saved by name, loaded and deleted", async ({ page }) => {
  await loadPhoto(page);
  await setupSwitch(page).click();
  await page.getByLabel("Colour to add").fill("#aa2200");
  await page.getByRole("button", { name: "Add colour" }).click();
  await page.getByLabel("Palette name").fill("Rust");
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save palette" }).click()]);
  expect(file.suggestedFilename()).toBe("Rust_palette.json");

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByTestId("palette-set-count")).toHaveText("0");
  await page.getByLabel("Saved palettes").selectOption("Rust");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByTestId("palette-set-count")).toHaveText("1");

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByLabel("Saved palettes")).toHaveCount(0);
});

test("the Export dropdown writes a palette file with the chart's colours, and it loads back as a palette", async ({ page }) => {
  await generateSmallPattern(page);
  await page.getByLabel("Export").selectOption("palette");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("sample_palette.json");
  const file = path.join(test.info().outputDir, "sample_palette.json");
  await download.saveAs(file);
  const data = JSON.parse(await readFile(file, "utf8"));
  expect(data.format).toBe("cross-stitch-palette");
  expect(data.mode).toBe("full");
  expect(data.colors.length).toBeGreaterThanOrEqual(2);

  await page.getByRole("tab", { name: "Photo" }).click();
  await setupSwitch(page).click();
  await page.getByLabel("Palette file").setInputFiles(file);
  await expect(page.getByTestId("palette-set-count")).toHaveText(String(data.colors.length));

  // A file that is not a palette says so and changes nothing.
  await page.getByLabel("Palette file").setInputFiles({ name: "other.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.getByTestId("palette-note")).toContainText("not a palette file");
  await expect(page.getByTestId("palette-set-count")).toHaveText(String(data.colors.length));
});

test("the editable file carries the set and restores it; a file without one resets it; a new photo resets sliders and set", async ({
  page,
}) => {
  await loadPhoto(page);
  await setupSwitch(page).click();
  await page.getByLabel("Colour to add").fill("#112233");
  await page.getByRole("button", { name: "Add colour" }).click();
  await page.getByLabel("Colour to add").fill("#ddeeff");
  await page.getByRole("button", { name: "Add colour" }).click();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const file = path.join(test.info().outputDir, "sample_editable.json");
  await download.saveAs(file);
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect(saved.generationPalette.colors).toHaveLength(2);
  expect(saved.generationPalette.active).toBe(true);

  // The chart's colours are the chart's own: clearing the set afterwards does not touch the chart.
  await page.getByRole("tab", { name: "Photo" }).click();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText(/stitches, 2 colors/)).toBeVisible();

  await page.getByLabel("Open pattern file").setInputFiles(file);
  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(page.getByTestId("palette-set-count")).toHaveText("2");

  // A file with no set is a new chart: the set is reset and the mode is automatic.
  delete saved.generationPalette;
  const without = path.join(test.info().outputDir, "sample_without_set.json");
  await writeFile(without, JSON.stringify(saved));
  await page.getByLabel("Open pattern file").setInputFiles(without);
  await page.getByRole("tab", { name: "Photo" }).click();
  await expect(setupSwitch(page)).toHaveAttribute("aria-pressed", "false");

  // A new photo starts neutral sliders and no set.
  await loadPhoto(page);
  await setupSwitch(page).click();
  await page.getByLabel("Colour to add").fill("#445566");
  await page.getByRole("button", { name: "Add colour" }).click();
  await page.getByLabel("Brightness").fill("40");
  await expect(page.getByLabel("Brightness")).toHaveAttribute("aria-valuetext", "40");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByLabel("Brightness")).toHaveAttribute("aria-valuetext", "neutral");
  await expect(page.getByTestId("palette-setup")).toHaveCount(0);
  await expect(setupSwitch(page)).toHaveAttribute("aria-pressed", "false");
});

test("chosen colours can be rearranged by keyboard and by dragging", async ({ page }) => {
  await loadPhoto(page);
  await setupSwitch(page).click();
  for (const hex of ["#ff0000", "#00ff00", "#0000ff"]) {
    await page.getByLabel("Colour to add").fill(hex);
    await page.getByRole("button", { name: "Add colour" }).click();
  }
  const cells = page.locator("[data-set-cell]");
  const order = async () => cells.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.background));
  const red = "rgb(255, 0, 0)";
  const green = "rgb(0, 255, 0)";
  const blue = "rgb(0, 0, 255)";
  expect(await order()).toEqual([red, green, blue]);

  await cells.nth(0).focus();
  await page.keyboard.press("Alt+ArrowRight");
  expect(await order()).toEqual([green, red, blue]);

  await page
    .getByRole("list", { name: "Chosen colours" })
    .getByRole("listitem")
    .nth(2)
    .dragTo(page.getByRole("list", { name: "Chosen colours" }).getByRole("listitem").nth(0));
  expect(await order()).toEqual([blue, green, red]);
});
