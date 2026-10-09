import { test, expect } from "@playwright/test";
import { pickTool } from "./helpers/app";
import { EMPTY, at, blankChart, click } from "./helpers/blank-chart";
import { clearSiteFeatures, setSiteFeatures } from "./helpers/features";
import {
  chooseLayer,
  dragLayer,
  expectLayers,
  layerButton,
  layerRow,
  layersPane,
  layersTab,
  savedLayers,
  showLayers,
} from "./helpers/layers";

/**
 * G-130 M2: the Layers tab. Adding, deleting, hiding, renaming, moving and merging layers, each one undo step and choosing
 * the active layer none; the last layer kept; a drag let go on a row's merge box merging, anywhere else moving; the editable
 * save keeping every layer with its name, order and visibility; and the tab under its `edit.layers` feature.
 */

const THREAD = 0;

test("layers are added above the active one, drawn on, hidden and renamed, and the save keeps them all", async ({ page }) => {
  await blankChart(page);
  await pickTool(page, "Brush");
  await click(page, 0, 0);
  await showLayers(page);
  await expectLayers(page, ["Layer 1"], "Layer 1");

  await layerButton(page, "Add layer").click();
  await expectLayers(page, ["Layer 2", "Layer 1"], "Layer 2");
  await click(page, 1, 0);

  await layerRow(page, "Layer 2").getByRole("button", { name: "Hide Layer 2" }).click();
  await expect(layerRow(page, "Layer 2").getByRole("button", { name: "Show Layer 2" })).toHaveAttribute("aria-pressed", "false");

  await layerRow(page, "Layer 1").locator("[data-layer-name]").dblclick();
  await layersPane(page).getByLabel("Layer name").fill("Background");
  await layersPane(page).getByLabel("Layer name").press("Enter");
  await expectLayers(page, ["Layer 2", "Background"], "Background");

  const { formatVersion, layers } = await savedLayers(page);
  expect(formatVersion).toBe(8);
  expect(layers.map(({ name, visible }) => ({ name, visible }))).toEqual([
    { name: "Background", visible: true },
    { name: "Layer 2", visible: false },
  ]);
  expect([layers[0].cells[at(0, 0)], layers[0].cells[at(1, 0)]]).toEqual([THREAD, EMPTY]);
  expect([layers[1].cells[at(0, 0)], layers[1].cells[at(1, 0)]]).toEqual([EMPTY, THREAD]);
});

test("each change to the layers is one undo step, and choosing the active layer is none", async ({ page }) => {
  await blankChart(page);
  await showLayers(page);
  await layerButton(page, "Add layer").click();
  await layerRow(page, "Layer 2").getByRole("button", { name: "Hide Layer 2" }).click();
  await chooseLayer(page, "Layer 1");

  // Choosing Layer 1 was no step: the first undo shows Layer 2 again.
  await page.keyboard.press("Control+z");
  await expect(layerRow(page, "Layer 2").getByRole("button", { name: "Hide Layer 2" })).toBeVisible();
  await expectLayers(page, ["Layer 2", "Layer 1"], "Layer 1");

  // The next takes the added layer away, and the chart is never left without an active one.
  await chooseLayer(page, "Layer 2");
  await page.keyboard.press("Control+z");
  await expectLayers(page, ["Layer 1"], "Layer 1");

  // Escape leaves the name as it was, and makes no step.
  await layerRow(page, "Layer 1").locator("[data-layer-name]").dblclick();
  await layersPane(page).getByLabel("Layer name").fill("Discarded");
  await layersPane(page).getByLabel("Layer name").press("Escape");
  await expectLayers(page, ["Layer 1"], "Layer 1");

  await layerRow(page, "Layer 1").locator("[data-layer-name]").dblclick();
  await layersPane(page).getByLabel("Layer name").fill("Ground");
  await layersPane(page).getByLabel("Layer name").press("Enter");
  await expectLayers(page, ["Ground"], "Ground");
  await page.keyboard.press("Control+z");
  await expectLayers(page, ["Layer 1"], "Layer 1");
});

