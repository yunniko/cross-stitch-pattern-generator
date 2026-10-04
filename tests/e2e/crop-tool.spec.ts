import { test, expect, type Page } from "@playwright/test";
import { generateSmallPattern } from "./helpers/app";

/**
 * G-089: the Crop tool. Its frame on the chart and the four numbers in its bar are one value, and Apply is the canvas resize
 * the Chart tab's Canvas group used to be (the specs that covered that group are these, moved with it).
 */

/** The status line: "W × H, N stitches, K colors" -- the canvas size, then only filled stitches (D120). */
const header = (page: Page) => page.getByText(/^\d+ × \d+, [\d,]+ stitch(es)?, \d+ colors$/);
const field = (page: Page, name: string) => page.getByTestId("crop-bar").getByLabel(name, { exact: true });
const frame = async (page: Page) => (await page.getByTestId("crop-overlay").getAttribute("data-frame"))!;

async function openTool(page: Page) {
  await generateSmallPattern(page);
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  await expect(page.getByTestId("crop-bar")).toBeVisible();
}

/** The chart is 50 wide; its height comes from the photo. */
async function chartSize(page: Page): Promise<{ w: number; h: number }> {
  const m = /^(\d+) × (\d+),/.exec((await header(page).textContent()) ?? "")!;
  return { w: Number(m[1]), h: Number(m[2]) };
}

test("choosing the tool shows a frame over the whole chart and four numbers at zero", async ({ page }) => {
  await openTool(page);
  const { w, h } = await chartSize(page);
  expect(await frame(page)).toBe(`0,0,${w},${h}`);
  for (const name of ["Top", "Right", "Bottom", "Left"]) await expect(field(page, name)).toHaveValue("0");
  await expect(page.getByRole("button", { name: "Apply" })).toBeDisabled();
  await expect(page.getByTestId("crop-readout")).toContainText(`${w} × ${h} → ${w} × ${h}`);
});

test("typing a number moves the frame, and the readout shows the size it leaves", async ({ page }) => {
  await openTool(page);
  const { w, h } = await chartSize(page);
  await field(page, "Left").fill("5");
  await expect.poll(() => frame(page)).toBe(`5,0,${w},${h}`);
  await expect(page.getByTestId("crop-readout")).toContainText(`→ ${w - 5} × ${h}`);
  await field(page, "Bottom").fill("-3");
  await expect.poll(() => frame(page)).toBe(`5,0,${w},${h + 3}`);
  await expect(page.getByTestId("crop-added")).toHaveCount(1);
});

test("dragging an edge changes the number, and a corner changes two", async ({ page }) => {
  await openTool(page);
  const cell = Number(await page.getByTestId("chart-frame").getAttribute("data-cell-size"));
  const grab = async (name: string, dx: number, dy: number) => {
    const box = (await page.getByTestId(`crop-handle-${name}`).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx * cell, y + dy * cell, { steps: 4 });
    await page.mouse.up();
  };
  await grab("left", 4, 0);
  await expect(field(page, "Left")).toHaveValue("4");
  await grab("top-right", -2, 3);
  await expect(field(page, "Right")).toHaveValue("2");
  await expect(field(page, "Top")).toHaveValue("3");
});

test("the arrow keys on a handle move its edge, ten with Shift", async ({ page }) => {
  await openTool(page);
  await page.getByTestId("crop-handle-left").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(field(page, "Left")).toHaveValue("11");
  await page.keyboard.press("ArrowLeft");
  await expect(field(page, "Left")).toHaveValue("10");
});

test("Apply cuts the chart as one undoable step, adds no colour, and the frame starts again over the new chart", async ({ page }) => {
  await openTool(page);
  const { w, h } = await chartSize(page);
  const stitches = /, ([\d,]+ stitch(?:es)?),/.exec((await header(page).textContent()) ?? "")![1];
  await field(page, "Right").fill("5");
  await field(page, "Left").fill("-3"); // grow on the left, cut on the right: 50 - 5 + 3
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(header(page)).toHaveText(new RegExp(`^${w - 5 + 3} × ${h}, `));
  expect(await frame(page)).toBe(`0,0,${w - 2},${h}`);
  for (const name of ["Top", "Right", "Bottom", "Left"]) await expect(field(page, name)).toHaveValue("0");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(header(page)).toHaveText(new RegExp(`^${w} × ${h}, ${stitches},`));
});

