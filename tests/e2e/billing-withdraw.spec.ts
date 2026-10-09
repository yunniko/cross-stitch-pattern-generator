import { test, expect, type Page } from "@playwright/test";
import { registerReader, uniqueEmail } from "./helpers/auth";
import { agreeAndChoose, ensureLegalDocuments, putTierOnSale, subscriptionHistory, takeTierOffSale } from "./helpers/billing";
import { featuresDb, setSiteFeatures } from "./helpers/features";
import { messagesTo } from "./helpers/mail";

/**
 * G-129 M2 on the fake provider (D387): within the 14 days the Plan page offers a withdrawal, asks to confirm it, ends the
 * plan at once and gives back the unused part — once, however often it is pressed — and acknowledges it; from day 15 it
 * is not offered. The fake's Portal moves the subscription's start back, so day 3 and day 15 come without waiting.
 * Buying is shown for the run and hidden after; @alone, as the site's rows are shared.
 */

async function buy(page: Page, tier: string) {
  await page.goto("/account/plan");
  await agreeAndChoose(page, `Choose ${tier}, €10.00 a month`);
  await page.getByRole("button", { name: "Pay" }).click();
  await expect(page.getByTestId("plan-current")).toContainText(tier);
}

async function begunDaysAgo(page: Page, days: 3 | 15) {
  await page.getByRole("button", { name: "Manage billing" }).click();
  await page.getByRole("button", { name: `Begun ${days} days ago` }).click();
  await expect(page).toHaveURL(/\/account\/plan$/);
}

async function withdrawalsOf(email: string): Promise<number> {
  const { rows } = await featuresDb().query<{ count: string }>(
    `SELECT count(*) AS "count" FROM "Withdrawal" w JOIN "User" u ON u."id" = w."userId" WHERE u."email" = $1 AND w."completedAt" IS NOT NULL`,
    [email]
  );
  return Number(rows[0].count);
}

test("withdrawing on day 3: confirmed, ended at once, 27/30 given back once, acknowledged @alone", async ({ page }) => {
  const email = uniqueEmail("withdraw");
  const tier = `E2E Withdraw ${email.split("@")[0]}`;
  await putTierOnSale(tier, {});
  await ensureLegalDocuments();
  try {
    await setSiteFeatures({ "billing.buy": "on" });
    await registerReader(page, email);
    await buy(page, tier);
    const open = page.getByTestId("plan-withdrawal-open");
    await expect(open).toContainText("You can withdraw from this contract until the end of");

    // Day 3 of 30: €9.00 of the €10.00 is for time not yet used.
    await begunDaysAgo(page, 3);
    await open.getByRole("button", { name: "Withdraw from contract" }).click();
    const confirm = page.getByTestId("plan-withdraw-confirm");
    await expect(confirm).toContainText("Withdrawing ends your plan now");
    await expect(confirm).toContainText("About €9.00 is given back");
    // Keeping the plan changes nothing.
    await confirm.getByRole("button", { name: "Keep my plan" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId("plan-current")).toContainText(tier);

    // Confirmed with a double click: one withdrawal, one refund.
    await open.getByRole("button", { name: "Withdraw from contract" }).click();
    await confirm.getByRole("button", { name: "Confirm withdrawal" }).dblclick();
    const ack = page.getByTestId("plan-withdrawal-ack");
    await expect(ack).toContainText("We received your withdrawal from the contract on");
    await expect(ack).toContainText("Your plan has ended");
    await expect(ack).toContainText("€9.00 is given back to the card you paid with");
    await expect(page.getByTestId("plan-current")).toContainText("Free");
    await expect(page.getByRole("button", { name: "Withdraw from contract" })).toHaveCount(0);

    // Pressed again from a stale page, or the page reloaded: still the one withdrawal.
    await page.reload();
    await expect(ack).toContainText("€9.00 is given back");
    expect(await withdrawalsOf(email)).toBe(1);
    // Acknowledged by mail too, once, with what was received and given back (D389).
    const receipts = messagesTo(email).filter((message) => /we received your withdrawal/.test(message.subject));
    expect(receipts).toHaveLength(1);
    expect(receipts[0].text).toContain("We received your withdrawal from the contract on");
    expect(receipts[0].text).toContain("€9.00 is given back to the card you paid with");
    await expect
      .poll(async () => (await subscriptionHistory(email)).filter((entry) => ["withdrawal", "refund"].includes(entry.kind)))
      .toEqual([
        { kind: "withdrawal", source: "person" },
        { kind: "refund", source: "webhook" },
      ]);
  } finally {
    await setSiteFeatures({ "billing.buy": "hidden" });
    await takeTierOffSale(tier, email);
  }
});

test("from day 15 no withdrawal is offered, and the plan stays @alone", async ({ page }) => {
  const email = uniqueEmail("late");
  const tier = `E2E Late ${email.split("@")[0]}`;
  await putTierOnSale(tier, {});
  await ensureLegalDocuments();
  try {
    await setSiteFeatures({ "billing.buy": "on" });
    await registerReader(page, email);
    await buy(page, tier);
    await expect(page.getByTestId("plan-withdrawal-open")).toBeVisible();
    await begunDaysAgo(page, 15);
    await expect(page.getByTestId("plan-current")).toContainText(tier);
    await expect(page.getByTestId("plan-withdrawal-open")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Withdraw from contract" })).toHaveCount(0);
  } finally {
    await setSiteFeatures({ "billing.buy": "hidden" });
    await takeTierOffSale(tier, email);
  }
});
