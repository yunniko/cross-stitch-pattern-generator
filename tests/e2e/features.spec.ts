import { test, expect, type Page } from "@playwright/test";
import { FIXTURE, expectPhotoLoaded, openSmallChart, showWorkspace } from "./helpers/app";
import { registerReader, uniqueEmail } from "./helpers/auth";
import { clearPersonFeatures, clearSiteFeatures, putOnTierWithSet, setSiteFeatures, setUserFeatures } from "./helpers/features";

/**
 * G-102 M2: the states come from the database (the site's, the tier's set, the person's own), a hidden feature is absent,
 * a locked one is greyed with its note, and the server refuses a request for either by name. The rows are written by the
 * specs themselves; the admin pages are M3's.
 *
 * Every spec touches only the ids it names and puts them back, so the rest of the suite sees everything on; they are
 * tagged @alone because the site's rows are state every worker shares.
 */

const SITE_IDS = ["tool.text", "export.a4", "generation.vivid", "brand.cosmo", "dither.atkinson"];

async function jobRequest(page: Page, settings: Record<string, unknown>): Promise<{ status: number; error?: string }> {
  // The photo id does not matter: the refusal comes before the processor sees the request.
  return page.evaluate(async (body) => {
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, error: (await response.json().catch(() => ({})))?.error };
  }, settings);
}

