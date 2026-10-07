import { test, expect, type Page } from "@playwright/test";
import { pickTool, waitForAutosave } from "./helpers/app";
import { asEndpoints, exportLines } from "./helpers/backstitch";
import { at, blankChart, click, dragStitch, EMPTY, HEIGHT, regionSwitch, saved, selectionMode, WIDTH } from "./helpers/blank-chart";
import { clickSelectionAction, selectionAction } from "./helpers/selection";

/**
 * The Magic wand (G-116 M3): a click selects the whole area of one colour it lands on, found exactly as Fill finds a region
 * (D329, D332); a click on a backstitch line selects every line of its colour. It shares the selection modes and the bar
 * with Select and Lasso, and keeps its own region switches.
 */

type Cell = readonly [number, number];

const tool = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });
async function paint(page: Page, cells: readonly Cell[]) {
  await pickTool(page, "Brush");
  for (const [x, y] of cells) await click(page, x, y);
}

/** The page point of grid corner (x, y): the blank chart is WIDTH stitches across. */
async function corner(page: Page, x: number, y: number) {
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  const cell = box.width / WIDTH;
  return { x: box.x + x * cell, y: box.y + y * cell };
}

async function backstitch(page: Page, from: Cell, to: Cell) {
  await pickTool(page, "Backstitch");
  const a = await corner(page, ...from);
  const b = await corner(page, ...to);
  await page.keyboard.down("Control");
  await page.mouse.click(a.x, a.y);
  await page.keyboard.up("Control");
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press("Escape");
}

async function stitched(page: Page): Promise<string[]> {
  const { cells } = await saved(page);
  const out: string[] = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (cells[at(x, y)] !== EMPTY) out.push(`${x},${y}`);
  return out.sort();
}

const BLOB: readonly Cell[] = [
  [2, 2],
  [3, 2],
  [3, 3],
];
const APART: Cell = [10, 10];

test.beforeEach(async ({ page }) => {
  await blankChart(page);
});

test("W takes the wand; it offers the selection modes, Invert and its own region switches, kept apart from Fill's", async ({ page }) => {
  await page.locator("body").press("w");
  await expect(tool(page, "Magic wand")).toHaveAttribute("aria-pressed", "true");
  await expect(selectionMode(page, "Select")).toHaveAttribute("aria-checked", "true");
  await expect(selectionAction(page, "Invert selection")).toBeEnabled();
  await expect(regionSwitch(page, "Diagonal neighbours", "Diagonal")).toHaveAttribute("aria-pressed", "true");
  await expect(regionSwitch(page, "Color only", "Color and type")).toHaveAttribute("aria-pressed", "true");

  await regionSwitch(page, "Diagonal neighbours", "Edges only").click();
  await regionSwitch(page, "Color only", "Color only").click();
  await pickTool(page, "Fill");
  await expect(regionSwitch(page, "Diagonal neighbours", "Diagonal"), "Fill's own switch is untouched").toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(regionSwitch(page, "Color only", "Color and type")).toHaveAttribute("aria-pressed", "true");

  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await pickTool(page, "Magic wand");
  await expect(regionSwitch(page, "Diagonal neighbours", "Edges only")).toHaveAttribute("aria-pressed", "true");
  await expect(regionSwitch(page, "Color only", "Color only")).toHaveAttribute("aria-pressed", "true");
});

for (const diagonal of ["Diagonal", "Edges only"] as const) {
  test(`the wand selects exactly the stitches Fill fills (${diagonal})`, async ({ page }) => {
    // A diagonal wall from (0, 5) to (5, 0): the empty stitches either side of it meet only at its corners.
    await paint(
      page,
      Array.from({ length: 6 }, (_, i) => [i, 5 - i] as const)
    );
    await pickTool(page, "Fill");
    await regionSwitch(page, "Diagonal neighbours", diagonal).click();
    await click(page, 1, 1);
    const filled = await stitched(page);
    expect(filled).toHaveLength(diagonal === "Diagonal" ? WIDTH * HEIGHT : 6 + 15);
    await page.locator("body").press("Control+z");

    await pickTool(page, "Magic wand");
    await regionSwitch(page, "Diagonal neighbours", diagonal).click();
    await click(page, 1, 1);
    await clickSelectionAction(page, "Fill selection");
    await page.keyboard.press("Enter");
    expect(await stitched(page)).toEqual(filled);
  });
}

test("a click selects the stitch's area, which moves as one piece; the stitches apart stay", async ({ page }) => {
  await paint(page, [...BLOB, APART]);
  await pickTool(page, "Magic wand");
  await click(page, 2, 2);
  await dragStitch(page, [3, 3], [6, 6]);
  await page.keyboard.press("Enter");
  expect(await stitched(page)).toEqual(["10,10", "5,5", "6,5", "6,6"].sort());
});

test("Select + adds a second area and Select − takes one out, under the modes Select and Lasso use", async ({ page }) => {
  await paint(page, [...BLOB, APART]);
  await pickTool(page, "Magic wand");
  await click(page, 2, 2);
  await selectionMode(page, "Select +").click();
  await click(page, ...APART);
  await selectionMode(page, "Select").click();
  await dragStitch(page, [2, 2], [22, 2]);
  await page.keyboard.press("Enter");
  expect(await stitched(page), "both areas moved").toEqual(["22,2", "23,2", "23,3", "30,10"].sort());

  // A box over both, less the wand's area: only the other moves.
  await pickTool(page, "Select");
  await dragStitch(page, [20, 0], [32, 12]);
  await selectionMode(page, "Select −").click();
  await pickTool(page, "Magic wand");
  await click(page, 30, 10);
  await selectionMode(page, "Select").click();
  await dragStitch(page, [22, 2], [22, 15]);
  await page.keyboard.press("Enter");
  expect(await stitched(page)).toEqual(["22,15", "23,15", "23,16", "30,10"].sort());
});

test("a click on a backstitch line selects every line of its colour and no stitches; the lines move together", async ({ page }) => {
  await paint(page, [[21, 4]]);
  await backstitch(page, [20, 2], [24, 2]);
  await backstitch(page, [20, 6], [24, 6]);
  await pickTool(page, "Magic wand");
  const on = await corner(page, 22, 2);
  await page.mouse.click(on.x, on.y);
  // Pressed on one of its lines, the piece moves: three stitches down.
  const below = await corner(page, 22, 5);
  await page.mouse.move(on.x, on.y);
  await page.mouse.down();
  await page.mouse.move(below.x, below.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press("Enter");
  expect(asEndpoints(await exportLines(page)).sort()).toEqual(["20,5-24,5", "20,9-24,9"]);
  expect(await stitched(page), "the stitch under the first line is not taken").toEqual(["21,4"]);
});