test("expanding adds empty stitches only: the stitch count and the colours do not change (D109)", async ({ page }) => {
  await openTool(page);
  const stitches = /, ([\d,]+ stitch(?:es)?),/.exec((await header(page).textContent()) ?? "")![1];
  await field(page, "Right").fill("-5");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(header(page)).toHaveText(new RegExp(`^55 × \\d+, ${stitches},`));
  await page.getByRole("tab", { name: "Threads" }).click();
  await expect(page.getByTestId("legend-color-row").first()).toBeVisible();
});

test("a number that would leave nothing is refused with the old message, and Apply stays off", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openTool(page);
  await field(page, "Left").fill("60");
  await expect(page.getByTestId("crop-readout")).toHaveText("Can't crop away the entire pattern.");
  await expect(page.getByRole("button", { name: "Apply" })).toBeDisabled();
  expect((await header(page).textContent()) ?? "").toMatch(/^50 × /);
  expect(errors).toEqual([]);
});

test("Escape and Cancel put the frame back; Enter applies; leaving the tool drops the frame without changing the chart", async ({
  page,
}) => {
  await openTool(page);
  const { w, h } = await chartSize(page);
  await field(page, "Top").fill("2");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(field(page, "Top")).toHaveValue("0");

  await field(page, "Top").fill("2");
  await page.getByTestId("chart-frame").hover();
  await page.keyboard.press("Escape");
  await expect(field(page, "Top")).toHaveValue("0");

  await field(page, "Left").fill("4");
  await page.getByTestId("chart-frame").hover();
  await page.keyboard.press("Enter");
  await expect(header(page)).toHaveText(new RegExp(`^${w - 4} × ${h}, `));

  await field(page, "Top").fill("3");
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await expect(page.getByTestId("crop-overlay")).toHaveCount(0);
  await expect(header(page)).toHaveText(new RegExp(`^${w - 4} × ${h}, `));
});

test("the C key chooses the tool, and Space-panning keeps the frame", async ({ page }) => {
  await generateSmallPattern(page);
  await page.getByTestId("chart-frame").hover();
  await page.keyboard.press("c");
  await expect(page.getByTestId("crop-bar")).toBeVisible();
  await field(page, "Left").fill("3");
  await field(page, "Left").evaluate((input) => (input as HTMLInputElement).blur()); // leaves the field, so Space is the pan key and not a space typed into it
  await page.getByTestId("chart-frame").hover();
  await page.keyboard.down("Space");
  await page.keyboard.up("Space");
  await expect(field(page, "Left")).toHaveValue("3");
});

test("the Chart tab no longer holds the canvas numbers", async ({ page }) => {
  await generateSmallPattern(page);
  await page.getByRole("tab", { name: "Chart" }).click();
  await expect(page.getByLabel("Pattern name")).toBeVisible();
  await expect(page.getByLabel("Left", { exact: true })).toHaveCount(0);
});

// QA 2026-10-04, findings 2, 5, 6 and 9.

test("the frame waits through a looking-only view and comes back with its numbers", async ({ page }) => {
  await openTool(page);
  await field(page, "Left").fill("5");
  await field(page, "Left").evaluate((input) => (input as HTMLInputElement).blur());
  await page.getByTestId("chart-frame").hover();
  await page.keyboard.press("3"); // Stitched: looking only
  await expect(page.getByTestId("crop-overlay")).toHaveCount(0);
  await expect(page.getByTestId("crop-bar")).toHaveCount(0);
  await page.keyboard.press("1");
  await expect(page.getByTestId("crop-overlay")).toBeVisible();
  await expect(field(page, "Left")).toHaveValue("5");
});

test("choosing Crop again, or coming back from the Zoom tool, keeps the frame", async ({ page }) => {
  await openTool(page);
  await field(page, "Left").fill("7");
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  await expect(field(page, "Left")).toHaveValue("7");
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  await expect(field(page, "Left")).toHaveValue("7");
});

test("Apply waits while a field holds text that is not a number", async ({ page }) => {
  await openTool(page);
  await field(page, "Left").fill("3");
  await expect(page.getByRole("button", { name: "Apply" })).toBeEnabled();
  await field(page, "Left").fill("+2");
  await expect(page.getByRole("button", { name: "Apply" })).toBeDisabled();
  await field(page, "Top").click(); // leaving the field puts the last usable number back
  await expect(field(page, "Left")).toHaveValue("3");
  await expect(page.getByRole("button", { name: "Apply" })).toBeEnabled();
});

test("Apply and Cancel stay in view in a narrow window", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await openTool(page);
  await field(page, "Left").fill("2");
  const bar = (await page.getByTestId("crop-bar").boundingBox())!;
  for (const name of ["Apply", "Cancel"]) {
    const box = (await page.getByRole("button", { name }).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(bar.x + bar.width);
  }
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(header(page)).toHaveText(/^48 × /);
});