test.describe("the site's states", () => {
  test.beforeEach(() =>
    setSiteFeatures({
      "tool.text": "locked",
      "export.a4": "hidden",
      "generation.vivid": "locked",
      "brand.cosmo": "hidden",
      "dither.atkinson": "locked",
    })
  );
  test.afterEach(() => clearSiteFeatures(SITE_IDS));

  test("a visitor gets them: the locked are greyed with the note, the hidden absent, and the key of either does nothing @alone", async ({
    page,
  }) => {
    await openSmallChart(page);
    const rail = page.getByTestId("tool-rail");
    // Locked: greyed, reachable by keyboard, named with its note, and taking no press.
    const text = rail.getByRole("button", { name: /^Text/ });
    await expect(text).toHaveAttribute("aria-disabled", "true");
    await expect(text).toHaveAccessibleName("Text: Text is not available to you.");
    await text.click({ force: true }); // forced: Playwright reads aria-disabled as not enabled, which is the point
    await expect(page.getByTestId("tool-in-hand")).toHaveText("Brush");
    await page.keyboard.press("t");
    await expect(page.getByTestId("tool-in-hand")).toHaveText("Brush");

    await showWorkspace(page, "Export");
    await expect(page.getByRole("radiogroup", { name: "Export" }).getByRole("radio", { name: "A4 pages (ZIP)" })).toHaveCount(0);
    await expect(page.getByRole("radiogroup", { name: "Export" }).getByRole("radio", { name: "PDF for Pattern Keeper" })).toBeVisible();

    await showWorkspace(page, "Photo");
    await page.getByRole("tab", { name: "Chart settings" }).click();
    await expect(page.locator('[data-feature-locked="generation.vivid"]')).toHaveAttribute(
      "title",
      "Vivid colour detail is not available to you."
    );
    await expect(page.getByRole("button", { name: "Cosmo", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "DMC", exact: true })).toBeVisible();
    const atkinson = page.getByRole("radiogroup", { name: "Dither" }).getByRole("radio", { name: "Atkinson" });
    await expect(atkinson).toBeDisabled();
  });

  test("the server refuses a request for a locked or hidden feature by name, and lets one asking for nothing through to the processor @alone", async ({
    page,
  }) => {
    await page.goto("/");
    const base = { longerSideStitches: 20, colorCount: 6, photoId: "none" };
    expect(await jobRequest(page, { ...base, vivid: true })).toMatchObject({
      status: 403,
      error: "Vivid colour detail is not available to you.",
    });
    expect(await jobRequest(page, { ...base, paletteMode: "cosmo" })).toMatchObject({
      status: 403,
      error: "Cosmo is not available to you.",
    });
    expect(await jobRequest(page, { ...base, ditherMode: "atkinson" })).toMatchObject({
      status: 403,
      error: "Atkinson is not available to you.",
    });
    // The same settings at their "asks for nothing" values are not refused here: the processor answers (and refuses the
    // photo id, which is not the point).
    const through = await jobRequest(page, { ...base, vivid: false, paletteMode: "full", ditherMode: "off" });
    expect(through.status).not.toBe(403);

    const exportRequest = (body: Record<string, unknown>) =>
      page.evaluate(async (b) => {
        const r = await fetch("/api/exports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
        return { status: r.status, error: (await r.json().catch(() => ({})))?.error };
      }, body);
    expect(await exportRequest({ kind: "a4-color" })).toMatchObject({ status: 403, error: "A4 pages (ZIP) is not available to you." });
    expect((await exportRequest({ kind: "a4-bw" })).status).toBe(403);
    expect((await exportRequest({ kind: "png-color" })).status).not.toBe(403);
  });
});

test.describe("a person's own states and their tier's set", () => {
  const email = uniqueEmail("features");
  const setName = `e2e set ${email}`;
  test.afterEach(() => clearPersonFeatures(email, setName));

  test("the person's state wins over the tier's set, which wins over the site's; an explicit on lifts a lock @alone", async ({ page }) => {
    await registerReader(page, email);
    await setSiteFeatures({ "tool.text": "locked", "tool.fill": "locked" });
    try {
      // The tier's set lifts the site's lock on Text and hides Fill; the person's own state hides Text after all.
      await putOnTierWithSet(email, setName, { "tool.text": "on", "tool.fill": "hidden" });
      await setUserFeatures(email, { "tool.text": "hidden", "tool.line": "locked" });
      await openSmallChart(page);
      const rail = page.getByTestId("tool-rail");
      await expect(rail.getByRole("button", { name: "Text", exact: true })).toHaveCount(0);
      await expect(rail.getByRole("button", { name: "Fill", exact: true })).toHaveCount(0);
      await expect(rail.getByRole("button", { name: /^Line/ })).toHaveAttribute("aria-disabled", "true");
      await expect(rail.getByRole("button", { name: "Brush", exact: true })).toBeEnabled();

      // Off the tier (the subscription gone), the site's lock on Fill is back, as a lock, not hidden.
      await clearPersonFeatures(email);
      await setUserFeatures(email, { "tool.text": "on" });
      await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
      await page.reload();
      await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
      await expect(rail.getByRole("button", { name: /^Fill/ })).toHaveAttribute("aria-disabled", "true");
      await expect(rail.getByRole("button", { name: "Text", exact: true })).toBeEnabled();
    } finally {
      await clearSiteFeatures(["tool.text", "tool.fill"]);
    }
  });
});

test("a stored setting naming a feature the person cannot use is read as its default: a new photo starts in the full range @alone", async ({
  page,
}) => {
  await setSiteFeatures({ "brand.dmc": "hidden" });
  try {
    await page.goto("/");
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("cross-stitch-pattern-generator:options:v1") ?? "{}");
      localStorage.setItem(
        "cross-stitch-pattern-generator:options:v1",
        JSON.stringify({ ...stored, paletteMode: "dmc", defaultPaletteMode: "dmc" })
      );
    });
    await page.reload();
    await page.getByLabel("Image").setInputFiles(FIXTURE);
    await expectPhotoLoaded(page);
    await expect(page.getByTestId("panel").getByRole("button", { name: "Full range", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("panel").getByRole("button", { name: "DMC", exact: true })).toHaveCount(0);
  } finally {
    await clearSiteFeatures(["brand.dmc"]);
  }
});

test("an admin's change reaches an open editor once the states held expire, with no reload @alone", async ({ page }) => {
  // The suite's servers keep states for 5 seconds (FEATURES_REFRESH_SECONDS).
  await openSmallChart(page);
  const text = page.getByTestId("tool-rail").getByRole("button", { name: /^Text/ });
  await expect(text).not.toHaveAttribute("aria-disabled", "true");
  try {
    await setSiteFeatures({ "tool.text": "locked" });
    await expect(text).toHaveAttribute("aria-disabled", "true", { timeout: 15_000 });
    await clearSiteFeatures(["tool.text"]);
    await expect(text).not.toHaveAttribute("aria-disabled", "true", { timeout: 15_000 });
  } finally {
    await clearSiteFeatures(["tool.text"]);
  }
});
