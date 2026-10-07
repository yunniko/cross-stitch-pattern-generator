import { test, expect, type Page } from "@playwright/test";
import { ADMIN_EMAIL, registerReader, signInAsAdmin, uniqueEmail } from "./helpers/auth";
import { putOnTierWithSet } from "./helpers/features";

/**
 * G-107 M3: the admin's Overview, the Users side panel and filters, and the Change log, against the real database. Site-wide
 * counts move under any spec running beside this one, so the Overview is checked for its shape and its range, not exact
 * numbers (`admin-stats.spec.ts` counts, alone).
 */

async function openPerson(page: Page, email: string) {
  await page.goto("/admin/users?q=" + encodeURIComponent(email));
  await page.getByTestId("admin-user-row").getByRole("link", { name: email, exact: true }).click();
  await expect(page.getByTestId("admin-user-panel")).toContainText(email);
}

test("Overview: four figures, the range switch, jobs per day and the totals table", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/admin/overview");
  const range = page.getByRole("navigation", { name: "Range" });
  await expect(range.getByRole("link", { name: "30 days" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("overview-figures").locator("> div")).toHaveCount(4);
  await expect(page.getByTestId("overview-figures")).toContainText(/vs the 30 days before|none in the 30 days before/);

  await range.getByRole("link", { name: "7 days" }).click();
  await expect(page).toHaveURL(/range=7d$/);
  await expect(range.getByRole("link", { name: "7 days" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("overview-figures")).toContainText(/the 7 days before/);
  await expect(page.getByText("Exports by kind · 7 days")).toBeVisible();

  await range.getByRole("link", { name: "All time" }).click();
  await expect(page.getByTestId("overview-figures")).not.toContainText(/ vs /);

  await expect(page.getByTestId("overview-bars").locator("> div")).toHaveCount(30);
  for (const id of ["GENERATE", "EXPORT", "ACCOUNTS"]) {
    const allTime = Number(await page.getByTestId(`admin-stats-${id}-allTime`).getAttribute("data-count"));
    expect(allTime).toBeGreaterThanOrEqual(id === "ACCOUNTS" ? 1 : 0);
  }
  // An old link to Stats lands on the Overview.
  await page.goto("/admin/stats");
  await expect(page).toHaveURL(/\/admin\/overview$/);
});

test("Users: a person's side panel, the filters, and each role and login change in the Change log", async ({ page, context }) => {
  const email = uniqueEmail("panel");
  await registerReader(page, email);
  await context.clearCookies();
  const tier = `Tier ${email.split("@")[0]}`;
  await putOnTierWithSet(email, tier, {});

  await signInAsAdmin(page);
  await openPerson(page, email);
  const panel = page.getByTestId("admin-user-panel");
  await expect(panel).toContainText("USER");
  await expect(panel).toContainText(`${tier} (active)`);
  await expect(panel).toContainText("Email and password");
  // Signed in when registering: seen since last seen was kept.
  await expect(page.getByTestId("admin-user-seen")).toHaveText(/within 5 min|min ago/);
  await expect(page.getByTestId("admin-user-counts")).toHaveText(/^0generations0exports$/);
  await expect(page.getByTestId("admin-user-own-states")).toHaveText("None");
  await expect(page.getByTestId("admin-user-row")).toContainText(tier);

  // Promote, then the role filter finds them among the admins; disable, then the status filter among the disabled.
  await panel.getByRole("button", { name: "Promote" }).click();
  await expect(panel).toContainText("ADMIN");
  await page.goto(`/admin/users?q=${encodeURIComponent(email)}&role=USER`);
  await expect(page.getByText("No accounts match.")).toBeVisible();
  await page.goto(`/admin/users?q=${encodeURIComponent(email)}&role=ADMIN`);
  await expect(page.getByTestId("admin-user-row")).toHaveCount(1);
  await openPerson(page, email);
  await panel.getByRole("button", { name: "Demote" }).click();
  await expect(panel).toContainText("USER");
  await panel.getByRole("button", { name: "Disable login" }).click();
  await expect(panel).toContainText("Disabled");
  await page.goto(`/admin/users?q=${encodeURIComponent(email)}&status=disabled`);
  await expect(page.getByTestId("admin-user-row")).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("disabled");

  // The Change log has all three, by this admin, and its filter keeps them under Users and out of Tiers.
  await page.goto("/admin/changes?scope=users");
  const log = page.getByTestId("change-log");
  for (const said of ["promoted to ADMIN", "demoted to USER", "login disabled"])
    await expect(log.getByText(`${email}: ${said}`)).toHaveCount(1);
  await expect(log.locator("li").filter({ hasText: email }).first()).toContainText(`by ${ADMIN_EMAIL}`);
  await page.getByRole("navigation", { name: "Show changes to" }).getByRole("link", { name: "Tiers" }).click();
  await expect(page).toHaveURL(/scope=tiers$/);
  await expect(page.getByText(`${email}: promoted to ADMIN`)).toHaveCount(0);

  // The admin's own panel offers no action on itself.
  await openPerson(page, ADMIN_EMAIL);
  await expect(panel.getByRole("button")).toHaveCount(0);
  await expect(panel).toContainText("your own role and login are not changed here");
});
