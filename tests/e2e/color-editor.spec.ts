import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

// G-033: the swatch-aware color editor. Opens on the color's own swatch, compares swatches on hover and focus, applies
// picks while staying open, and closes with Done, Cancel, Escape or a click outside.
const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function generate(page: Page, palette: "Full range" | "DMC") {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Loaded: sample.png")).toBeVisible();
  await page.getByRole("radio", { name: /Small/ }).check();
  await page.getByRole("button", { name: palette, exact: true }).click();
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(page.getByRole("main").locator("canvas").first()).toBeVisible({ timeout: 30_000 });
}

const editButtons = (page: Page) => page.getByRole("button", { name: /^Edit / });
const editorPanel = (page: Page) => page.getByRole("dialog", { name: /^Edit color / });
const legendNameOf = (label: string) => label.replace(/^(DMC|Cosmo|Anchor) /, "");
/** Swatches in the open editor that aren't the current color, never the tab buttons. */
const otherSwatches = (page: Page) => editorPanel(page).getByTestId("swatch-grid").locator('button[aria-pressed="false"]');

async function openFirstEditor(page: Page): Promise<string> {
  const button = editButtons(page).first();
  const name = (await button.getAttribute("aria-label"))!.replace(/^Edit /, "");
  await button.click();
  await expect(editorPanel(page)).toBeVisible();
  return name;
}

test("a DMC color opens on its marked swatch, inside the grid's view; hover and focus compare; a pick applies and stays open", async ({ page }) => {
  const errors = collectErrors(page);
  await generate(page, "DMC");
  const originalName = await openFirstEditor(page);
  const panel = editorPanel(page);

  const current = panel.locator('[data-current="true"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute("aria-pressed", "true");
  expect(legendNameOf((await current.getAttribute("aria-label"))!)).toBe(originalName);
  const gridBox = (await panel.getByTestId("swatch-grid").boundingBox())!;
  const currentBox = (await current.boundingBox())!;
  expect(currentBox.y).toBeGreaterThanOrEqual(gridBox.y);
  expect(currentBox.y + currentBox.height).toBeLessThanOrEqual(gridBox.y + gridBox.height);

  const readout = panel.getByTestId("swatch-comparison");
  await expect(readout).toContainText("on screen");
  const candidates = otherSwatches(page);
  const hovered = candidates.nth(4);
  await hovered.hover();
  const hoveredLabel = (await hovered.getAttribute("aria-label"))!;
  await expect(readout).toHaveText(new RegExp(`^${hoveredLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(: .+)?$`));
  await expect(readout).toContainText(/% (lighter|darker|more saturated|less saturated)|^DMC /);

  const focused = candidates.nth(9);
  await focused.focus();
  await expect(readout).toContainText((await focused.getAttribute("aria-label"))!);

  const pickedLabel = (await hovered.getAttribute("aria-label"))!;
  await hovered.click();
  await expect(page.getByRole("button", { name: `Edit ${legendNameOf(pickedLabel)}`, exact: true })).toBeVisible();
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-current="true"]')).toHaveAttribute("aria-label", pickedLabel);
  expect(errors).toEqual([]);
});

test("Escape and Cancel return the color to how it was when opened; Done and a click outside keep the pick", async ({ page }) => {
  await generate(page, "DMC");
  const originalName = await openFirstEditor(page);
  const pickAnother = async () => {
    const other = otherSwatches(page).nth(3);
    const label = (await other.getAttribute("aria-label"))!;
    await other.click();
    await expect(page.getByRole("button", { name: `Edit ${legendNameOf(label)}`, exact: true })).toBeVisible();
    return legendNameOf(label);
  };
  const reopen = async (name: string) => {
    await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
    await expect(editorPanel(page)).toBeVisible();
  };

  await pickAnother();
  await page.keyboard.press("Escape");
  await expect(editorPanel(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Edit ${originalName}`, exact: true })).toBeVisible();

  await reopen(originalName);
  await pickAnother();
  await editorPanel(page).getByRole("button", { name: "Cancel" }).click();
  await expect(editorPanel(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Edit ${originalName}`, exact: true })).toBeVisible();

  await reopen(originalName);
  const keptByDone = await pickAnother();
  await editorPanel(page).getByRole("button", { name: "Done" }).click();
  await expect(editorPanel(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Edit ${keptByDone}`, exact: true })).toBeVisible();

  await reopen(keptByDone);
  const keptByOutsideClick = await pickAnother();
  await page.getByRole("heading", { name: "Cross-Stitch Pattern Generator" }).click();
  await expect(editorPanel(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Edit ${keptByOutsideClick}`, exact: true })).toBeVisible();
});

test("clicking another color's swatch button retargets the editor instead of closing it", async ({ page }) => {
  await generate(page, "DMC");
  await openFirstEditor(page);
  const second = editButtons(page).nth(1);
  const secondName = (await second.getAttribute("aria-label"))!.replace(/^Edit /, "");
  await second.click();
  await expect(editorPanel(page)).toHaveCount(1);
  await expect(editorPanel(page)).toHaveAttribute("aria-label", `Edit color ${secondName}`);
});

test("a custom color opens on Full range, and a Full range drag previews live and commits exactly one undo step", async ({ page }) => {
  await generate(page, "Full range");
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeDisabled();
  await openFirstEditor(page);
  const panel = editorPanel(page);
  await expect(panel.getByRole("button", { name: "Full range", exact: true })).toHaveAttribute("aria-pressed", "true");

  const saturation = panel.locator(".react-colorful__saturation");
  const box = (await saturation.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(box.x + box.width * (0.3 + step * 0.05), box.y + box.height * (0.3 + step * 0.04));
  await expect(undo).toBeDisabled(); // still only a preview while dragging
  await page.mouse.up();
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();
});

test("a color picked from the DMC tab reopens on DMC with its swatch marked, also after saving and reopening the file", async ({ page }) => {
  await generate(page, "Full range");
  await openFirstEditor(page);
  let panel = editorPanel(page);
  await panel.getByRole("button", { name: "DMC", exact: true }).click();
  const choice = otherSwatches(page).nth(6);
  const label = (await choice.getAttribute("aria-label"))!;
  await choice.click();
  await panel.getByRole("button", { name: "Done" }).click();

  const name = legendNameOf(label);
  const reopenAndCheck = async () => {
    await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
    panel = editorPanel(page);
    await expect(panel.getByRole("button", { name: "DMC", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(panel.locator('[data-current="true"]')).toHaveAttribute("aria-label", label);
    await panel.getByRole("button", { name: "Done" }).click();
  };
  await reopenAndCheck();

  await page.getByLabel("Export").selectOption("editable");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  await page.getByLabel("Open pattern file").setInputFiles((await download.path())!);
  await expect(page.getByRole("button", { name: `Edit ${name}`, exact: true })).toBeVisible();
  await reopenAndCheck();
});
