import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { FIXTURE, chooseExport, expectPhotoLoaded, openPreferences, openSmallChart, saveButton, showWorkspace } from "./helpers/app";

/**
 * G-095 M5, D299: Preferences, what is set once and then left. A new chart starts from them and every export reads
 * them; a chart keeps the fabric it was made on, so a preference never changes a chart that exists.
 */

const pressed = (group: ReturnType<Page["getByRole"]>, name: string) => group.getByRole("button", { name, exact: true });
const status = (page: Page) => page.getByTitle("Finished size on the chosen fabric count");

test("an empty grid starts at the size and on the fabric set in Preferences, in this visit and the next", async ({ page }) => {
  await page.goto("/");
  // They are in reach with no chart open.
  const preferences = await openPreferences(page);
  await preferences.getByLabel("Empty grid width in stitches").fill("60");
  await preferences.getByLabel("Empty grid height in stitches").fill("45");
  await preferences.getByLabel("Empty grid height in stitches").blur();
  await pressed(preferences.getByRole("group", { name: "Fabric count for a new chart" }), "18-count").click();
  await pressed(preferences.getByRole("group", { name: "Unit of length" }), "in").click();
  await preferences.getByRole("button", { name: "Close" }).click();
  await expect(preferences).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await expect(page.getByLabel("Width in stitches")).toHaveValue("60");
  await expect(page.getByLabel("Height in stitches")).toHaveValue("45");
  await expect(pressed(page.getByRole("group", { name: "Fabric count" }), "18-count")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(/^60 × 45, 0 stitches, 0 colors$/)).toBeVisible();
  await expect(status(page)).toContainText("18-ct");
  await expect(status(page)).toContainText(" in");
});

test("a size no chart can have is brought to the nearest that it can", async ({ page }) => {
  await page.goto("/");
  const preferences = await openPreferences(page);
  const width = preferences.getByLabel("Empty grid width in stitches");
  await width.fill("3");
  await width.blur();
  await expect(width).toHaveValue("10");
  await width.fill("99999");
  await width.blur();
  await expect(width).toHaveValue("1500");
  await width.fill("");
  await width.blur();
  await expect(width).toHaveValue("1500");
});

test("a preference never changes the chart that is open, and the chart's own fabric never changes a preference", async ({ page }) => {
  await openSmallChart(page);
  await expect(status(page)).toContainText("14-ct");

  // The preference to 18: the open chart stays on 14.
  let preferences = await openPreferences(page);
  await pressed(preferences.getByRole("group", { name: "Fabric count for a new chart" }), "18-count").click();
  await preferences.getByRole("button", { name: "Close" }).click();
  await expect(status(page)).toContainText("14-ct");
  const [download] = await Promise.all([page.waitForEvent("download"), saveButton(page).click()]);
  expect(JSON.parse(await readFile((await download.path())!, "utf8")).fabric).toEqual({ count: 14, unit: "cm" });

  // The chart to 11, in its own settings: the preference stays at 18.
  await page.getByRole("tab", { name: "Chart" }).click();
  await pressed(page.getByRole("group", { name: "Fabric count" }), "11-count").click();
  await expect(status(page)).toContainText("11-ct");
  preferences = await openPreferences(page);
  await expect(pressed(preferences.getByRole("group", { name: "Fabric count for a new chart" }), "18-count")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("a new photo starts in the palette set in Preferences, whatever the last photo was left in", async ({ page }) => {
  await page.goto("/");
  const preferences = await openPreferences(page);
  await pressed(preferences.getByRole("group", { name: "Palette for a new photo" }), "DMC").click();
  await preferences.getByRole("button", { name: "Close" }).click();

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);
  const dmc = page.getByTestId("panel").getByRole("button", { name: "DMC", exact: true });
  await expect(dmc).toHaveAttribute("aria-pressed", "true");

  // Changed for this photo, it is this photo's; the next photo starts from the preference again.
  await page.getByTestId("panel").getByRole("button", { name: "Full range", exact: true }).click();
  await expect(dmc).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);
  await expect(dmc).toHaveAttribute("aria-pressed", "true");
});

test("the author and the A4 settings are one value each, in Preferences and where the export is chosen", async ({ page }) => {
  await openSmallChart(page);
  const preferences = await openPreferences(page);
  await preferences.getByLabel("Author name").fill("Jules");
  await preferences.getByLabel("A4 cell size in millimetres").fill("4");
  await preferences.getByLabel("A4 cell size in millimetres").blur();
  await pressed(preferences.getByRole("group", { name: "A4/PDF overlap in stitches" }), "3").click();
  await preferences.getByRole("button", { name: "Close" }).click();

  await showWorkspace(page, "Export");
  await chooseExport(page, "a4-color");
  const panel = page.getByTestId("panel");
  await expect(panel.getByLabel("Author name")).toHaveValue("Jules");
  await expect(panel.getByLabel("A4 cell size in millimetres")).toHaveValue("4");
  await expect(pressed(panel.getByRole("group", { name: "A4/PDF overlap" }), "3")).toHaveAttribute("aria-pressed", "true");

  // Changed where the export is chosen, it is changed in Preferences: they are the same setting.
  await pressed(panel.getByRole("group", { name: "A4/PDF overlap" }), "10").click();
  const again = await openPreferences(page);
  await expect(pressed(again.getByRole("group", { name: "A4/PDF overlap in stitches" }), "10")).toHaveAttribute("aria-pressed", "true");
});

test("Escape closes Preferences, and no key reaches the chart behind", async ({ page }) => {
  await openSmallChart(page);
  await page.getByRole("tab", { name: "Chart" }).click();

  const preferences = await openPreferences(page);
  // "3" is the Stitched view's key and "s" the Select tool's: neither acts while the preferences are up.
  await page.keyboard.press("3");
  await page.keyboard.press("s");
  // Tab goes round inside them and never reaches the page behind (found by the G-095 QA pass).
  for (let press = 0; press < 30; press++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null)).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(preferences).toHaveCount(0);
  // The focus is back on what opened them.
  await expect(page.getByRole("button", { name: "Preferences" })).toBeFocused();
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-view-pattern", "color");
  await expect(page.getByRole("button", { name: "Brush", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("the foot of Preferences names the release this page is, the number in package.json (G-105)", async ({ page }) => {
  const { version } = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
  await page.goto("/");
  const preferences = await openPreferences(page);
  // The number, then the commit in brackets when the build was given one.
  const number = version.replaceAll(".", "\\.");
  await expect(preferences.getByTestId("app-version")).toHaveText(new RegExp(`^${number}( \\([0-9a-f]{7,}\\))?$`));
});
