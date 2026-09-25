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

/** Uploads the sample photo and generates the small chart the specs are written against. */
export async function generateSmallPattern(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
}
