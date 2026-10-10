import { test, expect, type Page } from "@playwright/test";
import { logIn, READER_PASSWORD, registerReader, submitRegistration, uniqueEmail } from "./helpers/auth";
import { latestMessageTo } from "./helpers/mail";

/**
 * G-075 M1: register, log in, log out, end to end against the real database and the real NextAuth session
 * cookie -- unit tests cover validation and the rate limiter (`tests/unit/request-guard.spec.ts`), but only
 * driving the actual pages proves a session survives a reload and that logging out really clears it.
 * Registering sends a confirmation link (G-113); logging in lands on /account (M2's personal cabinet); logout goes home.
 */

async function session(page: Page): Promise<{ user?: { email: string } } | null> {
  return page.evaluate(async () => (await fetch("/api/auth/session")).json());
}

test("registering then confirming lets the reader log in, and the session survives a reload", async ({ page }) => {
  const email = uniqueEmail("register");
  await registerReader(page, email, READER_PASSWORD, "E2E Reader");
  expect((await session(page))?.user?.email).toBe(email);

  await page.reload();
  expect((await session(page))?.user?.email).toBe(email);
});

test("logging out clears the session, and /login shows the form again afterwards", async ({ page }) => {
  await registerReader(page, uniqueEmail("logout"));

  // The personal cabinet has its own logout button (M2); /login's LoggedInNotice offers a second path to
  // the same action for a reader who lands there while already signed in.
  await page.click('button:has-text("Log out")');
  await expect(page).toHaveURL(/\/$/);
  expect(await session(page)).toBeNull();

  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();
});

test("a registered reader can log back in with the same credentials", async ({ page, context }) => {
  const email = uniqueEmail("relogin");
  await registerReader(page, email);

  await context.clearCookies();
  expect(await session(page)).toBeNull();

  await logIn(page, email, READER_PASSWORD);
  await expect(page).toHaveURL(/\/account$/);
  expect((await session(page))?.user?.email).toBe(email);
});

test("a wrong password is refused with no session created", async ({ page, context }) => {
  const email = uniqueEmail("wrongpw");
  await registerReader(page, email);
  await context.clearCookies();

  await logIn(page, email, "not the right one");
  await expect(page.getByTestId("auth-error")).toHaveText("Invalid email or password.");
  expect(await session(page)).toBeNull();
});

test("registering an address that has an account answers as for a new one, signs nobody in, and tells the mailbox", async ({
  page,
  context,
}) => {
  const email = uniqueEmail("dupe");
  await registerReader(page, email);
  await context.clearCookies();

  await submitRegistration(page, email, "a different password altogether");
  expect(await session(page)).toBeNull();
  await latestMessageTo(email, /you already have an account/);
  // The account is untouched: its own password still works, the one typed second does not.
  await logIn(page, email, "a different password altogether");
  await expect(page.getByTestId("auth-error")).toHaveText("Invalid email or password.");
  await logIn(page, email, READER_PASSWORD);
  await expect(page).toHaveURL(/\/account$/);
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

/**
 * G-075 M2: the personal cabinet -- name change, password change (including a rejected wrong-current-password
 * attempt), and account deletion, end to end over the whole loop including the reader being genuinely gone
 * afterwards (a `deleteAccountAction` that reported success but silently failed to delete would still pass a
 * test that only checked the redirect).
 */
test("the personal cabinet: rename, change password, and delete the account", async ({ page, context }) => {
  const email = uniqueEmail("cabinet");
  const password = "a genuinely fine password";
  const newPassword = "a different genuinely fine password";

  await registerReader(page, email, password, "Cabinet Reader");

  // The canvas app's corner badge names the signed-in reader and links back to /account.
  await page.goto("/");
  await expect(page.locator('a[href="/account"]')).toHaveText("Cabinet Reader");

  await page.goto("/account/profile");
  await page.fill("#name", "Renamed Reader");
  await page.click('button:has-text("Save name")');
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.locator("#name")).toHaveValue("Renamed Reader");

  await page.fill("#currentPassword", "totally the wrong password");
  await page.fill("#newPassword", newPassword);
  await page.click('form:has(#currentPassword) button:has-text("Change password")');
  await expect(page.locator("#currentPassword-error")).toHaveText("That's not your current password.");

  await page.fill("#currentPassword", password);
  await page.fill("#newPassword", newPassword);
  await page.click('form:has(#currentPassword) button:has-text("Change password")');
  await expect(page.getByText("Changed.")).toBeVisible();

  await context.clearCookies();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page.getByTestId("auth-error")).toBeVisible();

  await page.fill("#email", email);
  await page.fill("#password", newPassword);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/account$/);

  await page.goto("/account/profile");
  await page.click('button:has-text("Delete account…")');
  await page.fill("#confirmEmail", "not-my-email@example.com");
  await page.click('button:has-text("Delete my account")');
  await expect(page.locator("#confirmEmail-error")).toHaveText("Type your email exactly to confirm.");

  await page.fill("#confirmEmail", email);
  await page.click('button:has-text("Delete my account")');
  await expect(page).toHaveURL(/\/$/);
  expect(await session(page)).toBeNull();

  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", newPassword);
  await page.click('button[type="submit"]');
  await expect(page.getByTestId("auth-error")).toBeVisible();
  expect(await session(page)).toBeNull();
});
