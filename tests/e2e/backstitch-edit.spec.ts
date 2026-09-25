import { test, expect, type Page } from "@playwright/test";
import { generateSmallPattern, pickTool } from "./helpers/app";
import { asEndpoints, chartBox, clickCorner, dragCorner, drawChain, exportLines, pickThread } from "./helpers/backstitch";

/**
 * G-073 M3: editing backstitch, with one tool (D229).
 *
 * A press takes the line it lands on, wherever on it; only a line already in hand has live ends. The pair of
 * tests below that drag the same endpoint — once on a line nobody holds, once on the line in hand — are what
 * prove that rule, since it is the whole reason this is one tool and not two.
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

const useEdit = (page: Page) => pickTool(page, "BS edit");

test("the bar counts what is in hand, and pressing off the line lets go", async ({ page }) => {
  await oneLine(page);
  await useEdit(page);

  await expect(page.getByText("none selected")).toBeVisible();
  await clickCorner(page, 7, 4);
  await expect(page.getByText("1 selected")).toBeVisible();

  await clickCorner(page, 20, 20);
  await expect(page.getByText("none selected")).toBeVisible();
});

test("a press on a line nobody holds moves the whole line, even on an end", async ({ page }) => {
  await oneLine(page);
  await useEdit(page);

  // Nothing is in hand, so this press means "take this line" and the drag moves it bodily by (0,5).
  await dragCorner(page, [10, 4], [10, 9]);
  expect(asEndpoints(await exportLines(page))).toEqual(["4,9-10,9"]);
});

test("once the line is in hand, the same press on its end re-aims it instead", async ({ page }) => {
  await oneLine(page);
  await useEdit(page);

  // Pick it up by its middle first; only then are its ends live.
  await clickCorner(page, 7, 4);
  await expect(page.getByText("1 selected")).toBeVisible();

  await dragCorner(page, [10, 4], [10, 9]);
  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,9"]);
});

test("a line moves when the press is on its middle", async ({ page }) => {
  await oneLine(page);
  await useEdit(page);

  await dragCorner(page, [7, 4], [9, 7]);
  expect(asEndpoints(await exportLines(page))).toEqual(["6,7-12,7"]);
});

test("an edit is one undo step", async ({ page }) => {
  await oneLine(page);
  await useEdit(page);

  // Picked up first, so the drag re-aims the end rather than moving the line.
  await clickCorner(page, 7, 4);
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
  await useEdit(page);

  await clickCorner(page, 7, 4);
  await page.getByRole("button", { name: "Delete" }).click();
  expect(asEndpoints(await exportLines(page))).toEqual(["10,4-10,10"]);
});

test("Duplicate leaves the line and takes the copy", async ({ page }) => {
  await oneLine(page);
  await useEdit(page);

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
  await useEdit(page);

  await clickCorner(page, 7, 4);
  await page.getByRole("button", { name: "Copy" }).click();
  await page.getByRole("button", { name: "Paste" }).click();

  const lines = asEndpoints(await exportLines(page));
  expect(lines).toHaveLength(2);
  expect(lines).toContain("4,4-10,4");
});

test("Turn stands a horizontal line up, pivoting on the corner its bounds start at", async ({ page }) => {
  await oneLine(page);
  await useEdit(page);

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
  await useEdit(page);

  await clickCorner(page, 7, 6);
  await page.getByRole("button", { name: "Mirror ↔" }).click();

  // The diagonal leans the other way, over the same cells.
  expect(asEndpoints(await exportLines(page))).toEqual(["10,4-4,8"]);
});

test("Recolour gives the line the thread in hand", async ({ page }) => {
  await oneLine(page);
  const before = (await exportLines(page))[0].paletteIndex;
  await pickThread(page, 1);
  await useEdit(page);

  await clickCorner(page, 7, 4);
  await page.getByRole("button", { name: "Recolour" }).click();

  expect((await exportLines(page))[0].paletteIndex).not.toBe(before);
});

test("Escape lets go of the selection without changing the chart", async ({ page }) => {
  await oneLine(page);
  await useEdit(page);

  await clickCorner(page, 7, 4);
  await expect(page.getByText("1 selected")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("none selected")).toBeVisible();
  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4"]);
});

test("a line dragged past the edge stops where it still fits, whole", async ({ page }) => {
  await oneLine(page);
  await useEdit(page);

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

  await useEdit(page);
  const before = await strokeWidthAt(page, 12, 4);
  expect(before).toBeGreaterThan(0);

  await clickCorner(page, 12, 4);
  await expect(page.getByText("1 selected")).toBeVisible();

  expect(await strokeWidthAt(page, 12, 4)).toBeGreaterThan(before);
  expect(await strokeWidthAt(page, 12, 12)).toBe(before);
});

test("backstitch survives a reload, which is where the autosave had dropped it", async ({ page }) => {
  await oneLine(page);
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });

  // The editable save carried the line from M1 onwards; the autosave record, assembled field by field, did
  // not, so every line vanished on reload. Found on the live build, 2026-09-25.
  await page.reload();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });

  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4"]);
  // And it is still a line the tools can take hold of, not just bytes in a file.
  await useEdit(page);
  await clickCorner(page, 7, 4);
  await expect(page.getByText("1 selected")).toBeVisible();
});

/**
 * Where the chart says a corner is, and whether the thread's colour is actually painted there.
 *
 * Returns the distance in pixels from the expected point to the nearest pixel of the line's colour, searching a
 * generous box around it, or `null` when the colour is nowhere near. A correct draw answers 0 or 1.
 */
