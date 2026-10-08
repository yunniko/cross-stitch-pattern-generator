import { test, expect, type Page } from "@playwright/test";
import { pickTool, waitForAutosave } from "./helpers/app";
import { registerReader, uniqueEmail } from "./helpers/auth";
import { blankChart, dragStitch } from "./helpers/blank-chart";
import { setUserFeatures } from "./helpers/features";
import { panel } from "./helpers/panel";
import { clickSelectionAction, selectionAction, selectionFinish, showSelectionTab } from "./helpers/selection";

/**
 * G-119 M3: Save as stamp, in the Selection tab of Select, Lasso and the Magic wand. The piece in hand is kept with the
 * account under a name asked for first; the account's Stamps lists it with its count, to search, rename, pin and delete.
 * Signed out, or with the feature locked, the button is greyed and says why; hidden, it is not there.
 */

const dialog = (page: Page) => page.getByTestId("stamp-name-dialog");
const message = (page: Page) => page.getByTestId("stamp-message");
const cards = (page: Page) => page.getByTestId("stamp");
const stampsTab = (page: Page) => panel.accountNav(page).getByRole("link", { name: /^Stamps/ });

/** Stitches 0 to 2 of the top row laid in the chart's one thread, then taken in hand as a piece. */
async function threeStitchPiece(page: Page) {
  await pickTool(page, "Select");
  await dragStitch(page, [0, 0], [2, 0]);
  await clickSelectionAction(page, "Fill selection");
  await page.keyboard.press("Enter");
  await expect(selectionFinish(page, "Apply here")).toBeDisabled();
  await dragStitch(page, [0, 0], [2, 0]);
  await expect(selectionFinish(page, "Apply here")).toBeEnabled();
  await showSelectionTab(page);
}

test("the piece in hand is saved as a named stamp, listed in the account to search, rename, pin and delete", async ({ page }) => {
  await registerReader(page, uniqueEmail("stamp-saver"));
  await blankChart(page);
  await threeStitchPiece(page);

  // Escape closes the name's dialog and nothing else: the piece is still in hand, and nothing was kept.
  await clickSelectionAction(page, "Save as stamp");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText("3 × 1 · 1 thread");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(selectionFinish(page, "Apply here")).toBeEnabled();

  // Named and saved with Enter; the piece stays in hand.
  await clickSelectionAction(page, "Save as stamp");
  await dialog(page).getByRole("textbox", { name: "Name" }).fill("  Rose   row ");
  await page.keyboard.press("Enter");
  await expect(message(page)).toHaveText("Saved “Rose row” to your stamps.");
  await expect(message(page)).toHaveAttribute("data-tone", "info");
  await expect(selectionFinish(page, "Apply here")).toBeEnabled();

  // A second, unnamed: kept as an untitled stamp.
  await clickSelectionAction(page, "Save as stamp");
  await dialog(page).getByRole("button", { name: "Save stamp" }).click();
  await expect(message(page)).toHaveText("Saved “Untitled stamp” to your stamps.");

  await page.goto("/account/stamps");
  await expect(stampsTab(page)).toHaveText("Stamps2");
  await expect(page.getByTestId("stamp-count")).toHaveText("2 stamps · up to 100");
  await expect(cards(page).getByTestId("stamp-name")).toHaveText(["Untitled stamp", "Rose row"]);
  const rose = cards(page).filter({ hasText: "Rose row" });
  await expect(rose.getByTestId("stamp-facts")).toHaveText("3 × 1 · 1 thread");
  // The preview is the server's, one pixel a stitch.
  await expect
    .poll(() => rose.getByTestId("stamp-preview").evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
    .toEqual([3, 1]);

  // Searched by name.
  await page.getByRole("searchbox", { name: "Search stamps" }).fill("rose");
  await expect(cards(page).getByTestId("stamp-name")).toHaveText(["Rose row"]);
  await page.getByRole("searchbox", { name: "Search stamps" }).fill("tulip");
  await expect(page.getByTestId("stamps-none-found")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search stamps" }).fill("");

  // Pinned: kept first.
  await rose.getByRole("button", { name: "Pin" }).click();
  await expect(cards(page).getByTestId("stamp-name")).toHaveText(["Rose row", "Untitled stamp"]);
  await expect(cards(page).first()).toHaveAttribute("data-pinned", "true");

  // Renamed in place. While its name is being edited the card no longer shows "Rose row", so it is found by place: pinned, first.
  const pinned = cards(page).first();
  await pinned.getByRole("button", { name: "Rename" }).click();
  await pinned.getByRole("textbox", { name: "Stamp name" }).fill("Rose border");
  await pinned.getByRole("button", { name: "Save name" }).click();
  await expect(cards(page).getByTestId("stamp-name")).toHaveText(["Rose border", "Untitled stamp"]);

  // Deleted, after asking; Keep it keeps it.
  const untitled = cards(page).filter({ hasText: "Untitled stamp" });
  await untitled.getByRole("button", { name: "Delete…" }).click();
  await untitled.getByRole("button", { name: "Keep it" }).click();
  await expect(cards(page)).toHaveCount(2);
  await untitled.getByRole("button", { name: "Delete…" }).click();
  await untitled.getByRole("button", { name: "Delete stamp" }).click();
  await expect(cards(page).getByTestId("stamp-name")).toHaveText(["Rose border"]);
  await expect(stampsTab(page)).toHaveText("Stamps1");
});

test("signed out, Save as stamp is greyed, and the tab says to sign in", async ({ page }) => {
  await blankChart(page);
  await threeStitchPiece(page);
  await expect(selectionAction(page, "Save as stamp")).toBeDisabled();
  await expect(selectionAction(page, "Save as stamp")).toHaveAttribute("title", "Sign in to keep stamps with your account");
  await expect(page.getByTestId("stamp-sign-in-note").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
});

test("with stamps locked the button is greyed and says so; hidden, it is not there", async ({ page }) => {
  const email = uniqueEmail("stamps-locked");
  await registerReader(page, email);
  await setUserFeatures(email, { "stamps.account": "locked" });
  await blankChart(page);
  await threeStitchPiece(page);
  const button = selectionAction(page, "Save as stamp");
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("data-feature-locked", "stamps.account");
  await expect(button).toHaveAttribute("title", "Save the piece as a stamp is not available to you.");
  await expect(page.getByTestId("stamp-sign-in-note")).toHaveCount(0);

  await waitForAutosave(page);
  await setUserFeatures(email, { "stamps.account": "hidden" });
  await page.reload();
  await pickTool(page, "Select");
  await showSelectionTab(page);
  await expect(page.getByTestId("selection-panel").getByRole("region", { name: "Stamps" })).toHaveCount(0);
  await expect(selectionAction(page, "Save as stamp")).toHaveCount(0);
});
