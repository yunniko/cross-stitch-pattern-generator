import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * G-045: New opens the start screen, and choosing a card there replaces the one chart this browser autosaves — so the
 * design puts a confirm in between (Atelier, B · Confirm new chart). These cover the path the other specs skip by
 * addressing the file input directly: that reaching the start screen costs nothing, that Keep editing really keeps,
 * and that Start new chart really discards.
 */

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

async function generateSmallPattern(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible({ timeout: 30_000 });
}

test("New opens the start screen without touching the chart, and Back returns to it", async ({ page }) => {
  await generateSmallPattern(page);
  // The chart's own identity, not Undo: a first Generate is the undo baseline (workspace.tsx, isFirst), so an
  // untouched chart has nothing to undo and Undo's state says nothing about whether this chart came back.
  const before = await page.getByTestId("chart-frame").getAttribute("data-cell-size");

  await page.getByRole("button", { name: "New chart" }).click();
  await expect(page.getByRole("button", { name: /^Choose a photo/ })).toBeVisible();
  await expect(page.getByTestId("chart-frame")).not.toBeVisible(); // covered, not destroyed: its pixels must survive
  await expect(page.getByRole("dialog", { name: "Start a new chart?" })).toHaveCount(0); // nothing destructive yet

  await page.getByRole("button", { name: /^Back to / }).click();
  await expect(page.getByTestId("chart-frame")).toBeVisible();
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-cell-size", before!); // the same chart came back
  // ...and it is actually painted. A remounted canvas keeps its size attributes but loses every pixel, which is how
  // this regression reached production once: data-cell-size cannot tell a drawn chart from a blank one.
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-painted-rect", /\d+,\d+,\d+,\d+/);
  const painted = await page.getByRole("main").locator("canvas").evaluate((el: HTMLCanvasElement) => {
    const { data } = el.getContext("2d")!.getImageData(0, 0, el.width, el.height);
    let lit = 0;
    for (let i = 3; i < data.length; i += 4 * 97) if (data[i] !== 0) lit++;
    return lit;
  });
  expect(painted, "the chart canvas still has pixels after Back").toBeGreaterThan(0);
});

test("choosing a card with a chart open asks first, and Keep editing keeps it", async ({ page }) => {
  await generateSmallPattern(page);
  const before = await page.getByTestId("chart-frame").getAttribute("data-cell-size");

  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();

  const dialog = page.getByRole("dialog", { name: "Start a new chart?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("replaces");
  await expect(dialog.getByRole("button", { name: "Export the editable .json first" })).toBeVisible();

  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Width in stitches")).toHaveCount(0); // the empty-grid panel never opened

  await page.getByRole("button", { name: /^Back to / }).click();
  await expect(page.getByTestId("chart-frame")).toHaveAttribute("data-cell-size", before!);
});

test("Start new chart discards the chart and its autosave, and the discard survives a reload", async ({ page }) => {
  await generateSmallPattern(page);
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });

  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await page.getByRole("dialog", { name: "Start a new chart?" }).getByRole("button", { name: "Start new chart" }).click();

  await page.getByLabel("Width in stitches").fill("20");
  await page.getByLabel("Height in stitches").fill("15");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(/20 × 15, 0 stitches, 0 colors/)).toBeVisible();

  // The old chart is gone from the autosave, not merely off screen.
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByText(/20 × 15, 0 stitches, 0 colors/)).toBeVisible({ timeout: 15_000 });
});

test("with no chart open, a card acts at once — there is nothing to replace", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Start an empty grid/ }).click();
  await expect(page.getByRole("dialog", { name: "Start a new chart?" })).toHaveCount(0);
  await expect(page.getByLabel("Width in stitches")).toBeVisible();
});

/**
 * D164. The start screen covers a chart that still exists, so every control that would reach it must be inert *and*
 * look inert: a row where three read dead and one reads clickable is the defect the Owner named. Appearance is
 * asserted from computed style because no DOM check can see it -- a disabled Undo once kept full-strength ink and
 * still lit under the pointer, and every presence assertion passed.
 */
const INK = "rgb(232, 236, 239)"; // --at-ink
const FAINT = "rgb(125, 134, 141)"; // --at-faint

test("the start screen leaves nothing live over the chart it covers, and every disabled control looks it (D164)", async ({ page }) => {
  await generateSmallPattern(page);
  await page.getByRole("button", { name: "New chart" }).click();
  await expect(page.getByRole("button", { name: /^Choose a photo/ })).toBeVisible();

  for (const name of ["Brush", "Fill", "Select", "Move", "Pan", "Zoom", "New chart", "Zoom in", "Zoom out"]) {
    await expect(page.getByRole("button", { name, exact: true }), `${name} still reaches the covered chart`).toBeDisabled();
  }
  await expect(page.getByRole("button", { name: "Mirror left half" })).toBeDisabled();
  for (const tab of ["Photo", "Chart", "Threads"]) {
    await expect(page.getByRole("tab", { name: tab }), `the ${tab} tab is still live`).toBeDisabled();
  }
  // 1b draws no Undo, no Redo and no exports here, so they are absent rather than disabled.
  for (const gone of [/^Undo$/, /^Redo$/, /^Export all/]) {
    await expect(page.getByRole("button", { name: gone })).toHaveCount(0);
  }

  // Each disabled control wears one of the two designed looks: an icon faded to 40%, or a label dropped to --at-faint.
  // Settle first: these controls carry `transition-colors`, and a colour read mid-flight is neither look. The
  // selected Photo tab travels --at-ink -> --at-faint as it disables and passes through muted on the way.
  await page.waitForTimeout(400);
  const boxes = await page.evaluate(() => {
    const out: Array<{ label: string; look: string; cx: number; cy: number }> = [];
    for (const el of Array.from(document.querySelectorAll("button"))) {
      if (!el.disabled) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      out.push({
        label: (el.getAttribute("aria-label") || el.textContent || "?").trim().slice(0, 30),
        look: `${cs.opacity}|${cs.color}`,
        cx: r.x + r.width / 2,
        cy: r.y + r.height / 2,
      });
    }
    return out;
  });
  expect(boxes.length, "the start screen disables controls at all").toBeGreaterThan(8);
  for (const { label, look } of boxes) {
    expect(look, `${label} renders at full-strength ink while disabled`).not.toBe(`1|${INK}`);
    expect(look.startsWith("0.4|") || look.endsWith(`|${FAINT}`), `${label} wears an undesigned disabled look: ${look}`).toBe(true);
  }

  // And none of them answers the pointer -- the hover is written `enabled:hover:`, so it cannot apply here.
  const readAt = (x: number, y: number) =>
    page.evaluate(([px, py]: [number, number]) => {
      const el = document.elementFromPoint(px, py)?.closest("button");
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { label: (el.getAttribute("aria-label") || el.textContent || "?").trim().slice(0, 30), style: `${cs.color}|${cs.backgroundColor}` };
    }, [x, y] as [number, number]);

  for (const { label, cx, cy } of boxes) {
    await page.mouse.move(2, 2);
    const resting = await readAt(cx, cy);
    if (!resting || resting.label !== label) continue; // something overlaps it; it cannot be hovered honestly
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(120); // transition-colors, or we compare a colour still in flight
    const hovered = await readAt(cx, cy);
    expect(hovered?.style, `${label} lights up under the pointer while disabled`).toBe(resting.style);
  }
});
