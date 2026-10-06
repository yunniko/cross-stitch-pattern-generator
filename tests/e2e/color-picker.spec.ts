import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { openSmallChart, pickTool, saveButton } from "./helpers/app";
import { chartBox, drawChain, pickThread, threadName } from "./helpers/backstitch";
import { clearSiteFeatures, setSiteFeatures } from "./helpers/features";

/**
 * G-104 M2: the colour picker. A press takes the colour under the pointer into the square that button paints with: a
 * stitch's, a backstitch line's with the pointer on the line, the empty stitch from an empty cell. Reached as a tool (I)
 * and by holding Alt with a drawing tool, which is given back when Alt comes up (D318, D319).
 */

const DRAWING_TOOLS = ["Brush", "Fill", "Line", "Rectangle", "Oval", "Lasso fill"];

const inHand = (page: Page) => page.getByTestId("tool-in-hand");

/** The thread a square holds, by name. */
async function heldBy(page: Page, role: "Foreground" | "Background"): Promise<string> {
  const label = await page.getByRole("button", { name: new RegExp(`^${role} colour: `) }).getAttribute("aria-label");
  return label!.replace(`${role} colour: `, "");
}

/** The middle of a cell, on screen. */
async function atCell(page: Page, cx: number, cy: number): Promise<{ x: number; y: number }> {
  const { x, y, cell } = await chartBox(page);
  return { x: x + cell * (cx + 0.5), y: y + cell * (cy + 0.5) };
}

async function clickCell(page: Page, cx: number, cy: number, button: "left" | "right" = "left"): Promise<void> {
  const at = await atCell(page, cx, cy);
  await page.mouse.click(at.x, at.y, { button });
}

/** Paints one cell with the brush in the nth thread, so the spec knows what is there. */
async function paintCell(page: Page, nth: number, cx: number, cy: number): Promise<void> {
  await pickTool(page, "Brush");
  await pickThread(page, nth);
  await clickCell(page, cx, cy);
}

/** The thread a cell holds, read from the saved chart: the only place cells and names can be read together. */
async function savedThreadAt(page: Page, cx: number, cy: number): Promise<string> {
  await page.getByRole("tab", { name: "Threads" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), saveButton(page).click()]);
  const chart = JSON.parse(await readFile((await download.path())!, "utf8"));
  await page.getByRole("tab", { name: "Chart" }).click();
  return chart.palette[chart.cellPalette[cy * chart.width + cx]].name;
}

test("the picker takes a stitch into the left button's square, and an empty cell's eraser into the right's", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openSmallChart(page);
  const first = await threadName(page, 0);
  const third = await threadName(page, 2);
  await paintCell(page, 0, 3, 3);
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.getByRole("tabpanel", { name: "Threads" }).getByText("Empty (no stitch)").click();
  await page.getByRole("tab", { name: "Chart" }).click();
  await clickCell(page, 6, 3);
  await pickThread(page, 2);
  expect(await heldBy(page, "Foreground")).toBe(third);

  await page.keyboard.press("i");
  await expect(inHand(page)).toHaveText("Color picker");
  await expect(page.getByTestId("chart-frame")).toHaveClass(/cursor-pick/);

  await clickCell(page, 3, 3);
  expect(await heldBy(page, "Foreground")).toBe(first);
  await clickCell(page, 6, 3, "right");
  expect(await heldBy(page, "Background")).toBe("Empty (no stitch)");
  expect(await heldBy(page, "Foreground"), "the right button leaves the left's square alone").toBe(first);
  await expect(inHand(page)).toHaveText("Color picker");
  expect(errors).toEqual([]);
});

test("holding Alt picks with each drawing tool in hand, paints nothing, and gives the tool back", async ({ page }) => {
  await openSmallChart(page);
  const first = await threadName(page, 0);
  const third = await threadName(page, 2);
  await paintCell(page, 0, 3, 3);

  for (const tool of DRAWING_TOOLS) {
    await pickTool(page, tool);
    await pickThread(page, 2);
    expect(await heldBy(page, "Foreground"), tool).toBe(third);

    await page.keyboard.down("Alt");
    await expect(inHand(page), tool).toHaveText("Color picker");
    await expect(page.getByTestId("chart-frame"), tool).toHaveClass(/cursor-pick/);
    await clickCell(page, 3, 3);
    await page.keyboard.up("Alt");

    await expect(inHand(page), tool).toHaveText(tool);
    expect(await heldBy(page, "Foreground"), tool).toBe(first);
  }
  expect(await savedThreadAt(page, 3, 3), "no tool painted under the picker").toBe(first);

  // Zoom does not lend itself: Alt with it in hand is its own zoom out.
  await pickTool(page, "Zoom");
  await page.keyboard.down("Alt");
  await expect(inHand(page)).toHaveText("Zoom");
  await page.keyboard.up("Alt");
});

test("on a backstitch line the line's thread is taken, and beside it the stitch", async ({ page }) => {
  await openSmallChart(page);
  const first = await threadName(page, 0);
  const fifth = await threadName(page, 4);
  await paintCell(page, 0, 3, 3);
  await pickThread(page, 4);
  await drawChain(page, [
    [2, 4],
    [6, 4],
  ]);
  await pickThread(page, 2);

  await pickTool(page, "Color picker");
  const { x, y, cell } = await chartBox(page);
  await page.mouse.click(x + cell * 4, y + cell * 4);
  expect(await heldBy(page, "Foreground"), "on the line").toBe(fifth);
  await clickCell(page, 3, 3);
  expect(await heldBy(page, "Foreground"), "half a stitch away from it").toBe(first);
});

test.describe("the picker switched off", () => {
  test.afterEach(() => clearSiteFeatures(["tool.picker"]));

  for (const state of ["hidden", "locked"] as const) {
    test(`${state}: neither I nor Alt picks, and Alt leaves the brush painting @alone`, async ({ page }) => {
      await setSiteFeatures({ "tool.picker": state });
      await openSmallChart(page);
      const rail = page.getByTestId("tool-rail");
      if (state === "hidden") await expect(rail.getByRole("button", { name: /^Color picker/ })).toHaveCount(0);
      else await expect(rail.getByRole("button", { name: /^Color picker/ })).toHaveAttribute("aria-disabled", "true");

      const third = await threadName(page, 2);
      await paintCell(page, 0, 3, 3);
      await pickThread(page, 2);
      await page.keyboard.press("i");
      await expect(inHand(page)).toHaveText("Brush");

      await page.keyboard.down("Alt");
      await expect(inHand(page)).toHaveText("Brush");
      await clickCell(page, 3, 3);
      await page.keyboard.up("Alt");
      expect(await heldBy(page, "Foreground")).toBe(third);
      expect(await savedThreadAt(page, 3, 3), "the brush painted").toBe(third);
    });
  }
});
