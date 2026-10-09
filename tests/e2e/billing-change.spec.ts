import { test, expect, type Page } from "@playwright/test";
import { registerReader, uniqueEmail } from "./helpers/auth";
import { agreeAndChoose, consentsOf, ensureLegalDocuments, putTierOnSale, takeTierOffSale } from "./helpers/billing";
import { setSiteFeatures } from "./helpers/features";

/**
 * G-129 M3 on the fake provider (D388): a plan held is changed from the Plan page — to more at once, with the agreement
 * asked again; to less at the renewal, which can be dropped until then — cancelled at the period's end and kept, and not
 * changed while a payment fails, though still cancelled. The fake's Portal ends the period and fails the renewal, so
 * neither needs waiting. Buying is shown for the run and hidden after; @alone, as the site's rows are shared.
 */

const MONTH = "€10.00 a month";
const YEAR = "€100.00 a year";

async function buyMonthly(page: Page, tier: string) {
  await page.goto("/account/plan");
  await agreeAndChoose(page, `Choose ${tier}, ${MONTH}`);
  await page.getByRole("button", { name: "Pay" }).click();
  await expect(page.getByTestId("plan-current")).toContainText(tier);
}

async function inThePortal(page: Page, button: "End the period now" | "Renewal fails") {
  await page.getByRole("button", { name: "Manage billing" }).click();
  await page.getByRole("button", { name: button }).click();
  await expect(page).toHaveURL(/\/account\/plan$/);
}

/** The price row marked as the person's own. */
const yourPlan = (page: Page) => page.getByTestId("plan-offer").locator("div", { hasText: "Your plan" }).last();

test("upgrading at once with the agreement, then a downgrade waiting for the renewal, dropped and taken @alone", async ({ page }) => {
  const email = uniqueEmail("change");
  const tier = `E2E Change ${email.split("@")[0]}`;
  await putTierOnSale(tier, {});
  await ensureLegalDocuments();
  try {
    await setSiteFeatures({ "billing.buy": "on" });
    await registerReader(page, email);
    await buyMonthly(page, tier);
    await expect(yourPlan(page)).toContainText(MONTH);

    // A longer period is more: it starts now, and only once the terms are agreed to again.
    const upgrade = page.getByRole("button", { name: `Upgrade to ${tier}, ${YEAR}` });
    await expect(upgrade).toBeDisabled();
    const consent = page.getByTestId("plan-consent");
    await consent.getByRole("checkbox", { name: /^I agree to the terms of service/ }).check();
    await consent.getByRole("checkbox", { name: "I agree to the following:" }).check();
    await upgrade.click();
    const confirm = page.getByTestId("plan-change-confirm");
    await expect(confirm).toContainText("The difference for the rest of this period is charged to your card at once");
    await confirm.getByRole("button", { name: "Confirm upgrade" }).click();
    await expect(yourPlan(page)).toContainText(YEAR);
    // The purchase and the upgrade each have their agreement, tied to the subscription.
    await expect.poll(async () => (await consentsOf(email)).map((row) => row.linked)).toEqual([true, true]);

    // A shorter period is less: it waits for the renewal, and nothing is asked or charged now.
    await page.getByRole("button", { name: `Downgrade to ${tier}, ${MONTH}` }).click();
    await expect(confirm).toContainText("Nothing is charged now, and you keep your current plan until then.");
    await confirm.getByRole("button", { name: "Confirm downgrade" }).click();
    const scheduled = page.getByTestId("plan-scheduled");
    await expect(scheduled).toContainText(`Changes to ${tier}, ${MONTH} on`);
    await expect(yourPlan(page)).toContainText(YEAR);

    // Dropped, the plan renews as it is; chosen again, the renewal takes it.
    await scheduled.getByRole("button", { name: "Keep current plan" }).click();
    await expect(scheduled).toHaveCount(0);
    await page.getByRole("button", { name: `Downgrade to ${tier}, ${MONTH}` }).click();
    await confirm.getByRole("button", { name: "Confirm downgrade" }).click();
    await expect(scheduled).toBeVisible();
    await inThePortal(page, "End the period now");
    await expect(scheduled).toHaveCount(0);
    await expect(yourPlan(page)).toContainText(MONTH);
    expect(await consentsOf(email)).toHaveLength(2);
  } finally {
    await setSiteFeatures({ "billing.buy": "hidden" });
    await takeTierOffSale(tier, email);
  }
});

test("cancelling and keeping the plan; while a payment fails it is cancelled but not changed @alone", async ({ page }) => {
  const email = uniqueEmail("cancel");
  const tier = `E2E Cancel ${email.split("@")[0]}`;
  await putTierOnSale(tier, {});
  await ensureLegalDocuments();
  try {
    await setSiteFeatures({ "billing.buy": "on" });
    await registerReader(page, email);
    await buyMonthly(page, tier);
    const current = page.getByTestId("plan-current");

    await current.getByRole("button", { name: "Cancel plan" }).click();
    const confirm = page.getByTestId("plan-cancel-confirm");
    await expect(confirm).toContainText("then the account moves to the free plan; your charts are kept");
    await confirm.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(confirm).toHaveCount(0);
    // A plan set to end is kept before it is changed.
    await expect(page.getByTestId("plan-offer")).toContainText("Your plan is set to end. Press Keep my plan first");
    await expect(page.getByRole("button", { name: `Upgrade to ${tier}, ${YEAR}` })).toHaveCount(0);
    await current.getByRole("button", { name: "Keep my plan" }).click();
    await expect(current.getByRole("button", { name: "Cancel plan" })).toBeVisible();
    await expect(page.getByRole("button", { name: `Upgrade to ${tier}, ${YEAR}` })).toBeVisible();

    // A failing renewal is paid before anything is changed; the plan can still be cancelled.
    await inThePortal(page, "Renewal fails");
    await expect(page.getByTestId("plan-offer")).toContainText("A payment for your plan is not complete. Pay it first");
    await expect(page.getByRole("button", { name: `Upgrade to ${tier}, ${YEAR}` })).toHaveCount(0);
    await current.getByRole("button", { name: "Cancel plan" }).click();
    await confirm.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(current.getByRole("button", { name: "Keep my plan" })).toBeVisible();
  } finally {
    await setSiteFeatures({ "billing.buy": "hidden" });
    await takeTierOffSale(tier, email);
  }
});
