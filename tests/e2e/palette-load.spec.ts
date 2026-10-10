import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { FIXTURE, openSmallChart, showWorkspace } from "./helpers/app";

/**
 * G-131 M3: palettes saved and loaded on the Edit page as on generation, loaded into the chart by Append or Replace, and
 * each chosen colour's name and thread typed by hand while setting up.
 */

const editButtons = (page: Page) => page.getByRole("button", { name: /^Edit / });
const block = (page: Page) => page.getByTestId("chart-palette");
const undo = (page: Page) => page.getByRole("button", { name: "Undo", exact: true });

function paletteFile(name: string, colors: unknown[]) {
  return {
    name: `${name}_palette.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "cross-stitch-palette", version: 2, name, mode: "full", colors })),
  };
}

async function openPalette(page: Page) {
  await openSmallChart(page);
  await showWorkspace(page, "Edit");
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await expect(block(page)).toBeVisible();
}

test("the Edit page saves the chart's palette with each colour's name, and Append adds only what the chart lacks, as one undo step", async ({
  page,
}) => {
  await openPalette(page);
  const before = await editButtons(page).count();
  await block(page).getByLabel("Palette name").fill("Mine");
  const [download] = await Promise.all([page.waitForEvent("download"), block(page).getByRole("button", { name: "Save palette" }).click()]);
  const saved = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(saved.version).toBe(2);
  expect(saved.colors).toHaveLength(before);
  expect(saved.colors.every((c: { name?: string }) => typeof c.name === "string" && c.name.length > 0)).toBe(true);

  // One colour the chart has (the same RGB, no thread), one it lacks, of another system and a typed number.
  await block(page)
    .getByLabel("Palette file")
    .setInputFiles(paletteFile("Two", [saved.colors[0], { rgb: [1, 2, 3], name: "Ink", system: "anchor", number: "X-403" }]));
  await expect(page.getByTestId("palette-load-choice")).toContainText("1 not in this chart");
  await page.getByTestId("palette-load-choice").getByRole("button", { name: "Append" }).click();
  await expect(editButtons(page)).toHaveCount(before + 1);
  await expect(page.getByRole("button", { name: "Edit Ink", exact: true })).toBeVisible();
  await expect(page.getByTestId("chart-palette-note")).toContainText("Added 1 colour");
  await undo(page).click();
  await expect(editButtons(page)).toHaveCount(before);

  // The palette saved a moment ago is in the list, and holds nothing the chart lacks.
  await block(page).getByLabel("Saved palettes").selectOption("Mine");
  await block(page).getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByTestId("palette-load-choice")).toContainText("all of them in this chart already");
  await expect(page.getByTestId("palette-load-choice").getByRole("button", { name: "Append" })).toBeDisabled();
});

test("Replace makes the chart use the loaded palette, every stitch mapped onto it, and one undo brings the old one back", async ({
  page,
}) => {
  await openPalette(page);
  const before = await editButtons(page).count();
  await block(page)
    .getByLabel("Palette file")
    .setInputFiles(
      paletteFile("Three", [
        { rgb: [20, 20, 20], name: "Night" },
        { rgb: [240, 240, 240], name: "Snow" },
        { rgb: [180, 40, 40], name: "Wine" },
      ])
    );
  await page.getByTestId("palette-load-choice").getByRole("button", { name: "Replace" }).click();
  await expect(editButtons(page)).toHaveCount(3);
  for (const name of ["Night", "Snow", "Wine"]) await expect(page.getByRole("button", { name: `Edit ${name}`, exact: true })).toBeVisible();
  await expect(page.getByTestId("chart-palette-note")).toContainText("The chart now uses “Three”: 3 colours.");
  await undo(page).click();
  await expect(editButtons(page)).toHaveCount(before);
});

test("a chosen colour's name and thread are typed by hand while setting up, never changing the colour, and saved with it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByRole("button", { name: /^(Generate pattern|Regenerate)$/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Set up palette" }).click();
  await page.getByLabel("Colour to add").fill("#336699");
  await page.getByRole("button", { name: "Add colour" }).click();
  await page.locator('[data-set-cell="0"]').click();
  const editor = page.getByTestId("set-color-editor");
  await editor.getByLabel("Colour name").fill("Sea");
  await editor.getByLabel("Colour name").press("Enter");
  await editor.getByLabel("Thread system").selectOption("anchor");
  await editor.getByLabel("Thread number").fill("X1");
  await editor.getByLabel("Thread number").press("Enter");
  const cell = page.getByRole("list", { name: "Chosen colours" }).getByRole("listitem").first();
  await expect(cell).toHaveAttribute("title", "Sea");
  await expect(page.locator('[data-set-cell="0"]')).toHaveCSS("background-color", "rgb(51, 102, 153)");

  await page.getByLabel("Palette name").fill("Sea");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save palette" }).click()]);
  const saved = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(saved.colors).toEqual([{ rgb: [51, 102, 153], name: "Sea", system: "anchor", number: "X1" }]);
});
