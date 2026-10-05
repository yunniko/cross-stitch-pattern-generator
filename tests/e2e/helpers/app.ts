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
}

/**
 * A chosen photo has been read and decoded: the Photo tab offers Generate only from then. Specs waited for the file's name
 * in the top panel before, which the panel no longer shows (G-079).
 */
export async function expectPhotoLoaded(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /^(Generate pattern|Regenerate)$/ })).toBeVisible({ timeout: 15_000 });
}
