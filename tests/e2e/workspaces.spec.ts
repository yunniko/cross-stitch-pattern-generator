import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { FIXTURE, expectPhotoLoaded, generateAndWait, openSmallChart, pickTool, saveButton, showWorkspace } from "./helpers/app";

/**
 * G-095 M3, D297: the three workspaces, and what belongs to none of them. Photo makes the chart, Edit changes it, Export
 * gets it out; the bar above, the view controls and the readout are there in all three and with every tool in hand.
 */

const workspace = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const tool = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const toolNames = (page: Page) =>
  page
    .getByTestId("tool-rail")
    .locator("button[aria-pressed]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
const frame = (page: Page) => page.getByTestId("chart-frame");

async function savedCells(page: Page): Promise<number[]> {
  const [download] = await Promise.all([page.waitForEvent("download"), saveButton(page).click()]);
  return (JSON.parse(await readFile((await download.path())!, "utf8")) as { cellPalette: number[] }).cellPalette;
}

/** A press in the middle of the chart, which paints with the Brush and a thread in hand. */
async function pressChart(page: Page) {
  const box = (await frame(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test("an opened chart arrives in Edit; Photo and Export offer only the tools that move the view", async ({ page }) => {
  await openSmallChart(page);
  await expect(workspace(page, "Edit")).toHaveAttribute("aria-selected", "true");
  expect(await toolNames(page)).toContain("Brush");
  await expect(tool(page, "Mirror left half")).toBeVisible();

  for (const name of ["Photo", "Export"]) {
    await showWorkspace(page, name as "Photo" | "Export");
    await expect(workspace(page, name)).toHaveAttribute("aria-selected", "true");
    expect(await toolNames(page), name).toEqual(["Pan", "Zoom"]);
    await expect(tool(page, "Mirror left half"), `${name} offers the quick mirrors`).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Threads" }), `${name} shows Edit's tabs`).toHaveCount(0);
  }
});

test("only Edit changes the chart: a press, a tool's key and a mirror do nothing in Photo or Export", async ({ page }) => {
  await openSmallChart(page);
  await page.getByTestId("legend-color-row").first().click();
  const before = await savedCells(page);

  for (const name of ["Photo", "Export"] as const) {
    await showWorkspace(page, name);
    await pressChart(page);
    // B is the Brush's key; here it picks nothing up, and Pan stays in hand.
    await page.keyboard.press("b");
    await expect(tool(page, "Pan")).toHaveAttribute("aria-pressed", "true");
    await pressChart(page);
    expect(await savedCells(page), `the chart after presses in ${name}`).toEqual(before);
  }

  // Back in Edit the Brush is in hand as it was left, and the same press paints.
  await showWorkspace(page, "Edit");
  await expect(tool(page, "Brush")).toHaveAttribute("aria-pressed", "true");
  await pressChart(page);
  expect(await savedCells(page)).not.toEqual(before);
});

test("each workspace keeps its own tool in hand, and a piece in hand in Edit is still in hand on return", async ({ page }) => {
  await openSmallChart(page);
  await pickTool(page, "Select");
  const box = (await frame(page).boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 100, { steps: 4 });
  await page.mouse.up();
  await expect(tool(page, "Apply here")).toBeEnabled();

  await showWorkspace(page, "Export");
  await pickTool(page, "Zoom");
  await showWorkspace(page, "Photo");
  await expect(tool(page, "Pan"), "Photo has its own tool in hand").toHaveAttribute("aria-pressed", "true");
  await showWorkspace(page, "Export");
  await expect(tool(page, "Zoom"), "Export kept the tool picked there").toHaveAttribute("aria-pressed", "true");

  // Looking at the other two applied nothing: the piece is in hand, and Undo still waits for it.
  await showWorkspace(page, "Edit");
  await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
  await expect(tool(page, "Apply here")).toBeEnabled();
  await expect(tool(page, "Undo")).toBeDisabled();
});

test("Undo, the views and the zoom stay put whatever tool is in hand, and there is one of each", async ({ page }) => {
  await openSmallChart(page);
  const views = page.getByTestId("view-controls");
  for (const name of ["Brush", "Select", "Lasso", "BS edit", "Crop", "Text", "Move", "Pan"]) {
    await pickTool(page, name);
    await expect(page.getByRole("button", { name: "Undo", exact: true }), `Undo with ${name}`).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Redo", exact: true }), `Redo with ${name}`).toHaveCount(1);
    for (const control of ["Color", "B&W", "Stitched", "Zoom in", "Zoom out", "Isolate lit threads"]) {
      await expect(views.getByRole("button", { name: control, exact: true }), `${control} with ${name}`).toBeVisible();
    }
  }
  // And in the other two workspaces.
  for (const name of ["Photo", "Export"] as const) {
    await showWorkspace(page, name);
    await expect(views.getByRole("button", { name: "Stitched", exact: true }), `the views in ${name}`).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo", exact: true }), `Undo in ${name}`).toHaveCount(1);
  }
  await views.getByRole("button", { name: "Stitched", exact: true }).click();
  await expect(frame(page)).toHaveAttribute("data-view-mode", "realistic");
});

test("a shared drawing option is shown with the tools that read it, and with no other", async ({ page }) => {
  await openSmallChart(page);
  const bar = page.getByTestId("quick-bar");
  const colours = bar.getByRole("group", { name: "Drawing colours" });
  const symmetry = bar.getByRole("group", { name: /^Symmetry/ });
  const lock = bar.getByRole("button", { name: "Lock transparency" });
  const shown = async () => [(await colours.count()) > 0, (await symmetry.count()) > 0, (await lock.count()) > 0];

  // [the two colours, symmetry, the transparency lock]
  const expected: Record<string, boolean[]> = {
    Brush: [true, true, true],
    Fill: [true, true, true],
    Rectangle: [true, true, true],
    Backstitch: [true, true, false],
    "BS edit": [true, true, false],
    Select: [true, false, true],
    Lasso: [true, false, true],
    Text: [false, false, false],
    Crop: [false, false, false],
    Move: [false, false, false],
    Pan: [false, false, false],
    Zoom: [false, false, false],
  };
  for (const [name, options] of Object.entries(expected)) {
    await pickTool(page, name);
    await expect(page.getByTestId("tool-in-hand")).toHaveText(name === "BS edit" ? "BS edit" : name);
    expect(await shown(), name).toEqual(options);
  }
});

test("a tool's own controls add to the bar of options: with Select, Crop and BS edit the colours and the lock are still there", async ({
  page,
}) => {
  await openSmallChart(page);
  const bar = page.getByTestId("quick-bar");
  await pickTool(page, "Select");
  await expect(bar.getByTestId("selection-bar")).toBeVisible();
  await expect(bar.getByRole("button", { name: "Lock transparency" })).toBeVisible();
  await pickTool(page, "BS edit");
  await expect(bar.getByTestId("backstitch-bar")).toBeVisible();
  await expect(bar.getByRole("group", { name: /^Symmetry/ })).toBeVisible();
  await pickTool(page, "Crop");
  await expect(bar.getByTestId("crop-bar")).toBeVisible();
  // The crop frame stays behind a tool that only moves the view, as it always has.
  await pickTool(page, "Pan");
  await expect(bar.getByTestId("crop-bar")).toBeVisible();
});

test("a generated chart stays in Photo, where another try is one press away, and is taken on to Edit when asked", async ({ page }) => {
  await page.goto("/");
  await expect(workspace(page, "Photo")).toHaveAttribute("aria-selected", "true");
  await expect(workspace(page, "Edit")).toBeDisabled();
  await expect(workspace(page, "Export")).toBeDisabled();

  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);
  await page.getByRole("radio", { name: /Small/ }).check();
  await generateAndWait(page);
  await expect(workspace(page, "Photo")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Regenerate", exact: true })).toBeEnabled();
  await expect(workspace(page, "Edit")).toBeEnabled();

  await page.getByRole("button", { name: "Continue in Edit →" }).click();
  await expect(workspace(page, "Edit")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Threads" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("legend-color-row").first()).toBeVisible();
});

test("Save is in the bar above in every workspace, and saves the editable file", async ({ page }) => {
  await openSmallChart(page);
  for (const name of ["Edit", "Photo", "Export"] as const) {
    await showWorkspace(page, name);
    const [download] = await Promise.all([page.waitForEvent("download"), saveButton(page).click()]);
    expect(download.suggestedFilename(), name).toBe("sample_editable.json");
  }
});

test("the view controls stand aside while a press is held on the chart, and come back when it is let go", async ({ page }) => {
  await openSmallChart(page);
  await page.getByTestId("legend-color-row").first().click();
  const views = page.getByTestId("view-controls");
  const box = (await frame(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(views).toHaveAttribute("data-away", "true");
  await page.mouse.up();
  await expect(views).not.toHaveAttribute("data-away", "true");
});

test("in a narrow window the bar above does not overlap itself and the view controls stay over the chart", async ({ page }) => {
  // Found by the G-095 QA pass at 900 px: "Export" lay over Undo, and the view controls ran off both sides of the chart.
  for (const width of [820, 1024, 1100]) {
    await page.setViewportSize({ width, height: 800 });
    await openSmallChart(page);
    const problems = await page.evaluate((viewport) => {
      const found: string[] = [];
      const bar = document.querySelector('[data-testid="app-bar"]')!;
      const items = [...bar.querySelectorAll('button, a, [role="tab"]')].map((el) => ({
        name: el.getAttribute("aria-label") || el.textContent!.trim(),
        box: el.getBoundingClientRect(),
      }));
      for (const item of items) if (item.box.left < 0 || item.box.right > viewport + 0.5) found.push(`${item.name} is off screen`);
      for (let a = 0; a < items.length; a++)
        for (let b = a + 1; b < items.length; b++)
          if (items[a].box.left < items[b].box.right - 1 && items[b].box.left < items[a].box.right - 1)
            found.push(`${items[a].name} overlaps ${items[b].name}`);
      const view = document.querySelector('[data-testid="view-controls"]')!.getBoundingClientRect();
      const stage = document.querySelector("main")!.getBoundingClientRect();
      if (view.left < stage.left - 0.5 || view.right > stage.right + 0.5) found.push("the view controls leave the chart's area");
      return found;
    }, width);
    expect(problems, `${width} px wide`).toEqual([]);
  }
});
