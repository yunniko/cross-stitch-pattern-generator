import { test, expect, type Page } from "@playwright/test";

/**
 * G-075 M3: `/admin/users` end to end against the real database -- access control (anonymous and a
 * signed-in non-admin are both turned away), then the admin workflow (search, promote/demote, disable a
 * login and confirm it actually refuses that reader, pagination). `ADMIN_EMAIL` is one fixed address shared
 * by the whole suite run (`scripts/playwright-servers.ts`), unlike every other account here, which gets a
 * fresh one per test.
 */

const ADMIN_EMAIL = "e2e-admin@example.com";
const ADMIN_PASSWORD = "the e2e admin's own password";
const READER_PASSWORD = "a genuinely fine password";

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function registerReader(page: Page, email: string, password = READER_PASSWORD): Promise<void> {
  await page.goto("/register");
  await page.fill("#name", "");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/account$/);
}

/** Registers the bootstrap admin the first time this suite runs against a given database, or logs in if an
 *  earlier run already created it (the account, and its promotion to ADMIN, both persist in Postgres). */
async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto("/register");
  await page.fill("#name", "E2E Admin");
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(/\/account$/, { timeout: 5000 });
    return;
  } catch {
    // Already registered by an earlier run -- log in instead.
  }
  await page.goto("/login");
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/account$/);
}

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
