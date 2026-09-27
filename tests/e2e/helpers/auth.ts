import { expect, type Page } from "@playwright/test";

/**
 * Account creation and admin sign-in shared by the accounts, admin and stats specs (G-075,
 * STANDARDS.md -> "One home per shared test affordance"). `ADMIN_EMAIL` is one fixed address shared by the
 * whole suite run (`scripts/playwright-servers.ts`'s `ADMIN_EMAIL`/`ADMIN_BOOTSTRAP_ENABLED`), unlike every
 * other account here, which gets a fresh one per test.
 */

export const ADMIN_EMAIL = "e2e-admin@example.com";
export const ADMIN_PASSWORD = "the e2e admin's own password";
export const READER_PASSWORD = "a genuinely fine password";

export function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function registerReader(page: Page, email: string, password = READER_PASSWORD): Promise<void> {
  await page.goto("/register");
  await page.fill("#name", "");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/account$/);
}

/** Registers the bootstrap admin the first time this suite runs against a given database, or logs in if an
 *  earlier run already created it (the account, and its promotion to ADMIN, both persist in Postgres). */
export async function signInAsAdmin(page: Page): Promise<void> {
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
