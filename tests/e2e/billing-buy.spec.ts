import { test, expect, type Page } from "@playwright/test";
import { openSmallChart } from "./helpers/app";
import { logIn, READER_PASSWORD, registerReader, uniqueEmail } from "./helpers/auth";
import { agreeAndChoose, consentsOf, ensureLegalDocuments, putTierOnSale, subscriptionHistory, takeTierOffSale } from "./helpers/billing";
import { clearSiteFeatures, setSiteFeatures } from "./helpers/features";

/**
 * G-106 M3, Acceptance 9 on the fake provider: subscribe, get the tier's features, cancel at the period's end, keep the
 * tier until the period ends, then Free. The fake's Checkout and Portal are this server's own pages, and its events go
 * through the real webhook into Postgres (D373), so the whole write path runs.
 *
 * Buying starts hidden (D372); these specs show it, and put it back hidden. Tagged @alone: the site's rows are state
 * every worker shares.
 */

const SITE = { "billing.buy": "on", "tool.text": "locked" } as const;

async function textTool(page: Page) {
  await openSmallChart(page);
  return page.getByTestId("tool-rail").getByRole("button", { name: /^Text/ });
}

test.describe("buying a plan", () => {
  // The second uses the account the first registers.
  test.describe.configure({ mode: "serial" });
  const email = uniqueEmail("buyer");
  const tier = `E2E Personal ${email.split("@")[0]}`;
  test.beforeAll(async () => {
    await putTierOnSale(tier, { "tool.text": "ON" });
    await ensureLegalDocuments();
  });
  test.afterAll(async () => {
    await setSiteFeatures({ "billing.buy": "hidden" });
    await clearSiteFeatures(["tool.text"]);
    await takeTierOffSale(tier, email);
  });

  test("hidden, buying offers nothing; shown, a cancelled Checkout charges nothing @alone", async ({ page }) => {
    await registerReader(page, email);
    await setSiteFeatures({ "billing.buy": "hidden" });
    await page.goto("/account/plan");
    await expect(page.getByTestId("plan-current")).toContainText("Free");
    await expect(page.getByTestId("plan-offer")).toHaveCount(0);
    await expect(page.getByText("Paid plans are not on sale yet.")).toBeVisible();

    await setSiteFeatures(SITE);
    await page.reload();
    const offer = page.getByTestId("plan-offer").filter({ hasText: tier });
    await expect(offer).toContainText("€10.00 a month");
    await expect(offer).toContainText("€100.00 a year");
    // Nothing is chosen until the terms are agreed to and the withdrawal acknowledged (D384).
    const choose = offer.getByRole("button", { name: `Choose ${tier}, €10.00 a month` });
    await expect(choose).toBeDisabled();
    await expect(page.getByTestId("plan-withdrawal-text")).toContainText("lose the right to withdraw");
    await page
      .getByTestId("plan-consent")
      .getByRole("checkbox", { name: /^I agree to the terms of service/ })
      .check();
    await expect(choose).toBeDisabled();
    await agreeAndChoose(page, `Choose ${tier}, €10.00 a month`);
    await expect(page.getByRole("heading", { name: "Test checkout" })).toBeVisible();
    await expect(page.getByTestId("fake-checkout-price")).toContainText(`${tier}: €10.00 a month`);
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page.getByTestId("plan-notice")).toContainText("Nothing was charged.");
    await expect(page.getByTestId("plan-current")).toContainText("Free");
  });

  test("subscribe, the tier's features, cancel at the period's end, the tier kept, then Free @alone", async ({ page }) => {
    await setSiteFeatures(SITE);
    await logIn(page, email, READER_PASSWORD);
    await expect(page).toHaveURL(/\/account$/);
    await expect(await textTool(page)).toHaveAttribute("aria-disabled", "true");

    // Checkout: paid on the fake's page, the events delivered to the webhook before the person is sent back.
    await page.goto("/account/plan");
    await agreeAndChoose(page, `Choose ${tier}, €10.00 a month`);
    await page.getByRole("button", { name: "Pay" }).click();
    await expect(page).toHaveURL(/\/account\/plan\?checkout=done$/);
    await expect(page.getByTestId("plan-current")).toContainText(tier);
    await expect(page.getByTestId("plan-status")).toContainText("Renews on");
    // One live subscription: no second Checkout is offered.
    await expect(page.getByRole("button", { name: /^Choose / })).toHaveCount(0);
    await expect(page.getByTestId("plan-offer").filter({ hasText: tier })).toContainText("You have a plan.");
    await expect(await textTool(page)).toBeEnabled();

    // The Portal: cancelled at the period's end, the tier kept meanwhile.
    await page.goto("/account/plan");
    await page.getByRole("button", { name: "Manage billing" }).click();
    await expect(page.getByRole("heading", { name: "Test billing portal" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel plan" }).click();
    await expect(page).toHaveURL(/\/account\/plan$/);
    await expect(page.getByTestId("plan-current")).toContainText(tier);
    await expect(page.getByTestId("plan-status")).toContainText("will not renew");

    // The period ends: Free, and the tier's feature with it.
    await page.getByRole("button", { name: "Manage billing" }).click();
    await page.getByRole("button", { name: "End the period now" }).click();
    await expect(page).toHaveURL(/\/account\/plan$/);
    await expect(page.getByTestId("plan-current")).toContainText("Free");
    await expect(page.getByTestId("plan-status")).toContainText("Your paid plan has ended.");
    await expect(await textTool(page)).toHaveAttribute("aria-disabled", "true");

    // What the webhook recorded, in Postgres.
    const history = await subscriptionHistory(email);
    expect(history.map((entry) => entry.kind)).toEqual(expect.arrayContaining(["created", "cancel", "status"]));
    expect(new Set(history.map((entry) => entry.source))).toEqual(new Set(["webhook"]));
    // Each Checkout recorded its consent; the paid one is tied to the subscription, the cancelled one is not.
    expect(await consentsOf(email)).toEqual([
      { termsKind: "terms", withdrawalKind: "withdrawal", linked: true },
      { termsKind: "terms", withdrawalKind: "withdrawal", linked: false },
    ]);
  });
});
