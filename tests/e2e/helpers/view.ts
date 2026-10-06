import { expect, type Page } from "@playwright/test";

/**
 * The view's switches (G-110, D315), located once for every spec that changes or reads the view. The chart frame
 * states the view in force on its own attributes, so a spec reads what is drawn rather than how a control looks.
 */

export interface ShownView {
  pattern?: "color" | "bw" | "realistic";
  symbols?: boolean;
  photo?: boolean;
  visibility?: number;
}

export function viewControls(page: Page) {
  const bar = page.getByTestId("view-controls");
  return {
    mode: (label: "Color" | "B&W" | "Stitched") => bar.getByRole("button", { name: label, exact: true }),
    symbols: bar.getByRole("button", { name: "Symbols", exact: true }),
    photo: bar.getByRole("button", { name: "Photo under the pattern" }),
    visibility: bar.getByRole("slider", { name: "Pattern visibility over the photo" }),
    note: page.getByTestId("view-only-note"),
  };
}

/** Moves the pattern's visibility over the photo; the photo must be on. */
export async function setVisibility(page: Page, percent: number) {
  await viewControls(page).visibility.fill(String(percent));
}

/** The photo on, with the pattern at `percent` over it: 0 is the photo alone. */
export async function showOverPhoto(page: Page, percent: number) {
  const controls = viewControls(page);
  if ((await controls.photo.getAttribute("aria-pressed")) !== "true") await controls.photo.click();
  await setVisibility(page, percent);
}

/** Only the fields given are checked. */
export async function expectView(page: Page, view: ShownView) {
  const frame = page.getByTestId("chart-frame");
  if (view.pattern) await expect(frame).toHaveAttribute("data-view-pattern", view.pattern);
  if (view.symbols !== undefined) await expect(frame).toHaveAttribute("data-view-symbols", view.symbols ? "on" : "off");
  if (view.photo !== undefined) await expect(frame).toHaveAttribute("data-view-photo", view.photo ? "on" : "off");
  if (view.visibility !== undefined) await expect(frame).toHaveAttribute("data-view-visibility", String(view.visibility));
}
