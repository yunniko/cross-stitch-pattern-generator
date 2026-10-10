import { expect, type Page } from "@playwright/test";
import { latestMessageTo, linkPath } from "./mail";

/**
 * Account creation and admin sign-in shared by the accounts, admin and stats specs (G-075,
 * STANDARDS.md -> "One home per shared test affordance"). `ADMIN_EMAIL` is one fixed address shared by the
 * whole suite run (`scripts/playwright-servers.ts`'s `ADMIN_EMAIL`/`ADMIN_BOOTSTRAP_ENABLED`), unlike every
 * other account here, which gets a fresh one per test. The suite runs with sending on (G-113), so an account is
 * usable only once its address is confirmed through the link in the e2e outbox.
 */

export const ADMIN_EMAIL = "e2e-admin@example.com";
export const ADMIN_PASSWORD = "the e2e admin's own password";
export const READER_PASSWORD = "a genuinely fine password";

export const CONFIRM_SUBJECT = /confirm your email address/;

export function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Fills and sends the registration form; the page then says to check the inbox, whatever the address's state. */
export async function submitRegistration(page: Page, email: string, password = READER_PASSWORD, name = ""): Promise<void> {
  await page.goto("/register");
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
}

/** Opens the newest confirmation link sent to `email`, which lands on the log-in form with the confirmed notice. */
export async function openConfirmationLink(page: Page, email: string): Promise<void> {
  await page.goto(linkPath(await latestMessageTo(email, CONFIRM_SUBJECT), "/confirm-address/link"));
  await expect(page).toHaveURL(/\/login\?confirmed=1$/);
}

export async function logIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
}

/** Logs a confirmed account in and waits for /account: a page opened before then would race the sign-in to the log-in form. */
export async function signInAs(page: Page, email: string, password = READER_PASSWORD): Promise<void> {
  await logIn(page, email, password);
  await expect(page).toHaveURL(/\/account$/);
}

/** A new reader, registered, confirmed and signed in, on /account. */
export async function registerReader(page: Page, email: string, password = READER_PASSWORD, name = ""): Promise<void> {
  await submitRegistration(page, email, password, name);
  await openConfirmationLink(page, email);
  await logIn(page, email, password);
  await expect(page).toHaveURL(/\/account$/);
}

/** Registers the bootstrap admin the first time this suite runs against a given database, or logs in if an
 *  earlier run already created it (the account, and its promotion to ADMIN, both persist in Postgres). An account
 *  left unconfirmed by an earlier run is confirmed through a link sent again. */
export async function signInAsAdmin(page: Page): Promise<void> {
  await submitRegistration(page, ADMIN_EMAIL, ADMIN_PASSWORD, "E2E Admin");
  await logIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  const unconfirmed = page.getByTestId("auth-error").filter({ hasText: "Confirm your email address first" });
  await expect(async () => {
    expect(/\/account$/.test(page.url()) || (await unconfirmed.isVisible())).toBe(true);
  }).toPass();
  if (/\/account$/.test(page.url())) return;
  await page.goto("/confirm-address");
  await page.fill("#email", ADMIN_EMAIL);
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await openConfirmationLink(page, ADMIN_EMAIL);
  await logIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/account$/);
}

/** Deletes the signed-in reader's own account from Profile & sign-in, typing their email, and lands on the editor. */
export async function deleteOwnAccount(page: Page, email: string): Promise<void> {
  await page.goto("/account/profile");
  await page.click('button:has-text("Delete account…")');
  await page.fill("#confirmEmail", email);
  await page.click('button:has-text("Delete my account")');
  await expect(page).toHaveURL(/\/$/);
}
