import { test, expect } from "@playwright/test";
import { chooseExport, openSmallChart, showWorkspace } from "./helpers/app";

/**
 * G-095 M5: the Export workspace. What to make is a set of buttons, and beside them are exactly the settings the chosen
 * export reads; a paged export shows where its pages fall on the chart.
 */

test("the kinds are buttons in three groups, with the editable file chosen to begin with", async ({ page }) => {
  await openSmallChart(page);
  await showWorkspace(page, "Export");
  const kinds = page.getByRole("radiogroup", { name: "Export" });
  await expect(kinds.getByRole("radio")).toHaveText([
    "A4 pages (ZIP)",
    "PDF for Pattern Keeper",
    "Full chart PNG",
    "Realistic preview PNG",
    "Pixel art PNG (1 px per stitch)",
    "Editable pattern (.json)",
    "OXS chart for other programs (.oxs)",
    "Palette file (.json)",
  ]);
  await expect(kinds.getByRole("radio", { name: "Editable pattern (.json)" })).toHaveAttribute("aria-checked", "true");
  // Nothing on the page is a list to pick the kind from any more.
  await expect(page.getByRole("combobox", { name: "Export" })).toHaveCount(0);
});

test("the settings shown are the chosen export's own, and no other's", async ({ page }) => {
  await openSmallChart(page);
  await showWorkspace(page, "Export");
  const settings = page.getByTestId("export-settings");
  const tone = settings.getByRole("group", { name: "Print in" });
  const cell = settings.getByLabel("A4 cell size in millimetres");
  const overlap = settings.getByRole("group", { name: "A4/PDF overlap" });
  const pages = settings.getByTestId("a4-page-count");
  const canvas = settings.getByLabel("Canvas in exported preview");
  const shown = async () => ({
    tone: (await tone.count()) > 0,
    cell: (await cell.count()) > 0,
    overlap: (await overlap.count()) > 0,
    pages: (await pages.count()) > 0,
    canvas: (await canvas.count()) > 0,
  });
  const none = { tone: false, cell: false, overlap: false, pages: false, canvas: false };

  const expected: Record<string, typeof none> = {
    editable: none,
    oxs: none,
    palette: none,
    "pixel-art": none,
    "png-realistic": { ...none, canvas: true },
    "png-color": { ...none, tone: true },
    "pdf-color": { ...none, tone: true, overlap: true, pages: true },
    "a4-color": { ...none, tone: true, cell: true, overlap: true, pages: true },
  };
  for (const [kind, settingsShown] of Object.entries(expected)) {
    await chooseExport(page, kind);
    expect(await shown(), kind).toEqual(settingsShown);
    // The author is on every one of them.
    await expect(settings.getByLabel("Author name")).toBeVisible();
  }
});

test("a printed kind keeps the choice of colour or black and white from one printed kind to the next", async ({ page }) => {
  await openSmallChart(page);
  await showWorkspace(page, "Export");
  await chooseExport(page, "a4-bw");
  const tone = page.getByRole("group", { name: "Print in" });
  await expect(tone.getByRole("button", { name: "Black & white" })).toHaveAttribute("aria-pressed", "true");

  // Another printed kind, pressed without touching the switch: still black and white, and that is what is exported.
  await page.getByRole("radiogroup", { name: "Export" }).getByRole("radio", { name: "Full chart PNG" }).click();
  await expect(tone.getByRole("button", { name: "Black & white" })).toHaveAttribute("aria-pressed", "true");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("sample_bw.png");
});

test("a paged export shows where its pages fall on the chart, and only while it is the one chosen", async ({ page }) => {
  await openSmallChart(page);
  const cuts = page.getByTestId("page-cuts");
  await showWorkspace(page, "Export");
  await expect(cuts).toHaveCount(0);

  // More than one page, and the count beside the kind says how many.
  await chooseExport(page, "a4-color");
  await page.getByLabel("A4 cell size in millimetres").fill("5.5");
  await page.getByLabel("A4 cell size in millimetres").blur();
  const count = (await page.getByTestId("a4-page-count").innerText()).match(/^(\d+) × (\d+) pages/)!;
  const pages = Number(count[1]) * Number(count[2]);
  await expect(cuts.locator("[data-page]")).toHaveCount(pages);
  // Each carries the letter its printed page does.
  await expect(cuts.locator("[data-page]").first()).toHaveText("A");
  await expect(cuts.locator("[data-page]").nth(1)).toHaveText("B");

  // Each outline lies on the chart, and together they cover it from its first stitch to its last.
  const frame = (await page.getByTestId("chart-frame").boundingBox())!;
  const boxes = await cuts.locator("[data-page]").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  const left = Math.min(...boxes.map((b) => b.left));
  const right = Math.max(...boxes.map((b) => b.right));
  const top = Math.min(...boxes.map((b) => b.top));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  expect(Math.abs(left - frame.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(top - frame.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(right - (frame.x + frame.width))).toBeLessThanOrEqual(2);
  expect(Math.abs(bottom - (frame.y + frame.height))).toBeLessThanOrEqual(2);

  // A kind without pages, or another workspace, has none.
  await chooseExport(page, "oxs");
  await expect(cuts).toHaveCount(0);
  await chooseExport(page, "pdf-color");
  await expect(cuts.locator("[data-page]").first()).toBeVisible();
  await expect(cuts.locator("[data-page]").first()).toHaveText(""); // the PDF's pages carry no letter
  await showWorkspace(page, "Edit");
  await expect(cuts).toHaveCount(0);
});

test("Export and Export all are under the panel whatever kind is chosen, and the chart is only looked at here", async ({ page }) => {
  await openSmallChart(page);
  await showWorkspace(page, "Export");
  for (const kind of ["editable", "a4-color", "png-realistic"]) {
    await chooseExport(page, kind);
    await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Export all/ })).toBeEnabled();
  }
  await expect(page.getByTestId("tool-in-hand")).toHaveText("Pan");
});
