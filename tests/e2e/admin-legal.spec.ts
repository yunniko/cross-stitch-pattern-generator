import { test, expect, type Page } from "@playwright/test";
import { signInAsAdmin } from "./helpers/auth";

/**
 * G-128 M1 (D383): the admin writes the terms, previews them with their markup shown as text, and publishes two
 * versions; `/terms` shows the newer and lists the older, which stays readable; the same text again is refused; each
 * publish is in the Change log under Documents, and the account links the terms. @alone: the documents are the site's.
 */

const terms = (page: Page) => page.getByTestId("legal-document").filter({ has: page.getByRole("heading", { name: "Terms of service" }) });

/** The version the next publish takes, read from its button. */
async function nextVersion(page: Page): Promise<number> {
  const label = await terms(page)
    .getByRole("button", { name: /^Publish version \d+$/ })
    .textContent();
  return Number(label!.replace(/\D+/g, ""));
}

async function publish(page: Page, text: string): Promise<number> {
  const version = await nextVersion(page);
  await terms(page).getByRole("textbox", { name: "Text of the terms of service" }).fill(text);
  await terms(page)
    .getByRole("button", { name: `Publish version ${version}` })
    .click();
  await terms(page).getByRole("button", { name: "Confirm publish" }).click();
  await expect(terms(page).getByTestId("legal-in-force")).toContainText(`Version ${version}, in force since`);
  return version;
}

test("terms written, previewed, published twice and read at /terms, each version kept @alone", async ({ page }) => {
  const token = `e2e-${Date.now()}`;
  await signInAsAdmin(page);
  await page.goto("/admin/legal");
  await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();

  // The preview shows markup as text and keeps no unsafe link.
  const box = terms(page).getByRole("textbox", { name: "Text of the terms of service" });
  await box.fill(`# Terms ${token}\n\nFirst <b>version</b>. [Bad](javascript:alert(1)) and [Stripe](https://stripe.com/privacy).`);
  await terms(page).getByRole("button", { name: "Preview" }).click();
  const preview = terms(page).getByTestId("legal-preview");
  await expect(preview).toContainText("First <b>version</b>.");
  await expect(preview.locator("b")).toHaveCount(0);
  await expect(preview.getByRole("link", { name: "Bad" })).toHaveCount(0);
  await expect(preview.getByRole("link", { name: "Stripe" })).toHaveAttribute("href", "https://stripe.com/privacy");
  await terms(page).getByRole("button", { name: "Edit" }).click();

  // Asked first, then published; "Keep editing" publishes nothing.
  const before = await nextVersion(page);
  await terms(page)
    .getByRole("button", { name: `Publish version ${before}` })
    .click();
  await terms(page).getByRole("button", { name: "Keep editing" }).click();
  expect(await nextVersion(page)).toBe(before);

  const first = await publish(page, `# Terms ${token}\n\nThe first version.`);
  const second = await publish(page, `# Terms ${token}\n\nThe second version.`);
  expect(second).toBe(first + 1);

  // The same text again is refused.
  await terms(page)
    .getByRole("button", { name: `Publish version ${second + 1}` })
    .click();
  await terms(page).getByRole("button", { name: "Confirm publish" }).click();
  await expect(terms(page).getByRole("alert")).toHaveText("The text is the same as the version in force: there is nothing new to publish.");

  // The page shows the newer version and lists the older, which is still readable.
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of service", level: 1 })).toBeVisible();
  await expect(page.getByTestId("legal-version")).toContainText(`Version ${second}, in force since`);
  await expect(page.getByTestId("legal-page")).toContainText("The second version.");
  await page
    .getByTestId("legal-history-line")
    .getByRole("link", { name: new RegExp(`^Version ${first}, `) })
    .click();
  await expect(page).toHaveURL(new RegExp(`/terms\\?version=${first}$`));
  await expect(page.getByTestId("legal-page")).toContainText("The first version.");
  await expect(page.getByTestId("legal-version")).toContainText("no longer in force");

  const missing = await page.goto("/terms?version=999999");
  expect(missing?.status()).toBe(404);

  // Logged under Documents; the account links the published terms.
  await page.goto("/admin/changes?scope=legal");
  const log = page.getByTestId("change-log");
  await expect(log.getByText(`Terms of service: version ${first} published`, { exact: true })).toHaveCount(1);
  await expect(log.getByText(`Terms of service: version ${second} published`, { exact: true })).toHaveCount(1);
  await page.goto("/account");
  await expect(page.getByTestId("legal-links").getByRole("link", { name: "Terms of service" })).toHaveAttribute("href", "/terms");
  // Registration links it too: read when asked, not frozen at the build, which saw no document.
  await page.goto("/register");
  await expect(page.getByTestId("legal-links").getByRole("link", { name: "Terms of service" })).toHaveAttribute("href", "/terms");
});
