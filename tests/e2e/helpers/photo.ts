import { expect, type Page } from "@playwright/test";
import { showPhotoTab } from "./app";

/**
 * The photo itself in Photo (G-124): the four sliders with Apply and Cancel, the photo's own history, and the photo stage
 * the Photo wand works on. Located once for every spec that edits the photo.
 */

export const SLIDERS = ["Brightness", "Contrast", "Saturation", "Warm / cool"] as const;
export type SliderName = (typeof SLIDERS)[number];

export const photoSlider = (page: Page, name: SliderName) => page.getByRole("slider", { name });

/** The Picture tab's buttons, inside the panel: the bar above has its own Undo and Redo. */
export function photoControls(page: Page) {
  const panel = page.getByTestId("panel");
  const history = page.getByTestId("photo-history");
  return {
    apply: panel.getByRole("button", { name: /^(Apply|Apply to selection|Working…)$/ }),
    cancel: panel.getByRole("button", { name: "Cancel", exact: true }),
    undo: history.getByRole("button", { name: "Undo", exact: true }),
    redo: history.getByRole("button", { name: "Redo", exact: true }),
    restore: history.getByRole("button", { name: "Restore original", exact: true }),
    notApplied: page.getByTestId("sliders-not-applied"),
  };
}

/** Sets a slider the way a keyboard would, on the Picture tab, and lets it settle. */
export async function setSlider(page: Page, name: SliderName, value: number) {
  await showPhotoTab(page, "Picture");
  await photoSlider(page, name).fill(String(value));
  await photoSlider(page, name).dispatchEvent("change");
}

/**
 * Does something that changes the photo in hand (Apply, Delete, Undo, Redo, Restore) and waits for the colour prediction
 * of the photo it leaves, so a Generate after it is held to that photo's ceiling and not the last one's (G-087).
 */
export async function changingPhoto(page: Page, change: () => Promise<void>) {
  const predicted = page.waitForResponse((r) => r.url().includes("/api/predictions"), { timeout: 20_000 });
  await change();
  await predicted;
}

/** Applies the sliders and waits for the step to be in: the sliders back in the middle, the new photo predicted. */
export async function applySliders(page: Page) {
  await changingPhoto(page, () => photoControls(page).apply.click());
  for (const name of SLIDERS) await expect(photoSlider(page, name)).toHaveValue("0");
}

/** The photo as shown on the stage, as a digest of what is painted: mean level, red and blue. */
export async function stageDigest(page: Page): Promise<{ level: number; red: number; blue: number; chroma: number }> {
  return page.evaluate(async () => {
    const shown =
      document.querySelector<HTMLCanvasElement>('[data-testid="adjusted-photo"]') ??
      document.querySelector<HTMLImageElement>('[data-testid="photo-stage"] img');
    if (!shown) return { level: -1, red: -1, blue: -1, chroma: -1 };
    let width = shown.width;
    let height = shown.height;
    if (shown instanceof HTMLImageElement) {
      await shown.decode();
      width = shown.naturalWidth;
      height = shown.naturalHeight;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.drawImage(shown, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    let sum = 0;
    let red = 0;
    let blue = 0;
    let chroma = 0;
    let counted = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      counted++;
      sum += data[i] + data[i + 1] + data[i + 2];
      red += data[i];
      blue += data[i + 2];
      chroma = Math.max(chroma, Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]));
    }
    const n = Math.max(1, counted);
    return { level: Math.round(sum / n / 3), red: Math.round(red / n), blue: Math.round(blue / n), chroma };
  });
}
