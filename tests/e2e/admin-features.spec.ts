import { test, expect, type Page } from "@playwright/test";
import { openSmallChart } from "./helpers/app";
import { registerReader, signInAsAdmin, uniqueEmail } from "./helpers/auth";
import { clearPersonFeatures, clearSiteFeatures, featuresDb, putOnTierWithSet } from "./helpers/features";

/**
 * G-102 M3: the admin's Features page and a person's page, end to end against the real database. The site's rows are
 * shared state, so every case runs @alone and puts back what it touched.
 */

const row = (page: Page, featureId: string) => page.locator(`[data-testid="feature-row"][data-feature="${featureId}"]`);
const choose = (page: Page, featureId: string, state: string) =>
  row(page, featureId).getByRole("group").getByRole("button", { name: state, exact: true }).click();
const group = (page: Page, name: string) => page.locator(`[data-testid="feature-group"][data-group="${name}"]`);

test("an admin sets a whole group and one feature for the site, a visitor sees it, and the change is logged @alone", async ({
  page,
  browser,
}) => {
  await signInAsAdmin(page);
  await page.goto("/admin/features");
  await expect(page.getByRole("heading", { name: "Features", exact: true })).toBeVisible();
  // Every feature is listed, in its group, on to begin with.
  const rows = page.getByTestId("feature-row");
  expect(await rows.count()).toBeGreaterThan(40);
  await expect(page.locator('[data-testid="feature-row"]:not([data-state="on"])')).toHaveCount(0);
  try {
    // A whole group at once, and one feature alone.
    await group(page, "Thread brands")
      .getByRole("group", { name: "Thread brands: every feature" })
      .getByRole("button", { name: "Hidden", exact: true })
      .click();
    await expect(row(page, "brand.dmc")).toHaveAttribute("data-state", "hidden");
    await expect(row(page, "brand.anchor")).toHaveAttribute("data-state", "hidden");
    await choose(page, "tool.text", "Locked");
    await expect(row(page, "tool.text")).toHaveAttribute("data-state", "locked");
    // The group with one locked tool reads as mixed.
    await expect(group(page, "Drawing tools").getByText("Mixed")).toBeVisible();
    // Kept: the page reloaded shows the same.
    await page.reload();
    await expect(row(page, "tool.text")).toHaveAttribute("data-state", "locked");
    await expect(row(page, "brand.cosmo")).toHaveAttribute("data-state", "hidden");

    // A visitor, in a browser of their own, gets the site's states.
    const visitor = await browser.newContext();
    const other = await visitor.newPage();
    await openSmallChart(other);
    await expect(other.getByTestId("tool-rail").getByRole("button", { name: /^Text/ })).toHaveAttribute("aria-disabled", "true");
    await other.getByRole("tab", { name: "Photo", exact: true }).click();
    await other.getByRole("tab", { name: "Chart settings" }).click();
    await expect(other.getByTestId("panel").getByRole("button", { name: "DMC", exact: true })).toHaveCount(0);
    await visitor.close();

    // The changes are logged with who made them.
    await page.getByRole("tab", { name: "Changes" }).click();
    const changes = page.getByTestId("feature-changes");
    await expect(changes.getByText("tool.text → locked").first()).toBeVisible(); // earlier runs logged the same
    await expect(changes.getByText("brand.dmc → hidden").first()).toBeVisible();
    await expect(changes.getByText(/by e2e-admin@example\.com/).first()).toBeVisible();

    // Back to on: the rows are gone, and the visitor's editor is whole again.
    await page.getByRole("tab", { name: "The site" }).click();
    await group(page, "Thread brands")
      .getByRole("group", { name: "Thread brands: every feature" })
      .getByRole("button", { name: "On", exact: true })
      .click();
    await choose(page, "tool.text", "On");
    await expect(row(page, "tool.text")).toHaveAttribute("data-state", "on");
    await expect.poll(async () => (await featuresDb().query(`SELECT count(*)::int AS n FROM "FeatureState"`)).rows[0].n).toBe(0);
  } finally {
    await clearSiteFeatures(["tool.text", "brand.dmc", "brand.cosmo", "brand.anchor"]);
  }
});

test("a set is made, filled and attached to a tier; a person on the tier gets it; their own state wins over it @alone", async ({
  page,
  browser,
}) => {
  const email = uniqueEmail("tiered");
  const name = `e2e set ${Date.now().toString(36)}`;
  const reader = await browser.newContext();
  const readerPage = await reader.newPage();
  await registerReader(readerPage, email);
  try {
    await signInAsAdmin(page);
    await page.goto("/admin/features");
    await page.getByRole("tab", { name: /^Feature sets/ }).click();
    await page.getByLabel("New set's name").fill(name);
    await page.getByRole("button", { name: "Make a set" }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
    const set = page.getByTestId("set-features");
    await set
      .locator(`[data-testid="feature-row"][data-feature="tool.fill"]`)
      .getByRole("group")
      .getByRole("button", { name: "Hidden", exact: true })
      .click();
    await expect(set.locator(`[data-testid="feature-row"][data-feature="tool.fill"]`)).toHaveAttribute("data-state", "hidden");
    // A feature left "As the site" has no entry.
    await expect(set.locator(`[data-testid="feature-row"][data-feature="tool.brush"]`)).toHaveAttribute("data-state", "site");

    await page.getByRole("tab", { name: /^Tiers/ }).click();
    await page.getByLabel("New tier's name").fill(name);
    await page.getByRole("button", { name: "Make a tier" }).click();
    const tierRow = page.locator(`[data-testid="tier-row"][data-tier="${name}"]`);
    await expect(tierRow).toBeVisible();
    await tierRow.getByRole("combobox").selectOption({ label: name });
    await expect(tierRow.getByRole("combobox")).toHaveValue(/.+/);
    // The set cannot be deleted while the tier points at it.
    await page.getByRole("tab", { name: /^Feature sets/ }).click();
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("button", { name: "Delete the set" })).toBeDisabled();

    // The person is put on the tier (a subscription, which nothing sells yet: written by the spec) and loses Fill.
    await putOnTierWithSet(email, name, { "tool.fill": "hidden" });
    await openSmallChart(readerPage);
    await expect(readerPage.getByTestId("tool-rail").getByRole("button", { name: "Fill", exact: true })).toHaveCount(0);

    // Their own page: On for Fill wins over the tier's set.
    await page.goto("/admin/users?q=" + encodeURIComponent(email));
    await page.getByTestId("admin-user-row").first().getByRole("link", { name: "Features" }).click();
    await expect(page.getByTestId("user-tier")).toContainText(`On the tier "${name}"`);
    await expect(page.getByTestId("user-tier")).toContainText(`gives the set "${name}"`);
    await choose(page, "tool.fill", "On");
    await expect(row(page, "tool.fill")).toHaveAttribute("data-state", "on");
    await expect(readerPage.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
    await readerPage.reload();
    await expect(readerPage.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
    await expect(readerPage.getByTestId("tool-rail").getByRole("button", { name: "Fill", exact: true })).toBeEnabled();
  } finally {
    await reader.close();
    await clearPersonFeatures(email, name);
  }
});

test("the pages refuse a reader and a visitor @alone", async ({ page }) => {
  await page.goto("/admin/features");
  await expect(page).toHaveURL(/\/login/);
  const email = uniqueEmail("reader");
  await registerReader(page, email);
  await page.goto("/admin/features");
  await expect(page).not.toHaveURL(/\/admin/);
});
