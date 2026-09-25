import { test, expect, type Page } from "@playwright/test";
import { generateSmallPattern, pickTool } from "./helpers/app";
import { asEndpoints, chartBox, clickCorner, dragCorner, drawChain, exportLines, pickThread } from "./helpers/backstitch";

/**
 * G-073 M3: selecting and editing backstitch.
 *
 * Two tools share one hook and differ in a single rule — Select grabs the zone at each end of a line, Move does
 * not — so each test says which tool it drives, and the pair that pull on an endpoint are what prove the
 * difference is real rather than cosmetic.
 */

/** One line on the chart, from (4,4) to (10,4), in the first thread. */
async function oneLine(page: Page) {
  await generateSmallPattern(page);
  await pickThread(page);
  await drawChain(page, [
    [4, 4],
    [10, 4],
  ]);
}

const useSelect = (page: Page) => pickTool(page, "BS select");
const useMove = (page: Page) => pickTool(page, "BS move");

test("the bar counts what is in hand, and pressing off the line lets go", async ({ page }) => {
  await oneLine(page);
  await useSelect(page);

  await expect(page.getByText("none selected")).toBeVisible();
  await clickCorner(page, 7, 4);
  await expect(page.getByText("1 selected")).toBeVisible();

  await clickCorner(page, 20, 20);
  await expect(page.getByText("none selected")).toBeVisible();
});

test("Select drags an endpoint and leaves the other where it was", async ({ page }) => {
  await oneLine(page);
  await useSelect(page);

  // Grab the (10,4) end and put it at (10,9): the (4,4) end must not move.
  await dragCorner(page, [10, 4], [10, 9]);
  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,9"]);
});

test("Move shifts the whole line, even when the press is on an end", async ({ page }) => {
  await oneLine(page);
  await useMove(page);

  // The same press Select reads as "grab this end" moves the line bodily by (0,5).
  await dragCorner(page, [10, 4], [10, 9]);
  expect(asEndpoints(await exportLines(page))).toEqual(["4,9-10,9"]);
});

test("Select moves a line when the press is on its middle", async ({ page }) => {
  await oneLine(page);
  await useSelect(page);

  await dragCorner(page, [7, 4], [9, 7]);
  expect(asEndpoints(await exportLines(page))).toEqual(["6,7-12,7"]);
});

test("an edit is one undo step", async ({ page }) => {
  await oneLine(page);
  await useSelect(page);

  await dragCorner(page, [10, 4], [10, 9]);
  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,9"]);
  await page.keyboard.press("Control+z");
  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4"]);
});

test("Delete removes the selected line and nothing else", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);
  await drawChain(page, [
    [4, 4],
    [10, 4],
    [10, 10],
  ]);
  await useSelect(page);

  await clickCorner(page, 7, 4);
  await page.getByRole("button", { name: "Delete" }).click();
  expect(asEndpoints(await exportLines(page))).toEqual(["10,4-10,10"]);
});

test("Duplicate leaves the line and takes the copy", async ({ page }) => {
  await oneLine(page);
  await useSelect(page);

  await clickCorner(page, 7, 4);
  await page.getByRole("button", { name: "Duplicate" }).click();

  const lines = asEndpoints(await exportLines(page));
  expect(lines).toHaveLength(2);
  // The copy is dropped down and right, so it reads as a second piece rather than hiding under the first.
  expect(lines).toContain("4,4-10,4");
  expect(lines.filter((l) => l !== "4,4-10,4")).toHaveLength(1);
});

test("Copy then Paste adds a second line without touching the first", async ({ page }) => {
  await oneLine(page);
  await useSelect(page);

  await clickCorner(page, 7, 4);
  await page.getByRole("button", { name: "Copy" }).click();
  await page.getByRole("button", { name: "Paste" }).click();

  const lines = asEndpoints(await exportLines(page));
  expect(lines).toHaveLength(2);
  expect(lines).toContain("4,4-10,4");
});

test("Turn stands a horizontal line up, pivoting on the corner its bounds start at", async ({ page }) => {
  await oneLine(page);
  await useSelect(page);

  await clickCorner(page, 7, 4);
  await page.getByRole("button", { name: "Turn ↻" }).click();

  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-4,10"]);
});

test("Mirror ↔ flips the selected line about its own middle", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);
  await drawChain(page, [
    [4, 4],
    [10, 8],
  ]);
  await useSelect(page);

  await clickCorner(page, 7, 6);
  await page.getByRole("button", { name: "Mirror ↔" }).click();

  // The diagonal leans the other way, over the same cells.
  expect(asEndpoints(await exportLines(page))).toEqual(["10,4-4,8"]);
});

test("Recolour gives the line the thread in hand", async ({ page }) => {
  await oneLine(page);
  const before = (await exportLines(page))[0].paletteIndex;
  await pickThread(page, 1);
  await useSelect(page);

  await clickCorner(page, 7, 4);
  await page.getByRole("button", { name: "Recolour" }).click();

  expect((await exportLines(page))[0].paletteIndex).not.toBe(before);
});

