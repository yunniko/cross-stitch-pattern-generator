import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, registerReader, signInAsAdmin, uniqueEmail } from "./helpers/auth";
import { panel } from "./helpers/panel";

/**
 * G-107: the account and admin areas' frame. One header with the way back to the editor, and a sidebar drawn from each
 * area's declared sections with the open one marked.
 */

test("the account area: its sections, the way back, and no Admin link for a reader", async ({ page }) => {
  const email = uniqueEmail("panel");
  await registerReader(page, email, undefined, "Panel Reader");

  await expect(page.getByRole("heading", { name: "Profile & sign-in" })).toBeVisible();
  await expect(panel.accountNav(page)).toBeVisible();
  await expect(panel.current(page)).toHaveText("Profile & sign-in");
  await expect(panel.header(page)).toContainText("Panel Reader");
  await expect(panel.header(page).getByRole("link", { name: "Admin" })).toHaveCount(0);

  // Only what exists is listed: a password, nothing else.
  await expect(page.getByTestId("sign-in-methods").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("sign-in-methods")).toContainText("Email and password");
  await expect(page.getByTestId("sign-in-methods")).toContainText(email);
  await expect(page.getByText(/member since \d{1,2} \w+ \d{4}/)).toBeVisible();

  await panel.backToEditor(page).click();
  await expect(page).toHaveURL(/\/$/);
});

test("the admin area: its mark, its sections, and the ways to the account and the editor", async ({ page }) => {
  await signInAsAdmin(page);
  // An admin's account header leads to the admin area.
  await panel.header(page).getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin\/overview$/);

  await expect(panel.header(page).getByText("Admin", { exact: true })).toBeVisible();
  await expect(panel.adminNav(page).getByRole("link")).toHaveText([
    "Overview",
    /^Users[\d ]+$/,
    "Features",
    "Billing",
    "Settings",
    "Change log",
  ]);
  await expect(panel.current(page)).toHaveText("Overview");

  await panel.adminNav(page).getByRole("link", { name: "Features" }).click();
  await expect(page).toHaveURL(/\/admin\/features$/);
  await expect(panel.current(page)).toHaveText("Features");

  await panel.header(page).getByRole("link", { name: ADMIN_EMAIL }).click();
  await expect(page).toHaveURL(/\/account$/);
  await panel.backToEditor(page).click();
  await expect(page).toHaveURL(/\/$/);
});
