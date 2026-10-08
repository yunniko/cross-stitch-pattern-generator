import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "./helpers/auth";
import { featuresDb } from "./helpers/features";

/**
 * G-126 M2 (D374): the admin sets the grace after a failed renewal, an entry out of range is refused in words, and "Use
 * default" removes the stored value; each change is in the Change log. The setting is the site's, so @alone, and the
 * default is put back whatever happens.
 */

const GRACE = "billing.graceDays";

test("an admin sets the grace, is refused out of range, and puts the default back @alone", async ({ page }) => {
  const setting = page.locator(`[data-testid="setting"][data-setting="${GRACE}"]`);
  const field = setting.getByRole("textbox");
  try {
    await signInAsAdmin(page);
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await expect(setting.getByRole("heading", { name: "Grace after a failed renewal" })).toBeVisible();
    await expect(setting.getByTestId("setting-effective")).toHaveAttribute("data-value", "14");
    await expect(setting.getByTestId("setting-effective")).toContainText("Default: 14 days.");

    await field.fill("61");
    await setting.getByRole("button", { name: "Set", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Enter between 0 and 60 days.");
    await field.fill("seven");
    await setting.getByRole("button", { name: "Set", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Enter a whole number of days.");

    await field.fill("7");
    await setting.getByRole("button", { name: "Set", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(setting.getByTestId("setting-effective")).toHaveAttribute("data-value", "7");
    await expect(setting.getByTestId("setting-effective")).toContainText("Set to 7 days");
    const { rows } = await featuresDb().query<{ value: number }>(`SELECT "value" FROM "SiteSetting" WHERE "key" = $1`, [GRACE]);
    expect(rows).toEqual([{ value: 7 }]);

    await setting.getByRole("button", { name: "Use default" }).click();
    await expect(setting.getByTestId("setting-effective")).toHaveAttribute("data-value", "14");
    await expect(setting.getByRole("button", { name: "Use default" })).toHaveCount(0);

    await page.goto("/admin/changes?scope=settings");
    await expect(page.getByText(`${GRACE} → 7 days`).first()).toBeVisible();
    await expect(page.getByText(`${GRACE} → 14 days (default)`).first()).toBeVisible();
  } finally {
    await featuresDb().query(`DELETE FROM "SiteSetting" WHERE "key" = $1`, [GRACE]);
  }
});
