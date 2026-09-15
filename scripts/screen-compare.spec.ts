import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

/**
 * G-036 M3 screen comparison (D135): the same actions on the pre-viewport build (REFERENCE_URL) and the current build
 * (CANDIDATE_URL), screenshotted at device pixel ratios 1, 1.25, 1.5 and 2, including fractional scroll offsets.
 * Owner decisions allow grid-line pixels to move by about a level and scaled photo pixels by up to 16, so each state
 * reports the distribution of per-pixel differences and fails on anything larger or widespread (limits below): a
 * misplaced canvas, border or scroll position shows up as large differences across many pixels.
 *
 * Usage: serve both builds, then
 *   REFERENCE_URL=http://127.0.0.1:30220 CANDIDATE_URL=http://127.0.0.1:30210 npm run compare:screen
 */

const REFERENCE_URL = process.env.REFERENCE_URL ?? "http://127.0.0.1:30220";
const CANDIDATE_URL = process.env.CANDIDATE_URL ?? "http://127.0.0.1:30210";
const FIXTURE = path.join(__dirname, "..", "tests", "e2e", "fixtures", "sample.png");
const RATIOS = [1, 1.25, 1.5, 2];
/**
 * Largest per-channel difference any pixel may show, and the share of pixels allowed to differ by more than 2. At whole
 * device pixel ratios the screen follows the canvas bytes (grid bands within a level or two of the old strokes). At
 * fractional ratios Chromium's compositor resamples a canvas scrolled away from the chart origin slightly differently
 * from the old full-size canvas, whatever its placement (left/top, transform, will-change: measured 2026-09-15, up to
 * 10 levels on grid-line edge pixels, 1.1% of pixels at 1.25). A misplaced canvas, border or scroll position differs
 * far more widely, so these limits still catch it.
 */
const limitsFor = (ratio: number) => (Number.isInteger(ratio) ? { maxDelta: 2, maxShareAboveTwo: 0.005 } : { maxDelta: 16, maxShareAboveTwo: 0.02 });

async function openChart(browser: Browser, url: string, deviceScaleFactor: number): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor });
  const page = await context.newPage();
  await page.goto(url);
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas")).toBeVisible({ timeout: 30_000 });
  await settle(page);
  return { context, page };
}

async function settle(page: Page, extraMs = 400) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.waitForTimeout(extraMs);
}

const scroller = (page: Page) => page.locator("div.overflow-auto").first();

async function scrollTo(page: Page, left: number, top: number) {
  await scroller(page).evaluate((el, [l, t]) => {
    el.scrollLeft = l;
    el.scrollTop = t;
  }, [left, top]);
}

const STATES: Array<[string, (page: Page) => Promise<void>, number?]> = [
  ["fitted, Color", async () => undefined],
  [
    "zoomed in 3 steps, scrolled to (137.5, 91.25)",
    async (page) => {
      for (let i = 0; i < 3; i++) {
        await page.getByRole("button", { name: "Zoom in" }).click();
        await settle(page, 150);
      }
      await scrollTo(page, 137.5, 91.25);
    },
  ],
  ["Black & white", (page) => page.keyboard.press("2")],
  ["Grid + photo", (page) => page.keyboard.press("4")],
  ["Original photo", (page) => page.keyboard.press("5")],
  ["Realistic preview", (page) => page.keyboard.press("3"), 3000],
  [
    "Color, one colour highlighted",
    async (page) => {
      await page.keyboard.press("1");
      await page.getByRole("button", { name: "Highlight" }).click();
      await page.locator('[data-testid="legend-color-row"]').nth(0).click();
    },
  ],
  ["scrolled to the far corner", (page) => scrollTo(page, 1e6, 1e6)],
];

interface Difference {
  size?: string;
  pixels: number;
  same: number;
  one: number;
  two: number;
  upTo16: number;
  above16: number;
  max: number;
}

async function compare(page: Page, a: Buffer, b: Buffer): Promise<Difference> {
  return page.evaluate(
    async ([a, b]) => {
      const load = async (base64: string) => {
        const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
      };
      const [x, y] = await Promise.all([load(a), load(b)]);
      const result = { pixels: x.width * x.height, same: 0, one: 0, two: 0, upTo16: 0, above16: 0, max: 0 };
      if (x.width !== y.width || x.height !== y.height) return { ...result, size: `${x.width}×${x.height} vs ${y.width}×${y.height}` };
      for (let i = 0; i < x.data.length; i += 4) {
        const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]));
        result.max = Math.max(result.max, d);
        if (d === 0) result.same++;
        else if (d === 1) result.one++;
        else if (d === 2) result.two++;
        else if (d <= 16) result.upTo16++;
        else result.above16++;
      }
      return result;
    },
    [a.toString("base64"), b.toString("base64")]
  );
}

for (const ratio of RATIOS) {
  test(`screen comparison at device pixel ratio ${ratio}`, async ({ browser }) => {
    test.setTimeout(600_000);
    const reference = await openChart(browser, REFERENCE_URL, ratio);
    const candidate = await openChart(browser, CANDIDATE_URL, ratio);
    const rows: string[] = [];
    const failures: string[] = [];
    const { maxDelta, maxShareAboveTwo } = limitsFor(ratio);
    try {
      for (const [label, act, waitMs] of STATES) {
        await act(reference.page);
        await act(candidate.page);
        await settle(reference.page, waitMs ?? 400);
        await settle(candidate.page, waitMs ?? 400);
        const shot = (page: Page) => scroller(page).screenshot({ animations: "disabled", caret: "hide" });
        const d = await compare(candidate.page, await shot(reference.page), await shot(candidate.page));
        const aboveTwo = d.upTo16 + d.above16;
        rows.push(
          `${label}: ${d.size ?? `${d.pixels} px`}; same ${d.same}, 1 level ${d.one}, 2 levels ${d.two}, 3–16 ${d.upTo16}, >16 ${d.above16}; max ${d.max}`
        );
        // Photo views compare scaled images, which the canvas parity rule already allows 16 levels.
        const photoView = /photo|Realistic/.test(label);
        if (d.size || d.max > (photoView ? 16 : maxDelta) || aboveTwo / d.pixels > maxShareAboveTwo) failures.push(label);
      }
    } finally {
      console.log(`DPR ${ratio}\n  ${rows.join("\n  ")}`);
      test.info().annotations.push({ type: "screen-comparison", description: rows.join(" | ") });
      await reference.context.close();
      await candidate.context.close();
    }
    expect(failures, rows.join("\n")).toEqual([]);
  });
}
