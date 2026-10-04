import { test, expect, type Page } from "@playwright/test";
import { generateSmallPattern, pickTool } from "./helpers/app";

/**
 * G-093: the command list. It draws the command table: every command with its key and whether it can be used now, searched
 * by typing, run from the list. It has no key of its own; it is opened from the button under New.
 */

const opener = (page: Page) => page.getByRole("button", { name: "Commands", exact: true });
const list = (page: Page) => page.getByRole("dialog", { name: "Commands" });
const search = (page: Page) => page.getByRole("combobox", { name: "Search commands" });
const row = (page: Page, id: string) => list(page).locator(`[data-command="${id}"]`);
const tool = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });

async function openList(page: Page) {
  await opener(page).click();
  await expect(search(page)).toBeFocused();
}

test("lists every command, and searching narrows it by name, group or key", async ({ page }) => {
  await generateSmallPattern(page);
  await openList(page);
  const all = await list(page).getByRole("option").count();
  expect(all).toBeGreaterThan(60);
  await expect(list(page).getByText(`${all} of ${all}`)).toBeVisible();

  await search(page).fill("undo");
  await expect(list(page).getByRole("option")).toHaveCount(1);
  await expect(row(page, "edit.undo")).toContainText("Ctrl+Z");

  await search(page).fill("selection flip");
  await expect(list(page).getByRole("option")).toHaveCount(2);

  await search(page).fill("no such command");
  await expect(list(page).getByText("No command matches.")).toBeVisible();
});

test("Enter runs the highlighted command and closes the list; the arrow keys move the highlight", async ({ page }) => {
  await generateSmallPattern(page);
  await openList(page);
  await search(page).fill("tool la");
  // Lasso fill, then Lasso, in the table's order; the first is highlighted.
  await expect(row(page, "tool.lasso-fill")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(row(page, "tool.lasso")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(list(page)).toHaveCount(0);
  await expect(tool(page, "Lasso")).toHaveAttribute("aria-pressed", "true");
});

test("a press on a row runs it", async ({ page }) => {
  await generateSmallPattern(page);
  const zoom = page.getByRole("button", { name: "Reset zoom to 100%" });
  await expect(zoom).toHaveText("100%");
  await openList(page);
  await row(page, "view.zoom-in").click();
  await expect(list(page)).toHaveCount(0);
  await expect(zoom).not.toHaveText("100%");
});

test("a command that cannot be used now says why and does not run; one that is only a key press is not run from the list", async ({
  page,
}) => {
  await generateSmallPattern(page);
  await openList(page);
  const copy = row(page, "selection.copy");
  await expect(copy).toHaveAttribute("aria-disabled", "true");
  await expect(copy).toContainText("A piece in hand");
  // Forced: the row says it is disabled, which is the point, and the press must still do nothing.
  await copy.click({ force: true });
  await expect(list(page)).toBeVisible();

  const pan = row(page, "view.pan-held");
  await expect(pan).toHaveAttribute("aria-disabled", "true");
  await expect(pan).toContainText("From the keyboard only");
  await expect(pan).toContainText("Space (held)");

  // Undo has nothing to step back to on a chart just generated; after a change it is offered.
  await expect(row(page, "edit.undo")).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await openList(page);
  await row(page, "chart.mirror-left-half").click();
  await openList(page);
  await expect(row(page, "edit.undo")).toHaveAttribute("aria-disabled", "false");
  await row(page, "edit.undo").click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("typing in the list never reaches the chart's keys, and Escape closes it with the focus back on its button", async ({ page }) => {
  await generateSmallPattern(page);
  await pickTool(page, "Fill");
  await openList(page);
  // B is Brush, 3 is the Stitched view, X swaps the colours: here they are only letters in the field.
  await search(page).pressSequentially("b3x");
  await expect(search(page)).toHaveValue("b3x");
  await page.keyboard.press("Escape");
  await expect(list(page)).toHaveCount(0);
  await expect(opener(page)).toBeFocused();
  await expect(tool(page, "Fill")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Color", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("after a command is run the chart's keys act at once", async ({ page }) => {
  await generateSmallPattern(page);
  await openList(page);
  await search(page).fill("fill tool");
  await page.keyboard.press("Enter");
  await expect(tool(page, "Fill")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("b");
  await expect(tool(page, "Brush")).toHaveAttribute("aria-pressed", "true");
});

test("the list is not offered while the start screen covers a chart", async ({ page }) => {
  await generateSmallPattern(page);
  await page.getByRole("button", { name: "New chart" }).click();
  await expect(opener(page)).toBeDisabled();
  await page.getByRole("button", { name: /Back to/ }).click();
  await expect(opener(page)).toBeEnabled();
});
