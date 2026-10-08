import { test, expect, type Page } from "@playwright/test";
import { registerReader, uniqueEmail } from "./helpers/auth";
import { chooseExport, generateSmallPattern, openPreferences, showWorkspace } from "./helpers/app";
import { putOnTierWithSet } from "./helpers/features";
import { panel } from "./helpers/panel";

/**
 * G-107 M2: the account's Plan, Usage and Preferences sections, each from data that exists. A fresh account per test, so
 * its own usage is not moved by any other spec running beside it.
 */

const section = (page: Page, name: string) => panel.accountNav(page).getByRole("link", { name, exact: true });

test("a new account: the sections in order, Free with nothing used, and no invoices", async ({ page }) => {
  await registerReader(page, uniqueEmail("sections"));

  // Charts and Stamps carry how many are kept (G-108 part 1 M8, G-119): none yet.
  await expect(panel.accountNav(page).getByRole("link")).toHaveText([
    "Charts0",
    "Stamps0",
    "Plan",
    "Usage",
    "Preferences",
    "Profile & sign-in",
  ]);
  await expect(page.getByTestId("account-plan")).toContainText("Free");

  await section(page, "Plan").click();
  await expect(page).toHaveURL(/\/account\/plan$/);
  await expect(panel.current(page)).toHaveText("Plan");
  await expect(page.getByTestId("plan-current")).toContainText("Free");
  await expect(page.getByTestId("plan-current")).toContainText("Current");
  // Buying starts hidden (D372), so nothing is offered and nothing is billed.
  await expect(page.getByText("Paid plans are not on sale yet.")).toBeVisible();
  await expect(page.getByTestId("plan-offer")).toHaveCount(0);
  await expect(page.getByText("Nothing billed on this account.")).toBeVisible();

  await section(page, "Usage").click();
  await expect(page).toHaveURL(/\/account\/usage$/);
  await expect(page.getByTestId("usage-figures")).toHaveText(
    /^Generations0last 30 daysExports0last 30 daysGenerations0all timeExports0all time$/
  );
  await expect(page.getByTestId("usage-exports")).toContainText("No exports yet.");
});

test("generating once and exporting two kinds shows on Usage, each export under its kind", async ({ page }) => {
  test.setTimeout(120_000);
  await registerReader(page, uniqueEmail("usage"));

  await generateSmallPattern(page);
  await showWorkspace(page, "Export");
  const exportButton = page.getByRole("button", { name: "Export", exact: true });
  for (const kind of ["png-color", "png-realistic"]) {
    await chooseExport(page, kind);
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), exportButton.click()]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
  }

  await page.goto("/account/usage");
  const figures = page.getByTestId("usage-figures");
  await expect(figures).toHaveText(/^Generations1last 30 daysExports2last 30 daysGenerations1all timeExports2all time$/);
  const rows = page.getByTestId("usage-exports").locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Full chart PNG" })).toContainText(/Full chart PNG\s*1\s*1/);
  await expect(rows.filter({ hasText: "Realistic preview PNG" })).toContainText(/Realistic preview PNG\s*1\s*1/);
  // Today's bar has both colours' share; the list beside it says what it shows.
  await expect(page.getByText(/generated 1, exported 2$/)).toHaveCount(1);
});

test("a tier an admin gave is the plan shown, in the section and the sidebar", async ({ page }) => {
  const email = uniqueEmail("tier");
  await registerReader(page, email);
  const tier = `Tier ${email.split("@")[0]}`;
  await putOnTierWithSet(email, tier, {});

  await page.goto("/account/plan");
  await expect(page.getByTestId("plan-current")).toContainText(tier);
  await expect(page.getByTestId("account-plan")).toContainText(tier);
  await expect(page.getByText("Paid plans are not on sale yet.")).toHaveCount(0);
});

test("Preferences on the account are the editor's own: a change here is what the editor opens with", async ({ page }) => {
  await registerReader(page, uniqueEmail("prefs"));
  await page.goto("/account/preferences");
  const fields = page.getByTestId("account-preferences");
  const fabric = fields.getByRole("group", { name: "Fabric count for a new chart" });
  await fabric.getByRole("button", { name: "18-count", exact: true }).click();
  await fields.getByLabel("Author name").fill("Panel Author");
  await expect(fabric.getByRole("button", { name: "18-count", exact: true })).toHaveAttribute("aria-pressed", "true");

  await panel.backToEditor(page).click();
  const preferences = await openPreferences(page);
  await expect(
    preferences.getByRole("group", { name: "Fabric count for a new chart" }).getByRole("button", { name: "18-count", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(preferences.getByLabel("Author name")).toHaveValue("Panel Author");
});
