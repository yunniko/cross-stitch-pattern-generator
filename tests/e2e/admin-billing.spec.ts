import { test, expect, type Page } from "@playwright/test";
import { logIn, READER_PASSWORD, registerReader, signInAsAdmin, uniqueEmail } from "./helpers/auth";
import { takeTierOffSale } from "./helpers/billing";

/**
 * G-127 M1 on the fake provider: the admin makes a tier and its prices, replaces a price and offers the old one again
 * (D380), gives the tier to a person by hand until a day and ends it early (D379), and each step is in the Change log
 * under Billing. Tagged @alone: the tiers are the site's, shared by every worker.
 */

async function openPerson(page: Page, email: string) {
  await page.goto("/admin/users?q=" + encodeURIComponent(email));
  await page.getByTestId("admin-user-row").getByRole("link", { name: email, exact: true }).click();
  await expect(page.getByTestId("admin-user-panel")).toContainText(email);
}

/** The day `days` from now, as the date field takes it. */
const dayAhead = (days: number) => new Date(Date.now() + days * 24 * 3_600_000).toISOString().slice(0, 10);

test("tiers and prices made, replaced and offered again; a tier given by hand and ended @alone", async ({ page, context }) => {
  const email = uniqueEmail("given");
  const tier = `E2E Billing ${email.split("@")[0]}`;
  try {
    await registerReader(page, email);
    await context.clearCookies();
    await signInAsAdmin(page);

    // A tier, then a monthly price, then another in its place.
    await page.goto("/admin/billing");
    await expect(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible();
    await page.getByRole("textbox", { name: "New tier's name" }).fill(tier);
    await page.getByRole("button", { name: "Make a tier" }).click();
    const section = page.getByTestId("billing-tier").filter({ has: page.getByRole("heading", { name: tier }) });
    await expect(section).toContainText("No prices: the tier is not on sale.");

    await section.getByRole("textbox", { name: `Amount of a new ${tier} price` }).fill("4,99");
    await section.getByRole("button", { name: "Add price" }).click();
    const rows = section.getByTestId("billing-price");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("€4.99 a month");
    await expect(rows.first()).toHaveAttribute("data-current", "true");

    await expect(section.getByText("In place of €4.99 a month; the people on it keep it.")).toBeVisible();
    await section.getByRole("textbox", { name: `Amount of a new ${tier} price` }).fill("5.99");
    await section.getByRole("button", { name: "Replace price" }).click();
    await expect(rows).toHaveCount(2);
    const offered = section.locator('[data-testid="billing-price"][data-current="true"]');
    await expect(offered).toHaveCount(1);
    await expect(offered).toContainText("€5.99 a month");

    // A refused amount says why and makes nothing.
    await section.getByRole("textbox", { name: `Amount of a new ${tier} price` }).fill("0");
    await section.getByRole("button", { name: "Replace price" }).click();
    await expect(page.getByTestId("billing-admin").getByRole("alert")).toHaveText("A price is more than zero.");
    await expect(rows).toHaveCount(2);

    await section.getByRole("button", { name: "Offer again €4.99 a month" }).click();
    await expect(offered).toContainText("€4.99 a month");
    await expect(offered).toHaveCount(1);

    // Given by hand to the person until a day; they see it on their plan page.
    await openPerson(page, email);
    const panel = page.getByTestId("admin-user-panel");
    const until = dayAhead(30);
    await panel.getByRole("combobox", { name: "Tier to give" }).selectOption({ label: tier });
    await panel.getByLabel("Ends on").fill(until);
    await panel.getByRole("button", { name: "Give tier" }).click();
    await expect(panel.getByTestId("admin-grant")).toContainText(`Given by hand until ${until}.`);
    await expect(panel).toContainText(tier);

    await context.clearCookies();
    await logIn(page, email, READER_PASSWORD);
    await page.goto("/account/plan");
    await expect(page.getByTestId("plan-current")).toContainText(tier);
    await expect(page.getByTestId("plan-status")).toContainText("Given to you by the site until");

    // Ended now: the person is back on Free.
    await context.clearCookies();
    await signInAsAdmin(page);
    await openPerson(page, email);
    await panel.getByRole("button", { name: "End now" }).click();
    await expect(panel.getByRole("button", { name: "Give tier" })).toBeVisible();
    await expect(panel.getByTestId("admin-grant")).not.toContainText("Given by hand until");

    await context.clearCookies();
    await logIn(page, email, READER_PASSWORD);
    await page.goto("/account/plan");
    await expect(page.getByTestId("plan-status")).toContainText("The plan the site gave you has ended.");

    // Each step is in the Change log under Billing.
    await context.clearCookies();
    await signInAsAdmin(page);
    await page.goto("/admin/changes?scope=billing");
    const log = page.getByTestId("change-log");
    await expect(log.getByText(`tier "${tier}": €4.99 a month offered`, { exact: true })).toHaveCount(1);
    await expect(log.getByText(`tier "${tier}": €5.99 a month offered, replacing €4.99 a month`)).toHaveCount(1);
    await expect(log.getByText(`tier "${tier}": €4.99 a month offered again, replacing €5.99 a month`)).toHaveCount(1);
    await expect(log.getByText(`${email}: given "${tier}" until ${until}`)).toHaveCount(1);
    await expect(log.getByText(`${email}: "${tier}" given by hand ended`)).toHaveCount(1);
  } finally {
    await takeTierOffSale(tier, email);
  }
});
