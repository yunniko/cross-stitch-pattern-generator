import { test, expect, type Page } from "@playwright/test";

/**
 * G-075 M1: register, log in, log out, end to end against the real database and the real NextAuth session
 * cookie -- unit tests cover validation and the rate limiter (`tests/unit/request-guard.spec.ts`), but only
 * driving the actual pages proves a session survives a reload and that logging out really clears it.
 */

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function session(page: Page): Promise<{ user?: { email: string } } | null> {
  return page.evaluate(async () => (await fetch("/api/auth/session")).json());
}

test("registering signs the reader in, and the session survives a reload", async ({ page }) => {
  const email = uniqueEmail("register");
  await page.goto("/register");
  await page.fill("#name", "E2E Reader");
  await page.fill("#email", email);
  await page.fill("#password", "a genuinely fine password");
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(/\/$/);
  const first = await session(page);
  expect(first?.user?.email).toBe(email);

  await page.reload();
  const afterReload = await session(page);
  expect(afterReload?.user?.email).toBe(email);
});

test("logging out clears the session, and /login shows the form again afterwards", async ({ page }) => {
  const email = uniqueEmail("logout");
  await page.goto("/register");
  await page.fill("#name", "");
  await page.fill("#email", email);
  await page.fill("#password", "a genuinely fine password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/$/);

  // Visiting /login while already authenticated shows the account, not the form -- and it's the only way to
  // reach the real logout action before the personal cabinet exists (M2).
  await page.goto("/login");
  await expect(page.getByText("You're logged in")).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.click('button:has-text("Log out")');
  await expect(page).toHaveURL(/\/$/);
  expect(await session(page)).toBeNull();

  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();
});

test("a registered reader can log back in with the same credentials", async ({ page, context }) => {
  const email = uniqueEmail("relogin");
  const password = "a genuinely fine password";
  await page.goto("/register");
  await page.fill("#name", "");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/$/);

  await context.clearCookies();
  expect(await session(page)).toBeNull();

  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/$/);
  expect((await session(page))?.user?.email).toBe(email);
});

test("a wrong password is refused with no session created", async ({ page, context }) => {
  const email = uniqueEmail("wrongpw");
  await page.goto("/register");
  await page.fill("#name", "");
  await page.fill("#email", email);
  await page.fill("#password", "a genuinely fine password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/$/);
  await context.clearCookies();

  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "not the right one");
  await page.click('button[type="submit"]');

  await expect(page.getByTestId("auth-error")).toHaveText("Invalid email or password.");
  expect(await session(page)).toBeNull();
});

test("registering the same email twice is refused, and the second attempt is not signed in", async ({ page, context }) => {
  const email = uniqueEmail("dupe");
  for (const attempt of [1, 2]) {
    await page.goto("/register");
    await page.fill("#name", "");
    await page.fill("#email", email);
    await page.fill("#password", "a genuinely fine password");
    await page.click('button[type="submit"]');
    if (attempt === 1) {
      await expect(page).toHaveURL(/\/$/);
      await context.clearCookies();
    } else {
      await expect(page.getByTestId("auth-error")).toHaveText("An account with that email already exists.");
      expect(await session(page)).toBeNull();
    }
  }
});

test("registration validates email format and password length before touching the database", async ({ page }) => {
  await page.goto("/register");
  await page.fill("#name", "");
  await page.fill("#email", "not-an-email");
  await page.fill("#password", "short");
  await page.click('button[type="submit"]');

  await expect(page.locator("#email-error")).toHaveText("Enter a valid email address.");
  await expect(page.locator("#password-error")).toHaveText("Password must be at least 8 characters.");
  // The failed attempt never left /register -- a validation error is not the network round trip a real
  // account creation would be.
  await expect(page).toHaveURL(/\/register$/);
});
