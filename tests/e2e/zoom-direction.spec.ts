import { test, expect, type Page } from "@playwright/test";
import { openSmallChart, pickTool, waitForAutosave } from "./helpers/app";

/**
 * G-115, D324: the Zoom tool's "Zoom direction" option sets the way a left press zooms; a right press zooms the other way,
 * and the pointer over the chart shows the way a press goes.
 */

const readout = (page: Page) => page.getByRole("button", { name: "Reset zoom to 100%" });
const percent = async (page: Page) => Number.parseInt((await readout(page).textContent())!, 10);
const direction = (page: Page, choice: "In" | "Out") =>
  page.getByRole("group", { name: "Zoom direction" }).getByRole("button", { name: choice, exact: true });

/** Presses the middle of the chart with `button` and returns whether the zoom went up. */
async function pressZooms(page: Page, button: "left" | "right"): Promise<"in" | "out"> {
  const before = await percent(page);
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button });
  await expect(readout(page)).not.toHaveText(`${before}%`);
  return (await percent(page)) > before ? "in" : "out";
}

test("a click zooms the way chosen and a right click the other way, and the choice is kept across a reload", async ({ page }) => {
  await openSmallChart(page);
  await pickTool(page, "Zoom");
  const frame = page.getByTestId("chart-frame");
  await expect(direction(page, "In")).toHaveAttribute("aria-pressed", "true");
  await expect(frame).toHaveClass(/cursor-zoom-in/);
  expect(await pressZooms(page, "left")).toBe("in");
  expect(await pressZooms(page, "right")).toBe("out");

  await direction(page, "Out").click();
  await expect(frame).toHaveClass(/cursor-zoom-out/);
  expect(await pressZooms(page, "left")).toBe("out");
  expect(await pressZooms(page, "right")).toBe("in");

  await waitForAutosave(page);
  await page.reload();
  await expect(frame).toBeVisible();
  await pickTool(page, "Zoom");
  await expect(direction(page, "Out")).toHaveAttribute("aria-pressed", "true");
});