test("Escape lets go of the selection without changing the chart", async ({ page }) => {
  await oneLine(page);
  await useSelect(page);

  await clickCorner(page, 7, 4);
  await expect(page.getByText("1 selected")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("none selected")).toBeVisible();
  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4"]);
});

test("a line dragged past the edge stops where it still fits, whole", async ({ page }) => {
  await oneLine(page);
  await useMove(page);

  // A backstitch has no partial form, so a drag that would hang an end off the chart is declined frame by
  // frame: the line parks at the last position that fitted rather than being cut short or dropped.
  await dragCorner(page, [7, 4], [1, 4]);

  const lines = await exportLines(page);
  expect(lines).toHaveLength(1);
  expect(Math.min(lines[0].x1, lines[0].x2)).toBeGreaterThanOrEqual(0);
  // Still six cells long: moving a line never shortens it.
  expect(Math.abs(lines[0].x2 - lines[0].x1)).toBe(6);
  expect(lines[0].y1).toBe(4);
});

/**
 * The other half of the rule: an ordinary cell selection takes a line only when both its ends are inside it,
 * and then the line travels with the piece (Owner, 2026-09-25).
 *
 * The Select tool works in cells, so a rectangle over cells 2..13 reaches corners 2..14.
 */
async function dragCells(page: Page, from: [number, number], to: [number, number]) {
  const { x, y, cell } = await chartBox(page);
  // Mid-cell, so the press lands on the cell meant rather than on the boundary between two.
  await page.mouse.move(x + cell * (from[0] + 0.5), y + cell * (from[1] + 0.5));
  await page.mouse.down();
  await page.mouse.move(x + cell * (to[0] + 0.5), y + cell * (to[1] + 0.5));
  await page.mouse.up();
}

test("a cell selection carries a line whose ends are both inside it", async ({ page }) => {
  await oneLine(page);
  await pickTool(page, "Select");

  // Cells 2..13 span corners 2..14, so both ends of the line at corners 4 and 10 are inside.
  await dragCells(page, [2, 2], [13, 7]);
  await dragCells(page, [7, 4], [7, 9]);
  // The cell selection bar calls its merge button "Apply here".
  await page.getByRole("button", { name: "Apply here" }).click();

  expect(asEndpoints(await exportLines(page))).toEqual(["4,9-10,9"]);
});

test("a cell selection leaves a line with one end outside it alone", async ({ page }) => {
  await oneLine(page);
  await pickTool(page, "Select");

  // Cells 2..6 reach corner 7: the far end of the line, at corner 10, is outside.
  await dragCells(page, [2, 2], [6, 7]);
  await dragCells(page, [4, 4], [4, 9]);
  await page.getByRole("button", { name: "Apply here" }).click();

  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4"]);
});

/**
 * Every other test in this file reads the exported chart, which cannot see a stroke width. This one reads pixels.
 *
 * It exists because "the selected line is drawn thicker" is the only feedback the Select tool gives, and a missed
 * repaint would leave it silently absent while every data assertion above still passed.
 */
async function strokeWidthAt(page: Page, cx: number, cy: number): Promise<number> {
  return page.evaluate(
    ({ cx, cy }) => {
      const canvas = document.querySelector('[data-testid="chart-canvas"]') as HTMLCanvasElement;
      const frame = document.querySelector('[data-testid="chart-frame"]')!.getBoundingClientRect();
      const box = canvas.getBoundingClientRect();
      const ctx = canvas.getContext("2d")!;
      // The Small preset is 50 stitches wide. The canvas is a viewport-sized bitmap, so a chart corner is placed
      // relative to the frame first and then to the bitmap.
      const cell = frame.width / 50;
      const px = Math.round(frame.x + cx * cell - box.x);
      const py = Math.round(frame.y + cy * cell - box.y);
      const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
      // Whatever colour the thread happens to be, the line's own middle is the sample to match against.
      const thread = at(px, py);
      const near = (c: number[]) => c.every((v, i) => Math.abs(v - thread[i]) <= 24);
      let count = 0;
      for (let dy = -6; dy <= 6; dy++) if (near(at(px, py + dy))) count++;
      return count;
    },
    { cx, cy }
  );
}

test("the selected line is drawn thicker as soon as it is picked up", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);
  // Two lines, so the selected one can be compared with an untouched one in the same picture.
  await drawChain(page, [
    [4, 4],
    [20, 4],
  ]);
  await drawChain(page, [
    [4, 12],
    [20, 12],
  ]);

  await useSelect(page);
  const before = await strokeWidthAt(page, 12, 4);
  expect(before).toBeGreaterThan(0);

  await clickCorner(page, 12, 4);
  await expect(page.getByText("1 selected")).toBeVisible();

  expect(await strokeWidthAt(page, 12, 4)).toBeGreaterThan(before);
  expect(await strokeWidthAt(page, 12, 12)).toBe(before);
});
