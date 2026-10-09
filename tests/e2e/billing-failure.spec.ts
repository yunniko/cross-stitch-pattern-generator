import { test, expect, type Page } from "@playwright/test";
import { registerReader, uniqueEmail } from "./helpers/auth";
import { agreeAndChoose, ensureLegalDocuments, putTierOnSale, takeTierOffSale } from "./helpers/billing";
import { setSiteFeatures } from "./helpers/features";
import { latestMessageTo, messagesTo } from "./helpers/mail";

/**
 * G-126 M2 on the fake provider: a renewal fails, the Plan page and the mail say so with the way to pay, paying clears it
 * and says so; a second failure left past the grace moves the account to Free with its charts kept, and paying the open
 * invoice brings the tier back. Each message goes once per failure (D377). Buying is shown for the run and hidden after;
 * @alone, as the site's rows are shared.
 */

const notice = (page: Page) => page.getByTestId("plan-payment-notice");

/** The fake's pay page, by its path: the link names the server's own address, which the browser may call differently. */
async function openPayLink(page: Page) {
  const href = await page.getByTestId("plan-pay-link").getAttribute("href");
  const url = new URL(href!);
  await page.goto(url.pathname + url.search);
  await expect(page.getByRole("heading", { name: "Test billing portal" })).toBeVisible();
}

async function inPortal(page: Page, button: string) {
  await page.goto("/account/plan");
  await page.getByRole("button", { name: "Manage billing" }).click();
  await page.getByRole("button", { name: button }).click();
  await expect(page).toHaveURL(/\/account\/plan$/);
}

const subjects = (email: string) => messagesTo(email).map((message) => message.subject.replace(/^.*?: /, ""));

test("a renewal that fails: told once, paid, failed again past the grace to Free, paid back @alone", async ({ page }) => {
  const email = uniqueEmail("failing");
  const tier = `E2E Failing ${email.split("@")[0]}`;
  await putTierOnSale(tier, {});
  await ensureLegalDocuments();
  try {
    await setSiteFeatures({ "billing.buy": "on" });
    await registerReader(page, email);
    await page.goto("/account/plan");
    await agreeAndChoose(page, `Choose ${tier}, €10.00 a month`);
    await page.getByRole("button", { name: "Pay" }).click();
    await expect(page.getByTestId("plan-current")).toContainText(tier);
    await expect(notice(page)).toHaveCount(0);
    // The purchase confirmed by mail, repeating the request and carrying both documents in full (D384, D389).
    const confirmed = await latestMessageTo(email, /your plan has started/);
    expect(confirmed.text).toContain(`${tier}, €10.00 a month`);
    expect(confirmed.text).toMatch(/\/terms\?version=\d+/);
    expect(confirmed.text).toMatch(/\/withdrawal\?version=\d+/);
    expect(confirmed.text).toContain("if I withdraw I pay for the days used");
    expect(confirmed.text).toContain("INFORMATION ON THE RIGHT OF WITHDRAWAL");

    // The renewal fails: the tier is kept, with the grace's end, the next try and the way to pay.
    await inPortal(page, "Renewal fails");
    await expect(page.getByTestId("plan-current")).toContainText(tier);
    await expect(notice(page)).toHaveAttribute("data-tone", "warning");
    await expect(notice(page)).toContainText("did not go through");
    await expect(notice(page)).toContainText("Your plan stays as it is until");
    await expect(notice(page)).toContainText("The card will be tried again on");
    await expect(page.getByTestId("plan-pay-link")).toHaveText("Pay now");
    const failed = await latestMessageTo(email, /did not go through/);
    expect(failed.text).toContain("/account/plan");
    expect(failed.text).toContain("Your charts are kept");

    // Paid on the invoice's page: the notice goes, and the person is told once.
    await openPayLink(page);
    await page.getByRole("button", { name: "Pay the open invoice" }).click();
    await expect(page).toHaveURL(/\/account\/plan$/);
    await expect(notice(page)).toHaveCount(0);
    await expect(page.getByTestId("plan-status")).toContainText("Renews on");
    await latestMessageTo(email, /has gone through/);

    // A second failure, left past the grace: Free, the charts kept, and the open invoice still payable.
    await inPortal(page, "Renewal fails");
    await inPortal(page, "Move the failure past the grace");
    await expect(page.getByTestId("plan-current")).toContainText("Free");
    await expect(notice(page)).toHaveAttribute("data-tone", "ended");
    await expect(notice(page)).toContainText("your account is on the free plan");
    await expect(notice(page)).toContainText("Your charts are kept");
    await expect(page.getByTestId("plan-pay-link")).toHaveText("Pay the open invoice");
    await latestMessageTo(email, /on the free plan/);

    // Paid from Free: the tier comes back.
    await openPayLink(page);
    await page.getByRole("button", { name: "Pay the open invoice" }).click();
    await expect(page.getByTestId("plan-current")).toContainText(tier);
    await expect(notice(page)).toHaveCount(0);
    await expect
      .poll(() => subjects(email).filter((subject) => /plan/.test(subject)))
      .toEqual([
        "your plan has started",
        "a payment for your plan did not go through",
        "your plan's payment has gone through",
        "a payment for your plan did not go through",
        "your account is on the free plan",
        "your plan's payment has gone through",
      ]);
  } finally {
    await setSiteFeatures({ "billing.buy": "hidden" });
    await takeTierOffSale(tier, email);
  }
});
