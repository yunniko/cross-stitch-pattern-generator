import { test, expect, type Page } from "@playwright/test";
import { FIXTURE, SAMPLE_CHART, openSmallChart, saveButton } from "./helpers/app";
import { clearSiteFeatures, setSiteFeatures } from "./helpers/features";

/**
 * G-103 M2: each workspace is one switch (D312), and what is under it goes with it (D313). Hidden: the tab is absent and so
 * is every control and command of the workspace. Locked: they are drawn greyed, with the note, and do nothing. A person lands
 * in the next workspace that is on; with all three off a window says so, and the chart is kept for when they are back.
 *
 * Tagged @alone: the site's rows are state every worker shares. Each case puts back the ids it set.
 */

const WORKSPACE_IDS = ["workspace.photo", "workspace.edit", "workspace.export"];

const tab = (page: Page, name: "Photo" | "Edit" | "Export") => page.getByRole("tab", { name, exact: true });
const list = (page: Page) => page.getByRole("dialog", { name: "Commands" });
const row = (page: Page, id: string) => list(page).locator(`[data-command="${id}"]`);

async function openList(page: Page) {
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Search commands" })).toBeFocused();
}

/** Opens the start screen over the chart and asks for an empty grid, which asks first what to do with the open chart. */
async function askToStartNew(page: Page) {
  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  return page.getByRole("dialog", { name: "Start a new chart?" });
}

test.afterEach(() => clearSiteFeatures(WORKSPACE_IDS));

test("Photo hidden: no tab, no photo to choose, its commands gone, no prediction asked, and an opened chart lands in Edit @alone", async ({
  page,
}) => {
  await setSiteFeatures({ "workspace.photo": "hidden" });
  const predictions: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/predictions")) predictions.push(request.url());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Start a chart." })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Choose a photo/ })).toHaveCount(0);
  await expect(tab(page, "Photo")).toHaveCount(0);

  // The saved chart has its photo inside it; with Photo off, nothing is asked of the server about it.
  await page.getByLabel("Open pattern file").setInputFiles(SAMPLE_CHART);
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(tab(page, "Edit")).toHaveAttribute("aria-selected", "true");

  await openList(page);
  for (const id of ["file.choose-photo", "generate.run", "view.workspace-photo"]) await expect(row(page, id)).toHaveCount(0);
  await expect(row(page, "chart.mirror-left-half")).toHaveCount(1);
  await page.keyboard.press("Escape");
  expect(predictions).toEqual([]);
});

test("Photo locked: the tab and the photo card are greyed with the note, and its commands say why @alone", async ({ page }) => {
  await setSiteFeatures({ "workspace.photo": "locked" });
  await page.goto("/");
  const card = page.getByRole("button", { name: /^Choose a photo/ });
  await expect(card).toBeDisabled();
  await expect(card).toHaveAttribute("data-feature-locked", "workspace.photo");
  await expect(card).toContainText("Photo is not available to you.");
  await expect(tab(page, "Photo")).toBeDisabled();
  await expect(tab(page, "Photo")).toHaveAttribute("title", "Photo is not available to you.");

  await page.getByLabel("Open pattern file").setInputFiles(SAMPLE_CHART);
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await openList(page);
  const choose = row(page, "file.choose-photo");
  await expect(choose).toHaveAttribute("aria-disabled", "true");
  await expect(choose).toContainText("Photo is not available to you.");
});

test("Edit locked: a chart lands in Photo, the edit commands and keys do nothing, and Undo stays @alone", async ({ page }) => {
  await setSiteFeatures({ "workspace.edit": "locked" });
  await openSmallChart(page);
  await expect(tab(page, "Photo")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "Edit")).toBeDisabled();
  await expect(tab(page, "Edit")).toHaveAttribute("data-feature-locked", "workspace.edit");

  const inHand = page.getByTestId("tool-in-hand");
  const before = await inHand.textContent();
  await page.keyboard.press("b");
  await expect(inHand).toHaveText(before ?? "");

  await openList(page);
  const mirror = row(page, "chart.mirror-left-half");
  await expect(mirror).toHaveAttribute("aria-disabled", "true");
  await expect(mirror).toContainText("Edit is not available to you.");
  await expect(row(page, "tool.brush")).toHaveAttribute("aria-disabled", "true");
  // Undo and Redo are not Edit's (G-103 point e): they stay, as they were.
  await expect(row(page, "edit.undo")).toHaveCount(1);
  await expect(row(page, "edit.undo")).not.toContainText("not available to you");
  await page.keyboard.press("Escape");
});

test("Edit locked: a Generate is kept as a try, and taking it into Edit is greyed with the note @alone", async ({ page }) => {
  // Generates for real, so it needs the cs-job sidecar the CI rust job builds.
  await setSiteFeatures({ "workspace.edit": "locked" });
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  const onward = page.getByRole("button", { name: "Continue in Edit →" });
  await expect(onward).toBeDisabled();
  await expect(onward).toHaveAttribute("data-feature-locked", "workspace.edit");
  await expect(onward).toHaveAttribute("title", "Edit is not available to you.");
});

test("Edit hidden: no tab, and its commands are gone from the list @alone", async ({ page }) => {
  await setSiteFeatures({ "workspace.edit": "hidden" });
  await openSmallChart(page);
  await expect(tab(page, "Edit")).toHaveCount(0);
  await expect(tab(page, "Photo")).toHaveAttribute("aria-selected", "true");
  await openList(page);
  for (const id of ["chart.mirror-left-half", "view.workspace-edit", "tool.brush"]) await expect(row(page, id)).toHaveCount(0);
  await expect(row(page, "edit.undo")).toHaveCount(1);
});

test("Export hidden: no tab, no Save, and starting new offers no export first @alone", async ({ page }) => {
  await setSiteFeatures({ "workspace.export": "hidden" });
  await openSmallChart(page);
  await expect(tab(page, "Export")).toHaveCount(0);
  await expect(saveButton(page)).toHaveCount(0);
  const dialog = await askToStartNew(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Export, then start new" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Start new chart" })).toBeVisible();
});

test("Export locked: the tab, Save and Export-then-start-new are greyed with the note @alone", async ({ page }) => {
  await setSiteFeatures({ "workspace.export": "locked" });
  await openSmallChart(page);
  await expect(tab(page, "Export")).toBeDisabled();
  await expect(saveButton(page)).toBeDisabled();
  await expect(saveButton(page)).toHaveAttribute("data-feature-locked", "workspace.export");
  await expect(saveButton(page)).toHaveAttribute("title", "Export is not available to you.");
  const dialog = await askToStartNew(page);
  const exportFirst = dialog.getByRole("button", { name: "Export, then start new" });
  await expect(exportFirst).toBeDisabled();
  await expect(exportFirst).toHaveAttribute("data-feature-locked", "workspace.export");
});

test("all three off: a window says so in place of the editor, and the chart open before is there again after @alone", async ({ page }) => {
  await openSmallChart(page);
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });

  await setSiteFeatures({ "workspace.photo": "hidden", "workspace.edit": "locked", "workspace.export": "locked" });
  await page.reload();
  const window = page.getByRole("alertdialog", { name: "The editor is not available right now" });
  await expect(window).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("chart-canvas")).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
  // No key reaches the editor behind the window.
  await page.keyboard.press("Control+k");
  await expect(list(page)).toHaveCount(0);

  await clearSiteFeatures(WORKSPACE_IDS);
  await page.reload();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  await expect(window).toHaveCount(0);
});
