import { test, expect, type Page } from "@playwright/test";
import { logIn, READER_PASSWORD, registerReader, submitRegistration, uniqueEmail } from "./helpers/auth";
import { latestMessageTo, linkPath, messagesTo } from "./helpers/mail";

/**
 * G-113 M3: resetting a password through the mailed link, against the file-transport outbox. The suite runs with
 * `ACCOUNT_RECHECK_SECONDS=0`, so a session the reset ends is gone on its very next request (D345).
 */

const RESET_SUBJECT = /set a new password/;
const NEW_PASSWORD = "a brand new genuinely fine password";

async function session(page: Page): Promise<{ user?: { email: string } } | null> {
  return page.evaluate(async () => (await fetch("/api/auth/session")).json());
}

async function requestReset(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.fill("#email", email);
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
}

async function resetLink(email: string): Promise<string> {
  return linkPath(await latestMessageTo(email, RESET_SUBJECT), "/reset-password/new");
}

test("a reset sets the new password, refuses the old one, and ends the sessions signed in before it", async ({ page, browser }) => {
  const email = uniqueEmail("reset");
  const elsewhere = await browser.newContext();
  try {
    const signedIn = await elsewhere.newPage();
    await registerReader(signedIn, email);
    expect((await session(signedIn))?.user?.email).toBe(email);

    await requestReset(page, email);
    const link = await resetLink(email);
    await page.goto(link);
    await expect(page.getByText("Setting it signs your account out everywhere else.")).toBeVisible();
    await page.fill("#password", NEW_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByTestId("auth-notice")).toHaveText("Your new password is set. Log in with it.");

    expect(await session(signedIn)).toBeNull();

    await logIn(page, email, READER_PASSWORD);
    await expect(page.getByTestId("auth-error")).toHaveText("Invalid email or password.");
    await logIn(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/account$/);
    // Signed in after the reset, so this session stays.
    await page.reload();
    expect((await session(page))?.user?.email).toBe(email);

    // Used once.
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page.getByTestId("auth-error")).toContainText("it was used already");
  } finally {
    await elsewhere.close();
  }
});

test("a password that is too short is refused without using up the link", async ({ page }) => {
  const email = uniqueEmail("resetshort");
  await registerReader(page, email);
  await page.context().clearCookies();

  await requestReset(page, email);
  await page.goto(await resetLink(email));
  await page.fill("#password", "short");
  await page.click('button[type="submit"]');
  await expect(page.locator("#password-error")).toHaveText("Password must be at least 8 characters.");

  await page.fill("#password", NEW_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/login\?reset=1$/);
});

test("resetting the password of an unconfirmed account confirms its address", async ({ page }) => {
  const email = uniqueEmail("resetunconfirmed");
  await submitRegistration(page, email);

  await requestReset(page, email);
  await page.goto(await resetLink(email));
  await page.fill("#password", NEW_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/login\?reset=1$/);

  await logIn(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/account$/);
});

test("asking for a reset for an address with no account answers the same and sends nothing", async ({ page }) => {
  const email = uniqueEmail("resetnobody");
  await requestReset(page, email);
  expect(messagesTo(email)).toHaveLength(0);
});

test("a malformed or unknown reset link offers a new one instead of a form", async ({ page }) => {
  for (const query of ["", "?token=short", `?token=${"B".repeat(43)}`]) {
    await page.goto(`/reset-password/new${query}`);
    await expect(page.getByTestId("auth-error")).toContainText("Ask for a new one.");
    await expect(page.locator("#password")).toHaveCount(0);
  }
});

test("a confirmation link opened as a reset link is refused and still confirms afterwards", async ({ page }) => {
  const email = uniqueEmail("crosspurpose");
  await submitRegistration(page, email);
  const confirm = linkPath(await latestMessageTo(email, /confirm your email address/), "/confirm-address/link");
  const token = new URL(confirm, "http://x").searchParams.get("token");

  await page.goto(`/reset-password/new?token=${token}`);
  await expect(page.getByTestId("auth-error")).toContainText("Ask for a new one.");

  await page.goto(confirm);
  await expect(page).toHaveURL(/\/login\?confirmed=1$/);
});
