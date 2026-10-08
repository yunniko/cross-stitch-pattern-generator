import { test, expect, type Page } from "@playwright/test";
import { openSmallChart } from "./helpers/app";
import { registerReader, signInAsAdmin, uniqueEmail } from "./helpers/auth";
import {
  clearAudienceSets,
  clearPersonFeatures,
  clearSiteFeatures,
  featuresDb,
  giveAudienceSet,
  putOnTierWithSet,
} from "./helpers/features";

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
    // Kept: the page reloaded shows the same, once the save has landed.
    await expect(page.getByTestId("site-features")).not.toHaveAttribute("data-pending", /.*/);
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
    // Buying's row is its migration's (D372), not this spec's.
    const rows = `SELECT count(*)::int AS n FROM "FeatureState" WHERE "featureId" <> 'billing.buy'`;
    await expect.poll(async () => (await featuresDb().query(rows)).rows[0].n).toBe(0);
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
    // A Generation feature, whose id is camelCase, is kept too (it was refused, 2026-10-06).
    const edges = set.locator(`[data-testid="feature-row"][data-feature="generation.edgeMode"]`);
    await edges.getByRole("group").getByRole("button", { name: "Locked", exact: true }).click();
    await expect(edges).toHaveAttribute("data-state", "locked");
    await expect(page.getByText("That is not a feature id.")).toHaveCount(0);
    // The row shows the new state at once; reloading before the save lands would read the old one.
    await expect(set).not.toHaveAttribute("data-pending", /.*/);
    await page.reload();
    await page.getByRole("tab", { name: /^Feature sets/ }).click();
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(
      page.getByTestId("set-features").locator(`[data-testid="feature-row"][data-feature="generation.edgeMode"]`)
    ).toHaveAttribute("data-state", "locked");
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
    await page.getByTestId("admin-user-row").getByRole("link", { name: email, exact: true }).click();
    await page.getByTestId("admin-user-panel").getByRole("link", { name: "Edit features" }).click();
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

test("the three workspaces are the first group, each one switch with the three states (G-103)", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/admin/features");
  await expect(page.getByTestId("feature-group").first()).toHaveAttribute("data-group", "Workspaces");
  const workspaces = group(page, "Workspaces").getByTestId("feature-row");
  await expect(workspaces).toHaveCount(3);
  for (const [index, [id, label]] of [
    ["workspace.photo", "Photo"],
    ["workspace.edit", "Edit"],
    ["workspace.export", "Export"],
  ].entries()) {
    await expect(workspaces.nth(index)).toHaveAttribute("data-feature", id);
    await expect(workspaces.nth(index)).toContainText(label);
    for (const state of ["On", "Locked", "Hidden"])
      await expect(row(page, id).getByRole("group").getByRole("button", { name: state, exact: true })).toBeVisible();
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

test("guests and signed-in accounts can each be given a set: a guest loses what an account keeps @alone", async ({ page, browser }) => {
  const guestsSet = `e2e guests ${Date.now().toString(36)}`;
  const email = uniqueEmail("account");
  try {
    // Made in the admin: a set for guests hiding Text, chosen under Guests and accounts.
    await signInAsAdmin(page);
    await page.goto("/admin/features");
    await page.getByRole("tab", { name: /^Feature sets/ }).click();
    await page.getByLabel("New set's name").fill(guestsSet);
    await page.getByRole("button", { name: "Make a set" }).click();
    const set = page.getByTestId("set-features");
    await set
      .locator(`[data-testid="feature-row"][data-feature="tool.text"]`)
      .getByRole("group")
      .getByRole("button", { name: "Hidden", exact: true })
      .click();
    await expect(set.locator(`[data-testid="feature-row"][data-feature="tool.text"]`)).toHaveAttribute("data-state", "hidden");
    await page.getByRole("tab", { name: "Guests and accounts" }).click();
    await page.getByLabel("Feature set for Guests (not signed in)").selectOption({ label: guestsSet });
    await expect(page.getByLabel("Feature set for Guests (not signed in)")).not.toHaveValue("");
    // The set given to guests cannot be deleted.
    await page.getByRole("tab", { name: /^Feature sets/ }).click();
    await page.getByRole("tab", { name: guestsSet, exact: true }).click();
    await expect(page.getByText("Given to: guests")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete the set" })).toBeDisabled();

    // A guest has no Text; a signed-in account has it.
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await openSmallChart(guestPage);
    await expect(guestPage.getByTestId("tool-rail").getByRole("button", { name: /^Text/ })).toHaveCount(0);
    await guest.close();
    const account = await browser.newContext();
    const accountPage = await account.newPage();
    await registerReader(accountPage, email);
    await openSmallChart(accountPage);
    await expect(accountPage.getByTestId("tool-rail").getByRole("button", { name: "Text", exact: true })).toBeEnabled();

    // And the other way: a set for accounts locking Line reaches the account and not a guest.
    await giveAudienceSet("accounts", `${guestsSet} accounts`, { "tool.line": "locked" });
    await expect(accountPage.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });
    await accountPage.reload();
    await expect(accountPage.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
    await expect(accountPage.getByTestId("tool-rail").getByRole("button", { name: /^Line/ })).toHaveAttribute("aria-disabled", "true");
    await account.close();
  } finally {
    await clearAudienceSets([guestsSet, `${guestsSet} accounts`]);
    await clearPersonFeatures(email);
  }
});