async function lineOffsetAt(page: Page, cx: number, cy: number): Promise<number | null> {
  return page.evaluate(
    ({ cx, cy }) => {
      const canvas = document.querySelector('[data-testid="chart-canvas"]') as HTMLCanvasElement;
      const frame = document.querySelector('[data-testid="chart-frame"]')!.getBoundingClientRect();
      const box = canvas.getBoundingClientRect();
      const ctx = canvas.getContext("2d")!;
      const cell = frame.width / 50;
      const px = Math.round(frame.x + cx * cell - box.x);
      const py = Math.round(frame.y + cy * cell - box.y);
      const thread = Array.from(ctx.getImageData(px, py, 1, 1).data).slice(0, 3);
      // The line is the only saturated red on this chart; sample its own colour from the chart's palette instead of
      // guessing, by looking for the nearest pixel that differs from the stitches around it.
      const target = (window as unknown as { __lineRgb: number[] }).__lineRgb;
      const near = (c: number[]) => c.every((v, i) => Math.abs(v - target[i]) <= 20);
      if (near(thread)) return 0;
      for (let r = 1; r <= 400; r++) {
        for (const [dx, dy] of [
          [r, 0],
          [-r, 0],
          [0, r],
          [0, -r],
        ]) {
          const x = px + dx;
          const y = py + dy;
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
          if (near(Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3))) return r;
        }
      }
      return null;
    },
    { cx, cy }
  );
}

test("a line stays on its own corners when the chart is zoomed in and scrolled", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);
  await drawChain(page, [
    [20, 24],
    [34, 24],
  ]);

  // The colour the line was drawn in, read from the chart rather than assumed. The inspector mounts one pane
  // at a time, so the legend rows only exist while the Threads tab is up.
  await page.getByRole("tab", { name: "Threads" }).click();
  await page.evaluate(() => {
    const swatch = document.querySelector('[data-testid="legend-color-row"] button[style*="background"]') as HTMLElement;
    const m = getComputedStyle(swatch).backgroundColor.match(/\d+/g)!;
    (window as unknown as { __lineRgb: number[] }).__lineRgb = m.slice(0, 3).map(Number);
  });
  await page.getByRole("tab", { name: "Chart" }).click();

  expect(await lineOffsetAt(page, 27, 24)).toBeLessThanOrEqual(1);

  // Zoom in until the chart is far larger than its viewport, so the painted region no longer starts at the
  // chart's own origin. The scene translated the backstitch by that region's origin on top of the coordinates
  // it already held, so every line jumped away from its corners as soon as you zoomed (Owner, 2026-09-25).
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(400);

  // Bring the line into view. The chart is centred in its scroller, so the target is measured from the frame's
  // own offset inside it — the chart only paints a window around the viewport, and a line left outside that
  // window is simply not on the bitmap to find.
  await page.evaluate(() => {
    const frameEl = document.querySelector('[data-testid="chart-frame"]') as HTMLElement;
    const scroller = frameEl.parentElement!;
    const cell = frameEl.getBoundingClientRect().width / 50;
    scroller.scrollLeft = frameEl.offsetLeft + 27 * cell - scroller.clientWidth / 2;
    scroller.scrollTop = frameEl.offsetTop + 24 * cell - scroller.clientHeight / 2;
  });
  await page.waitForTimeout(700);

  expect(await lineOffsetAt(page, 27, 24)).toBeLessThanOrEqual(1);
});

test("a one-cell line can still be moved once it is in hand", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);
  await drawChain(page, [
    [8, 8],
    [9, 8],
  ]);
  await useEdit(page);

  // A flat end zone would have covered 84% of a line this short, leaving nothing to drag it by.
  await clickCorner(page, 8, 8);
  await expect(page.getByText("1 selected")).toBeVisible();
  await dragCorner(page, [8.5, 8], [8.5, 14]);

  expect(asEndpoints(await exportLines(page))).toEqual(["8,14-9,14"]);
});

test("Delete removes the line in hand, and Backspace does the same", async ({ page }) => {
  await generateSmallPattern(page);
  await pickThread(page);
  await drawChain(page, [
    [4, 4],
    [10, 4],
    [10, 10],
  ]);
  await useEdit(page);

  await clickCorner(page, 7, 4);
  await page.keyboard.press("Delete");
  expect(asEndpoints(await exportLines(page))).toEqual(["10,4-10,10"]);

  // Backspace is the key labelled *delete* on a Mac, so it has to mean the same thing.
  await clickCorner(page, 10, 7);
  await page.keyboard.press("Backspace");
  expect(await exportLines(page)).toHaveLength(0);
});

test("Delete is one undo step, and does nothing with no line in hand", async ({ page }) => {
  await oneLine(page);
  await useEdit(page);

  // Nothing selected: the key must not reach for a line of its own choosing.
  await page.keyboard.press("Delete");
  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4"]);

  await clickCorner(page, 7, 4);
  await page.keyboard.press("Delete");
  expect(await exportLines(page)).toHaveLength(0);
  await page.keyboard.press("Control+z");
  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4"]);
});

/** Dispatches a cancelable Delete and reports whether the app claimed it. */
async function deleteIsSwallowed(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const event = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

test("Delete belongs to the backstitch tool alone, and is left alone by every other", async ({ page }) => {
  await oneLine(page);
  await useEdit(page);

  // Probed with nothing in hand, so the probe itself cannot delete anything: the question is only whether
  // this tool claims the key at all.
  expect(await deleteIsSwallowed(page)).toBe(true);

  // Under any other tool the key is handed back rather than quietly swallowed on behalf of a tool nobody
  // is holding.
  await pickTool(page, "Brush");
  expect(await deleteIsSwallowed(page)).toBe(false);
  expect(asEndpoints(await exportLines(page))).toEqual(["4,4-10,4"]);
});
