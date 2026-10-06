import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { openSmallChart } from "./helpers/app";
import { expectView, setVisibility, showOverPhoto, viewControls } from "./helpers/view";

/**
 * G-110 M3: the view as switches (D315). A pattern mode, Symbols, Photo and the pattern's visibility over the photo, each
 * offered only where it acts; editing stops below 5 % with a note saying why (D316); a reload keeps the view and every
 * other new chart resets it (D317). The keys are covered in keyboard-shortcuts.spec.ts.
 */

const undo = (page: Page) => page.getByRole("button", { name: "Undo", exact: true });

/**
 * Paints one stitch with the brush, which the test has set to Empty: a change on any cell of the sample chart, so Undo
 * says whether the chart took it. Empty is chosen once, since a second click on the chosen row lifts it again.
 */
async function paintOneStitch(page: Page) {
  await page.getByTestId("chart-frame").click({ position: { x: 20, y: 20 } });
}

test("each switch is offered only where it acts, and the slider is disabled, not hidden, without the photo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openSmallChart(page);
  const controls = viewControls(page);

  // Color: Symbols and Photo both act; the slider is there, disabled, until the photo is on.
  await expect(controls.symbols).toBeEnabled();
  await expect(controls.photo).toBeEnabled();
  await expect(controls.visibility).toBeDisabled();

  await controls.photo.click();
  await expect(controls.visibility).toBeVisible();
  await expect(controls.visibility).toHaveValue("100");
  await setVisibility(page, 40);
  await expectView(page, { pattern: "color", photo: true, visibility: 40 });
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("aria-label", "Pattern, Color, 40% over the photo");

  // Stitched draws its own cloth: Symbols, Photo and the slider set aside, and the choice remembered.
  await controls.mode("Stitched").click();
  await expectView(page, { pattern: "realistic", symbols: false, photo: false, visibility: 100 });
  await expect(controls.symbols).toBeDisabled();
  await expect(controls.photo).toBeDisabled();
  await expect(controls.visibility).toBeDisabled();

  // Back in a flat mode the photo comes back at the visibility left on it.
  await controls.mode("B&W").click();
  await expectView(page, { pattern: "bw", symbols: true, photo: true, visibility: 40 });
  await expect(controls.visibility).toHaveValue("40");

  await controls.symbols.click();
  await expectView(page, { symbols: false });
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("aria-label", "Pattern, Black & white, no symbols, 40% over the photo");
  expect(errors).toEqual([]);
});

test("over the photo the chart is edited as in Color, not below 5 %, and only Stitched shows a note", async ({ page }) => {
  await openSmallChart(page);
  const controls = viewControls(page);
  await page.getByRole("tabpanel", { name: "Threads" }).getByText("Empty (no stitch)").click();

  await showOverPhoto(page, 3);
  await expect(controls.note, "a faint pattern has no note (Owner)").toHaveCount(0);
  await paintOneStitch(page);
  await expect(undo(page), "a click on a pattern too faint to see changes nothing").toBeDisabled();

  await setVisibility(page, 5);
  await expect(controls.note).toHaveCount(0);
  await paintOneStitch(page);
  await expect(undo(page)).toBeEnabled();

  await controls.mode("Stitched").click();
  await expect(controls.note).toHaveText("Stitched is for looking: edit in Color or B&W.");
});

test("a reload keeps the view; opening another chart resets it to Color", async ({ page }) => {
  await openSmallChart(page);
  const controls = viewControls(page);
  await controls.mode("B&W").click();
  await controls.symbols.click();
  await showOverPhoto(page, 30);
  const chosen = { pattern: "bw", symbols: false, photo: true, visibility: 30 } as const;
  await expectView(page, chosen);
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });

  await page.reload();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await expectView(page, chosen);
  await expect(controls.visibility).toHaveValue("30");

  await page.getByLabel("Open pattern file").setInputFiles(path.join(__dirname, "fixtures", "sample.oxs"));
  await expect(page.getByText(/^6 × 4, /)).toBeVisible();
  await expectView(page, { pattern: "color", symbols: true, photo: false, visibility: 100 });
});

test("the view keys act while the visibility slider has the focus, and typing in a field still takes them", async ({ page }) => {
  await openSmallChart(page);
  const controls = viewControls(page);
  await showOverPhoto(page, 40);
  await controls.visibility.focus();
  await page.keyboard.press("5");
  await expectView(page, { photo: true, visibility: 0 });
  await page.keyboard.press("y");
  await expectView(page, { symbols: false });

  // A text field keeps its characters.
  await page.getByRole("tab", { name: "Chart" }).click();
  const name = page.getByLabel("Pattern name");
  await name.fill("");
  await name.pressSequentially("p4");
  await expect(name).toHaveValue("p4");
  await expectView(page, { photo: true, visibility: 0 });
});
