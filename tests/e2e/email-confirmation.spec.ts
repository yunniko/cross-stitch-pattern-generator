import { test, expect } from "@playwright/test";
import { CONFIRM_SUBJECT, logIn, openConfirmationLink, READER_PASSWORD, submitRegistration, uniqueEmail } from "./helpers/auth";
import { latestMessageTo, linkPath, messagesTo } from "./helpers/mail";

/**
 * G-113 M2: confirming an address, against the file-transport outbox the suite runs with. Each page answers the same
 * whatever the address's state; what differs is only what arrives in that address's mailbox.
 */

test("an unconfirmed account is refused at log-in and offered the link again; the link confirms once", async ({ page }) => {
  const email = uniqueEmail("confirm");
  await submitRegistration(page, email);

  await logIn(page, email, READER_PASSWORD);
  await expect(page.getByTestId("auth-error")).toHaveText("Confirm your email address first: open the link we sent to it.");
  await expect(page.getByRole("link", { name: "Send it again" })).toHaveAttribute("href", "/confirm-address");

  const link = linkPath(await latestMessageTo(email, CONFIRM_SUBJECT), "/confirm-address/link");
  await page.goto(link);
  await expect(page).toHaveURL(/\/login\?confirmed=1$/);
  await expect(page.getByTestId("auth-notice")).toHaveText("Your email address is confirmed. Log in to continue.");

  // Used once: opening it again says so and offers a new one.
  await page.goto(link);
  await expect(page).toHaveURL(/\/confirm-address\?link=unknown$/);
  await expect(page.getByTestId("auth-error")).toContainText("it was used already");

  await logIn(page, email, READER_PASSWORD);
  await expect(page).toHaveURL(/\/account$/);
});

test("sending the link again replaces the earlier one", async ({ page }) => {
  const email = uniqueEmail("resend");
  await submitRegistration(page, email);
  const first = linkPath(await latestMessageTo(email, CONFIRM_SUBJECT), "/confirm-address/link");

  await page.goto("/confirm-address");
  await page.fill("#email", email);
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect.poll(() => messagesTo(email).filter((message) => CONFIRM_SUBJECT.test(message.subject)).length).toBe(2);

  await page.goto(first);
  await expect(page).toHaveURL(/\/confirm-address\?link=unknown$/);
  await openConfirmationLink(page, email);
});

test("sending the link to an address with no account answers the same and sends nothing", async ({ page }) => {
  const email = uniqueEmail("nobody");
  await page.goto("/confirm-address");
  await page.fill("#email", email);
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect(messagesTo(email)).toHaveLength(0);
});

test("a malformed or missing token is turned away without an error page", async ({ page }) => {
  for (const query of ["?token=short", "", `?token=${"A".repeat(43)}`]) {
    await page.goto(`/confirm-address/link${query}`);
    await expect(page).toHaveURL(/\/confirm-address\?link=unknown$/);
  }
});
