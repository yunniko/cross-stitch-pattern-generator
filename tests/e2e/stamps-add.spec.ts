import { test, expect, type Page } from "@playwright/test";
import { waitForAutosave } from "./helpers/app";
import { registerReader, uniqueEmail } from "./helpers/auth";
import { at, blankChart, saved, SLASH, WIDTH } from "./helpers/blank-chart";
import { setUserFeatures } from "./helpers/features";
import { selectionFinish } from "./helpers/selection";

/**
 * G-119 M4: Add stamp in the top bar. It is usable for a signed-in person with stamps and a chart open in Edit; its gallery
 * lists their stamps to search; the one chosen arrives as a piece in hand, the threads the chart lacks added to its
 * palette, and a stamp the chart cannot take says why in the gallery. Signed out, locked or hidden, it says so or is absent.
 */

const addStamp = (page: Page) => page.getByTestId("app-bar").getByRole("button", { name: "Add stamp" });
const gallery = (page: Page) => page.getByTestId("stamp-gallery");
const cards = (page: Page) => gallery(page).getByTestId("gallery-stamp");
const legendRows = (page: Page) => page.getByTestId("legend-color-row");

/** A stamp `width` stitches wide in one custom thread, "Ink", its second stitch a half one. */
function stampDocument(name: string, width: number): string {
  return JSON.stringify({
    formatVersion: 7,
    width,
    height: 1,
    isLandscape: true,
    cellPalette: new Array(width).fill(0),
    cellKind: [0, SLASH, ...new Array(width - 2).fill(0)],
    palette: [{ rgb: [16, 32, 48], symbol: "A", name: "Ink" }],
    name,
  });
}

/** Keeps a stamp with the signed-in account, through the page's own session. */
async function keepStamp(page: Page, name: string, width = 2) {
  const origin = new URL(page.url()).origin;
  const response = await page.request.post("/api/stamps", {
    data: stampDocument(name, width),
    headers: { origin, "content-type": "application/json" },
  });
  expect(response.status()).toBe(201);
}

test("a stamp chosen in the gallery arrives as a piece in hand, its thread added to the chart", async ({ page }) => {
  await registerReader(page, uniqueEmail("stamp-placer"));
  await keepStamp(page, "Ink pair");
  await keepStamp(page, "Long border", WIDTH + 1);
  await blankChart(page);
  await expect(addStamp(page)).toBeEnabled();
  await addStamp(page).click();
  await expect(gallery(page)).toBeVisible();
  await expect(gallery(page).getByTestId("stamp-gallery-count")).toHaveText("2 stamps");
  await expect(cards(page).getByTestId("stamp-name")).toHaveText(["Long border", "Ink pair"]);
  await expect(cards(page).filter({ hasText: "Ink pair" }).getByTestId("stamp-facts")).toHaveText("2 × 1 · 1 thread");

  // Searched by name.
  await gallery(page).getByRole("searchbox", { name: "Search stamps" }).fill("ink");
  await expect(cards(page).getByTestId("stamp-name")).toHaveText(["Ink pair"]);
  await gallery(page).getByRole("searchbox", { name: "Search stamps" }).fill("");

  // One wider than the chart is refused here, and the gallery stays to choose another.
  await cards(page).filter({ hasText: "Long border" }).click();
  await expect(gallery(page).getByTestId("stamp-gallery-error")).toHaveText(
    `The stamp is ${WIDTH + 1} × 1 stitches, larger than this chart (${WIDTH} × 20), so it was not placed.`
  );
  await expect(gallery(page)).toBeVisible();

  // Chosen: the gallery closes, the piece is in hand, and the chart has the stamp's thread beside its own.
  await cards(page).filter({ hasText: "Ink pair" }).click();
  await expect(gallery(page)).toBeHidden();
  await expect(selectionFinish(page, "Apply here")).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(selectionFinish(page, "Apply here")).toBeDisabled();

  // Placed three stitches in from the corner in view, in the added thread, its half stitch kept.
  const { cells, kinds } = await saved(page);
  await page.getByRole("tab", { name: "Threads" }).click();
  await expect(legendRows(page)).toHaveCount(2);
  await expect(legendRows(page).nth(1)).toContainText("Ink");
  await page.getByRole("tab", { name: "Chart" }).click();
  expect([cells[at(3, 3)], cells[at(4, 3)], cells[at(5, 3)]]).toEqual([1, 1, 255]);
  expect(kinds[at(4, 3)]).toBe(SLASH);

  // Escape closes the gallery and places nothing.
  await addStamp(page).click();
  await expect(cards(page)).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(gallery(page)).toBeHidden();
  await expect(selectionFinish(page, "Apply here")).toBeDisabled();
});

test("signed out, Add stamp is greyed and says to sign in", async ({ page }) => {
  await blankChart(page);
  await expect(addStamp(page)).toBeDisabled();
  await expect(addStamp(page)).toHaveAttribute("title", "Sign in to place the stamps kept with your account");
});

test("with no stamps Add stamp says how to make one; locked it is greyed and says so; hidden, it is not there", async ({ page }) => {
  const email = uniqueEmail("stamps-add-locked");
  await registerReader(page, email);
  await blankChart(page);
  await expect(addStamp(page)).toBeDisabled();
  await expect(addStamp(page)).toHaveAttribute("title", "No stamps yet: select a piece, then choose Save as stamp in the Selection tab");
  await waitForAutosave(page);

  await setUserFeatures(email, { "stamps.account": "locked" });
  await page.reload();
  await expect(addStamp(page)).toHaveAttribute("data-feature-locked", "stamps.account");
  await expect(addStamp(page)).toBeDisabled();
  await expect(addStamp(page)).toHaveAttribute("title", "Add stamp is not available to you.");

  await setUserFeatures(email, { "stamps.account": "hidden" });
  await page.reload();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await expect(addStamp(page)).toHaveCount(0);
});
