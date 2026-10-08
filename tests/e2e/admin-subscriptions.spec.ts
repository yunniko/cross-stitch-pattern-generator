import { test, expect, type Page } from "@playwright/test";
import { registerReader, signInAs, signInAsAdmin, uniqueEmail } from "./helpers/auth";
import { putTierOnSale, takeTierOffSale } from "./helpers/billing";
import { setSiteFeatures } from "./helpers/features";

/**
 * G-127 M2 on the fake provider: a person buys; the admin reads their subscription and payment, refunds the payment (the
 * provider's event follows in the history), replaces the tier's price and moves the people on the old one (D381), and sees
 * the provider's figures and the person among the failing payments once a renewal fails. Buying is shown for the run and
 * hidden after; @alone, as the site's rows are shared.
 */

async function personBilling(page: Page, email: string) {
  await page.goto("/admin/users?q=" + encodeURIComponent(email));
  await page.getByTestId("admin-user-row").getByRole("link", { name: email, exact: true }).click();
  await page.getByTestId("admin-user-panel").getByRole("link", { name: "Subscription and payments" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Subscription of");
}

test("a person's subscription read, refunded, moved to the current price, and listed as failing @alone", async ({ page, context }) => {
  const email = uniqueEmail("subscribed");
  const tier = `E2E Subscribed ${email.split("@")[0]}`;
  await putTierOnSale(tier, {});
  try {
    await setSiteFeatures({ "billing.buy": "on" });
    await registerReader(page, email);
    await page.goto("/account/plan");
    await page.getByRole("button", { name: `Choose ${tier}, €10.00 a month` }).click();
    await page.getByRole("button", { name: "Pay" }).click();
    await expect(page.getByTestId("plan-current")).toContainText(tier);

    // The admin reads the subscription, its history and its one payment.
    await context.clearCookies();
    await signInAsAdmin(page);
    await personBilling(page, email);
    await expect(page.getByTestId("person-subscription")).toContainText(tier);
    await expect(page.getByTestId("person-subscription")).toContainText("Bought, €10.00 a month");
    await expect(page.getByTestId("person-history-line").filter({ hasText: "Started, active" })).toHaveCount(1);
    const payment = page.getByTestId("person-payment");
    await expect(payment).toHaveCount(1);
    await expect(payment).toContainText("€10.00");

    // Refunded after a confirmation: the admin's line, then the provider's by the webhook.
    await payment.getByRole("button", { name: /^Refund €10\.00 of / }).click();
    await payment.getByRole("button", { name: "Keep" }).click();
    await expect(payment.getByRole("button", { name: "Confirm refund" })).toHaveCount(0);
    await payment.getByRole("button", { name: /^Refund €10\.00 of / }).click();
    await expect(payment).toContainText("Give back €10.00?");
    await payment.getByRole("button", { name: "Confirm refund" }).click();
    await expect(page.getByTestId("person-billing").getByRole("status")).toHaveText("Refund of €10.00 asked.");
    await page.reload();
    await expect(page.getByTestId("person-payment")).toContainText("All");
    await expect(page.getByTestId("person-payment").getByRole("button", { name: /^Refund/ })).toHaveCount(0);
    const history = page.getByTestId("person-history");
    await expect(history.getByTestId("person-history-line").filter({ hasText: "Refund asked: €10.00 of the payment of" })).toContainText(
      "by an admin"
    );
    await expect(history.getByTestId("person-history-line").filter({ hasText: /^.*Payment .* refunded/ })).toContainText(
      "from the webhook"
    );

    // A new price for the tier, then the people on the old one moved to it.
    await page.goto("/admin/billing");
    const section = page.getByTestId("billing-tier").filter({ has: page.getByRole("heading", { name: tier }) });
    await section.getByRole("textbox", { name: `Amount of a new ${tier} price` }).fill("12");
    await section.getByRole("button", { name: "Replace price" }).click();
    const move = section.getByRole("button", { name: "Move the people on €10.00 a month to €12.00 a month" });
    await expect(move).toBeVisible();
    await expect(section).toContainText("The site does not tell them");
    await move.click();
    await expect(page.getByTestId("billing-admin").getByRole("status")).toHaveText("Moved 1 person.");
    await expect(move).toHaveCount(0);

    await personBilling(page, email);
    await expect(page.getByTestId("person-subscription")).toContainText("Bought, €12.00 a month");
    await expect(
      page.getByTestId("person-history-line").filter({ hasText: "Price €10.00 a month" }).filter({ hasText: "€12.00 a month" })
    ).toContainText("by an admin");
    await expect(page.getByTestId("person-move")).toHaveCount(0);

    // The provider's figures are shown; no one of this run's is failing yet.
    await page.goto("/admin/billing");
    await expect(page.getByTestId("billing-counts")).toContainText("active");
    await expect(page.getByTestId("billing-revenue").first()).toContainText("refunded");
    await expect(page.getByTestId("billing-failing-row").filter({ hasText: email })).toHaveCount(0);

    // The person's renewal fails: they are listed as failing, and may no longer be moved.
    await context.clearCookies();
    await signInAs(page, email);
    await page.goto("/account/plan");
    await page.getByRole("button", { name: "Manage billing" }).click();
    await page.getByRole("button", { name: "Renewal fails" }).click();
    await expect(page).toHaveURL(/\/account\/plan$/);

    await context.clearCookies();
    await signInAsAdmin(page);
    await page.goto("/admin/billing");
    await expect(page.getByTestId("billing-failing-row").filter({ hasText: email })).toHaveCount(1);
    await expect(page.getByTestId("billing-counts")).toContainText("past_due");

    // Each step is in the Change log under Billing.
    await page.goto("/admin/changes?scope=billing");
    const log = page.getByTestId("change-log");
    await expect(log.getByText(`${email}: refund of €10.00 of the payment of`)).toHaveCount(1);
    await expect(log.getByText(`${email}: moved from €10.00 a month to €12.00 a month from the next renewal`)).toHaveCount(1);
  } finally {
    await setSiteFeatures({ "billing.buy": "hidden" });
    await takeTierOffSale(tier, email);
  }
});
