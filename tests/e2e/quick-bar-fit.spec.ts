import { test, expect, type Page } from "@playwright/test";
import { openSmallChart, showWorkspace } from "./helpers/app";

/**
 * The quick bar's fit (G-118): every tool of every workspace, at the four desktop widths the goal names, measured for what
 * the bar shows. A control is in view when the whole of it is inside the bar and inside the track that scrolls it, and the
 * point at its middle is its own (nothing drawn over it).
 *
 * The bar keeps its height, no divider opens it, and every control on it, the options and the bar's end (Apply here,
 * Cancel, Crop's pair, Deselect) alike, is in view and under nothing: what does not fit is compact or in More (D340, D341).
 */

const WIDTHS = [1024, 1280, 1440, 1920] as const;
const WORKSPACES = ["Photo", "Edit", "Export"] as const;
const BAR_HEIGHT = 44;

interface Measured {
  height: number;
  /** The accessible names of the options out of view. */
  hidden: string[];
  /** The same for the controls in the bar's end: none is allowed. */
  endHidden: string[];
  /** Whether the first thing drawn in the track is a divider, which parts nothing there. */
  opensWithDivider: boolean;
}

/** Runs in the page: what of the bar is in view. */
async function measure(page: Page): Promise<Measured> {
  return page.getByTestId("quick-bar").evaluate((bar) => {
    const name = (el: Element) => el.getAttribute("aria-label") ?? el.getAttribute("title") ?? (el.textContent ?? "").trim() ?? el.tagName;
    const barBox = bar.getBoundingClientRect();
    const end = bar.querySelector('[data-testid="quick-bar-end"]');
    const inside = (r: DOMRect, c: DOMRect) =>
      r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5;
    const hidden: string[] = [];
    const endHidden: string[] = [];
    const controls = bar.querySelectorAll('button, input, select, [role="radio"], [role="slider"]');
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // not drawn (sr-only text, a closed menu)
      const inEnd = end?.contains(el) ?? false;
      const box = inEnd ? barBox : (el.closest(".at-tool-track")?.getBoundingClientRect() ?? barBox);
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const own = top !== null && (el === top || el.contains(top) || top.contains(el));
      if (!inside(r, box) || !inside(r, barBox) || !own) (inEnd ? endHidden : hidden).push(name(el));
    }
    // A divider opens the bar when one is drawn left of every control the track draws.
    const drawn = (els: Iterable<Element>) =>
      [...els]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0 && (!end || r.right <= end.getBoundingClientRect().left));
    const firstControl = Math.min(...drawn(controls).map((r) => r.left));
    const opensWithDivider = drawn(bar.querySelectorAll(".at-divider")).some((r) => r.left < firstControl);
    return { height: Math.round(barBox.height), hidden, endHidden, opensWithDivider };
  });
}

/** The names of the tools the rail offers in the workspace shown. */
async function railTools(page: Page): Promise<string[]> {
  return page
    .getByTestId("tool-rail")
    .locator("button[aria-pressed]:not([aria-disabled])")
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label") ?? ""));
}

for (const width of WIDTHS) {
  test(`at ${width} px the bar keeps its height and every control on it is in view, for every tool`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 800 });
    await openSmallChart(page);
    const report: string[] = [];
    for (const workspace of WORKSPACES) {
      await showWorkspace(page, workspace);
      for (const tool of await railTools(page)) {
        await page.getByTestId("tool-rail").getByRole("button", { name: tool, exact: true }).click();
        const m = await measure(page);
        const where = `${workspace} / ${tool} at ${width} px`;
        expect(m.height, `${where}: the bar's height`).toBe(BAR_HEIGHT);
        expect(m.endHidden, `${where}: the bar's end`).toEqual([]);
        expect(m.opensWithDivider, `${where}: a divider opens the bar`).toBe(false);
        if (m.hidden.length > 0) report.push(`${where}: ${m.hidden.join(", ")}`);
      }
    }
    // Every tool is checked before failing, so one run names all that do not fit.
    expect(report, "out of view").toEqual([]);
  });
}
