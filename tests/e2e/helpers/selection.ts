import type { Page } from "@playwright/test";

/**
 * The selection's actions (G-116, D333), located once. Select, Lasso and the Magic wand keep every action in their
 * Selection tab in the panel, and Apply here and Cancel on the top bar as well; a spec reaches the pair on the bar, so
 * it is the same button whichever tab the panel shows.
 */

export type SelectionActionName =
  | "Invert selection"
  | "Copy"
  | "Paste"
  | "Duplicate"
  | "Fill selection"
  | "Flip horizontal"
  | "Flip vertical"
  | "Rotate right"
  | "Rotate left"
  | "Crop to selection"
  | "Save as stamp";

/** Apply here or Cancel, on the top bar. */
export const selectionFinish = (page: Page, name: "Apply here" | "Cancel") =>
  page.getByTestId("selection-bar").getByRole("button", { name, exact: true });

/** An action in the Selection tab; the tab must be the one shown (see `showSelectionTab`). */
export const selectionAction = (page: Page, name: SelectionActionName) =>
  page.getByTestId("selection-panel").getByRole("button", { name, exact: true });

/** Brings the Selection tab forward, for a spec that showed another tab since the tool was picked. */
export async function showSelectionTab(page: Page): Promise<void> {
  if (await page.getByTestId("selection-panel").isVisible()) return;
  await page.getByRole("tab", { name: "Selection" }).click();
}

/** Clicks an action in the Selection tab, showing the tab first if another is in front. */
export async function clickSelectionAction(page: Page, name: SelectionActionName): Promise<void> {
  await showSelectionTab(page);
  await selectionAction(page, name).click();
}
