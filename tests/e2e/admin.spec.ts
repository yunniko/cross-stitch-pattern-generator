import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, READER_PASSWORD, registerReader, signInAsAdmin, uniqueEmail } from "./helpers/auth";

/**
 * G-075 M3: `/admin/users` end to end against the real database -- access control (anonymous and a
 * signed-in non-admin are both turned away), then the admin workflow (search, promote/demote, disable a
 * login and confirm it actually refuses that reader, pagination).
 */

test("an anonymous visitor is redirected away from /admin", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login$/);
});

test("a signed-in reader who isn't an admin is redirected home, not to a form they'd just pass again", async ({ page }) => {
  await registerReader(page, uniqueEmail("nonadmin"));
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/$/);
});

test("the admin can search, promote, demote, and disable a reader's login", async ({ page, context }) => {
  const target1 = uniqueEmail("target1");
  const target2 = uniqueEmail("target2");

  await registerReader(page, target1);
  await context.clearCookies();
  await registerReader(page, target2);
  await context.clearCookies();

  await signInAsAdmin(page);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/admin\/users$/);

  // The admin's own row shows no actions, and never claims the row could act on itself.
  await page.fill('input[name="q"]', ADMIN_EMAIL);
  await page.click('button:has-text("Search")');
  await expect(page.getByTestId("admin-user-row")).toContainText("You");

  // Promote target1, then demote it back.
  await page.fill('input[name="q"]', target1);
  await page.click('button:has-text("Search")');
  await expect(page.getByTestId("admin-user-row")).toHaveCount(1);
  await expect(page.getByTestId("admin-user-row")).toContainText("USER");
  await page.click('button:has-text("Promote")');
  await expect(page.getByTestId("admin-user-row")).toContainText("ADMIN");
  await page.click('button:has-text("Demote")');
  await expect(page.getByTestId("admin-user-row")).toContainText("USER");

  // Disable target2's login, then confirm it genuinely can't sign in.
  await page.fill('input[name="q"]', target2);
  await page.click('button:has-text("Search")');
  await expect(page.getByTestId("admin-user-row")).toContainText("Active");
  await page.click('button:has-text("Disable login")');
  await expect(page.getByTestId("admin-user-row")).toContainText("Disabled");

  await context.clearCookies();
  await page.goto("/login");
  await page.fill("#email", target2);
  await page.fill("#password", READER_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page.getByTestId("auth-error")).toBeVisible();

  // Re-enable it, and confirm the reader can sign in again.
  await signInAsAdmin(page);
  await page.goto("/admin/users");
  await page.fill('input[name="q"]', target2);
  await page.click('button:has-text("Search")');
  await page.click('button:has-text("Enable login")');
  await expect(page.getByTestId("admin-user-row")).toContainText("Active");

  await context.clearCookies();
  await page.goto("/login");
  await page.fill("#email", target2);
  await page.fill("#password", READER_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/account$/);
});

test("more than a page of accounts shows working pagination", async ({ page }) => {
  // By this point in the run the two tests above have created at least 4 accounts against a page size of 3
  // (ADMIN_USERS_PAGE_SIZE in scripts/playwright-servers.ts), so a second page always exists here.
  await signInAsAdmin(page);
  await page.goto("/admin/users");
  await expect(page.getByTestId("admin-users-pagination")).toBeVisible();

  await page.click('a:has-text("Next")');
  await expect(page).toHaveURL(/page=2/);
  const page2Rows = await page.getByTestId("admin-user-row").count();
  expect(page2Rows).toBeGreaterThan(0);

  await page.click('a:has-text("Previous")');
  await expect(page).toHaveURL(/page=1/);
});
