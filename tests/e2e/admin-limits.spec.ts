import { test, expect, type Page } from "@playwright/test";
import { registerReader, signInAsAdmin, uniqueEmail } from "./helpers/auth";
import { clearLimits, clearPersonFeatures, ensureTier, featuresDb, storedLimit } from "./helpers/features";

/**
 * G-108 M1 (D353): the admin sets a limit for the site, guests, signed-in accounts, a tier and one person, on the Features
 * page's Limits tab and on the person's page. Limit rows are shared state, so the case runs @alone and clears what it set.
 */

const CHARTS = "storage.charts";
const limitRow = (page: Page, layer: string) =>
  page.locator(`[data-testid="limit"][data-limit="${CHARTS}"] [data-testid="limit-row"][data-layer="${layer}"]`);

async function setLimit(page: Page, layer: string, text: string) {
  const row = limitRow(page, layer);
  await row.getByRole("textbox").fill(text);
  await row.getByRole("button", { name: "Set", exact: true }).click();
}

test("an admin sets the space for saved charts per layer; each shows what it gives, and the changes are logged @alone", async ({
  page,
  browser,
}) => {
  const email = uniqueEmail("limited");
  const tier = `e2e limits ${Date.now().toString(36)}`;
  const reader = await browser.newContext();
  await registerReader(await reader.newPage(), email);
  await reader.close();
  await ensureTier(tier);
  try {
    await signInAsAdmin(page);
    await page.goto("/admin/features");
    await page.getByRole("tab", { name: "Limits", exact: true }).click();
    const limits = page.getByTestId("limits");
    await expect(limits.getByRole("heading", { name: "Space for saved charts" })).toBeVisible();
    // Nothing set: every layer gets the list's default.
    await expect(limitRow(page, "site").getByTestId("limit-effective")).toContainText("50 MB");
    await expect(limitRow(page, `tier:${tier}`).getByTestId("limit-effective")).toContainText("50 MB");
    await expect(limitRow(page, "guests")).toContainText("No effect while");

    // The site, then accounts over it, then the tier over accounts.
    await setLimit(page, "site", "20");
    await expect(limitRow(page, "site").getByTestId("limit-effective")).toHaveText("20 MB");
    await expect(limitRow(page, "accounts").getByTestId("limit-effective")).toContainText("20 MB");
    await setLimit(page, "accounts", "100");
    await expect(limitRow(page, "accounts").getByTestId("limit-effective")).toHaveText("100 MB");
    await expect(limitRow(page, "guests").getByTestId("limit-effective")).toContainText("20 MB");
    await expect(limitRow(page, `tier:${tier}`).getByTestId("limit-effective")).toContainText("100 MB");
    await setLimit(page, `tier:${tier}`, "Unlimited");
    await expect(limitRow(page, `tier:${tier}`).getByTestId("limit-effective")).toHaveText("Unlimited");

    // Refused input says what is allowed and changes nothing.
    await setLimit(page, "guests", "lots");
    await expect(page.getByRole("alert")).toContainText('a whole number of MB, or "unlimited"');
    expect(await storedLimit("AudienceLimit", `"audience" = 'guests'`, [])).toBeUndefined();

    // Kept, as stored values: a number, and null for unlimited.
    expect(await storedLimit("SiteLimit", `"limitId" = $1`, [CHARTS])).toBe(20);
    expect(await storedLimit("AudienceLimit", `"audience" = 'accounts' AND "limitId" = $1`, [CHARTS])).toBe(100);
    expect(await storedLimit("TierLimit", `"tierId" = (SELECT "id" FROM "Tier" WHERE "name" = $1)`, [tier])).toBeNull();

    // Emptied, the site follows the default again.
    await setLimit(page, "site", "");
    await expect(limitRow(page, "site").getByTestId("limit-effective")).toContainText("50 MB");
    expect(await storedLimit("SiteLimit", `"limitId" = $1`, [CHARTS])).toBeUndefined();

    // One person: their own value, over what accounts give them.
    const { rows } = await featuresDb().query<{ id: string }>(`SELECT "id" FROM "User" WHERE "email" = $1`, [email]);
    await page.goto(`/admin/users/${rows[0].id}/features`);
    const own = page.getByTestId("user-limits").getByTestId("limit-row");
    await expect(own.getByTestId("limit-effective")).toContainText("100 MB");
    await own.getByRole("textbox").fill("3");
    await own.getByRole("button", { name: "Set", exact: true }).click();
    await expect(own.getByTestId("limit-effective")).toHaveText("3 MB");
    expect(await storedLimit("UserLimit", `"userId" = $1 AND "limitId" = $2`, [rows[0].id, CHARTS])).toBe(3);

    // Logged, with who made each change.
    await page.goto("/admin/features");
    await page.getByRole("tab", { name: "Changes" }).click();
    const changes = page.getByTestId("feature-changes");
    await expect(changes.getByText(`accounts: ${CHARTS} → 100 MB`).first()).toBeVisible();
    await expect(changes.getByText(`tier "${tier}": ${CHARTS} → Unlimited`).first()).toBeVisible();
    await expect(changes.getByText(`${email}: ${CHARTS} → 3 MB`).first()).toBeVisible();
  } finally {
    await clearLimits(email);
    await clearPersonFeatures(email, tier);
  }
});