test("the only layer cannot be deleted, and says why; with two, the active one is deleted and the one below takes over", async ({
  page,
}) => {
  await blankChart(page);
  await showLayers(page);
  const remove = layerButton(page, "Delete layer");
  await expect(remove).toBeDisabled();
  await expect(remove).toHaveAttribute("title", "A chart always has at least one layer, so its only layer can't be deleted.");
  await expect(page.getByTestId("last-layer-note")).toBeVisible();

  await layerButton(page, "Add layer").click();
  await expect(remove).toBeEnabled();
  await expect(page.getByTestId("last-layer-note")).toHaveCount(0);
  await remove.click();
  await expectLayers(page, ["Layer 1"], "Layer 1");
  await page.keyboard.press("Control+z");
  await expectLayers(page, ["Layer 2", "Layer 1"], "Layer 1");
});

test("Move up, Move down and Merge down act on the active layer, the merge keeping the lower layer's place and name", async ({ page }) => {
  await blankChart(page);
  await pickTool(page, "Brush");
  await click(page, 0, 0);
  await showLayers(page);
  await layerButton(page, "Add layer").click();
  await layerButton(page, "Add layer").click();
  await click(page, 1, 0);
  await expectLayers(page, ["Layer 3", "Layer 2", "Layer 1"], "Layer 3");
  await expect(layerButton(page, "Move up")).toBeDisabled();

  await layerButton(page, "Move down").click();
  await expectLayers(page, ["Layer 2", "Layer 3", "Layer 1"], "Layer 3");
  await layerButton(page, "Move up").click();
  await expectLayers(page, ["Layer 3", "Layer 2", "Layer 1"], "Layer 3");
  await layerButton(page, "Move down").click();

  await layerButton(page, "Merge down").click();
  await expectLayers(page, ["Layer 2", "Layer 1"], "Layer 1");
  await expect(layerButton(page, "Merge down")).toBeDisabled();

  const { layers } = await savedLayers(page);
  expect(layers.map((layer) => layer.name)).toEqual(["Layer 1", "Layer 2"]);
  expect([layers[0].cells[at(0, 0)], layers[0].cells[at(1, 0)]]).toEqual([THREAD, THREAD]);
  expect(layers[1].cells.every((cell) => cell === EMPTY)).toBe(true);
});

test("a row let go on another row's merge box is merged into it; let go between rows, it moves there", async ({ page }) => {
  await blankChart(page);
  await showLayers(page);
  await layerButton(page, "Add layer").click();
  await layerButton(page, "Add layer").click();
  await expectLayers(page, ["Layer 3", "Layer 2", "Layer 1"], "Layer 3");

  await dragLayer(page, "Layer 3", { between: ["Layer 2", "Layer 1"] });
  await expectLayers(page, ["Layer 2", "Layer 3", "Layer 1"], "Layer 3");

  await dragLayer(page, "Layer 1", { onto: "Layer 2" });
  await expectLayers(page, ["Layer 2", "Layer 3"], "Layer 3");

  // Each drop was one step.
  await page.keyboard.press("Control+z");
  await expectLayers(page, ["Layer 2", "Layer 3", "Layer 1"], "Layer 3");
  await page.keyboard.press("Control+z");
  await expectLayers(page, ["Layer 3", "Layer 2", "Layer 1"], "Layer 3");
});

test.describe("under the edit.layers feature", () => {
  test.afterEach(() => clearSiteFeatures(["edit.layers"]));

  test("locked: the tab is greyed with the note, and the chart's layers stay for the tools @alone", async ({ page }) => {
    await setSiteFeatures({ "edit.layers": "locked" });
    await blankChart(page);
    await expect(layersTab(page)).toBeDisabled();
    await expect(layersTab(page)).toHaveAttribute("title", "Layers is not available to you.");
    await expect(layersTab(page)).toHaveAttribute("data-feature-locked", "edit.layers");
  });

  test("hidden: there is no Layers tab @alone", async ({ page }) => {
    await setSiteFeatures({ "edit.layers": "hidden" });
    await blankChart(page);
    await expect(page.getByRole("tab", { name: "Threads", exact: true })).toBeVisible();
    await expect(layersTab(page)).toHaveCount(0);
  });
});
