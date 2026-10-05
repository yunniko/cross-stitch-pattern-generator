import { expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * What most specs need before they can test anything (G-067 M5, STANDARDS.md → "One home per shared test
 * affordance").
 *
 * Fifteen specs carried their own copy of this, differing only in the timeout and in whether they waited for the
 * chart frame or the canvas inside it. That is not free duplication: when the workspace gained a second canvas in
 * G-065, the locator every copy used became ambiguous and 27 files needed the same edit. One definition here means
 * one edit next time.
 *
 * The wait is the strictest of the copies — the canvas, not its frame, at the longest timeout any of them used — so
 * no spec got a weaker guarantee by moving to it.
 */

export const FIXTURE = path.join(__dirname, "..", "fixtures", "sample.png");

/**
 * Puts a tool in hand by its rail label, matched exactly.
 *
 * Exactness is the point. A label that contains another label — "Lasso fill" over "Fill" in G-072, "BS
 * move" over "Move" in G-073 — turns every loose locator in the suite into a strict-mode violation at once.
 * One definition here means the next tool costs nobody an afternoon.
 */
export async function pickTool(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: label, exact: true }).click();
}

/**
 * Shows one of the three workspaces by its tab in the bar above (G-095): Photo makes the chart, Edit changes it, Export
 * gets it out. A chart that is opened arrives in Edit; one that is generated stays in Photo.
 */
export async function showWorkspace(page: Page, name: "Photo" | "Edit" | "Export"): Promise<void> {
  await page.getByRole("tab", { name, exact: true }).click();
}

/**
 * Presses Generate or Regenerate and waits for the chart it makes. The chart on screen is no sign of that once one exists:
 * a Regenerate leaves the old chart up until the new one arrives, and Save is in reach the whole time (G-095), so a spec
 * that saved straight away would save the old chart. The button coming back as an enabled Regenerate is the sign.
 */
export async function generateAndWait(page: Page, timeout = 30_000): Promise<void> {
  await page.getByRole("button", { name: /^(Generate pattern|Regenerate)$/ }).click();
  await expect(page.getByRole("button", { name: "Regenerate", exact: true })).toBeEnabled({ timeout });
  await expect(page.getByTestId("chart-canvas")).toBeVisible();
}

/** One of the brush's sizes, in the bar of tool options: a button each since G-095 (they were a list). */
export const brushSize = (page: Page, size: number) =>
  page.getByRole("group", { name: "Brush size in stitches" }).getByRole("button", { name: String(size), exact: true });

/** The choice of what to export, in the Export workspace's panel. */
export const exportChoice = (page: Page) => page.getByRole("combobox", { name: "Export", exact: true });

/**
 * Opens the settings of how the cloth and stitches are drawn (canvas colour, canvas texture, stitch texture), at the end
 * of the readout under the chart. They were in the Chart tab before G-095. Already open, it is left open; it stays open
 * while the view controls are used and closes on a press anywhere else.
 */
export async function openViewSettings(page: Page): Promise<void> {
  const settings = page.getByRole("dialog", { name: "Canvas and stitch texture" });
  if (!(await settings.isVisible())) await page.getByRole("button", { name: "Canvas & stitch texture" }).click();
  await expect(settings).toBeVisible();
}

/**
 * A dither pattern in the chooser, by its id (`floyd-steinberg`, `hand-drawn`, ...; `lines` for the four line screens,
 * whose direction is set under the chooser). The patterns are pictures to press since G-095; they were a list.
 */
export const ditherChoice = (page: Page, mode: string) => page.getByRole("radiogroup", { name: "Dither" }).locator(`[data-mode="${mode}"]`);

/** One of the three tabs of the Photo panel, with the Photo workspace shown first. */
export async function showPhotoTab(page: Page, name: "Picture" | "Chart settings" | "Lines & texture"): Promise<void> {
  await showWorkspace(page, "Photo");
  await page.getByTestId("panel").getByRole("tab", { name, exact: true }).click();
}

/** The Save button in the bar above: it downloads the editable file from any workspace, leaving what is in hand alone. */
export const saveButton = (page: Page) => page.getByRole("button", { name: "Save", exact: true });

/**
 * The chart `generateSmallPattern` makes, as the editable file it was saved to (G-096): the same photo, the same 50 × 31
 * stitches in 16 colours, its photo inside it. To make it again after generation changes on purpose: generate the small
 * pattern, export the editable file, and replace this one.
 */
export const SAMPLE_CHART = path.join(__dirname, "..", "fixtures", "sample_editable.json");

/**
 * Opens the saved sample chart: **what a spec uses when it needs a chart and is not about generating one.** Nothing is
 * asked of the server for the chart itself, so the case is quicker, cannot fail on a busy processor, and runs against the
 * live site without spending one of its six jobs a minute. The chart arrives as a generated one does: undo has nothing
 * to step back to, the thread list is shown, the photo is there for the photo views and for Regenerate.
 *
 * What differs from generating, for the spec that cares: the size choice on the photo settings is left as it was, and the
 * colour count is not set by a recommendation.
 */
export async function openSmallChart(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Open pattern file").setInputFiles(SAMPLE_CHART);
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
}

/**
 * Uploads the sample photo and generates the small chart. **Only for a spec that is about generation** (or about what
 * generating leaves behind: usage counts, the size choice); every other spec opens the saved chart with `openSmallChart`.
 */
export async function generateSmallPattern(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  // A generated chart stays in the Photo workspace, where generations are tried (G-095); these specs go on to edit it.
  await showWorkspace(page, "Edit");
}

/**
 * A chosen photo has been read and decoded: the Photo tab offers Generate only from then. Specs waited for the file's name
 * in the top panel before, which the panel no longer shows (G-079).
 */
export async function expectPhotoLoaded(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /^(Generate pattern|Regenerate)$/ })).toBeVisible({ timeout: 15_000 });
}
