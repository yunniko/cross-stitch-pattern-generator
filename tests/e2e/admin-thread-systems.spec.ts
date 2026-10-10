import { test, expect, type Page } from "@playwright/test";
import { signInAsAdmin } from "./helpers/auth";

/**
 * G-132 M3 (D401): the admin adds a thread system from a file, sees it among the site's, edits its name and threads by
 * hand, downloads it, finds its switch on the Features page, and deletes it, which takes the switch too; each step is in
 * the Change log under Thread systems. @alone: the systems are the site's, and it deletes what it adds.
 */

const card = (page: Page, key: string) => page.locator(`[data-testid="thread-system"][data-key="${key}"]`);

test("a thread system added from a file, edited, downloaded, switched and deleted, each logged @alone", async ({ page }) => {
  const key = `e2e-${Date.now()}`;
  await signInAsAdmin(page);
  await page.goto("/admin/thread-systems");
  await expect(page.getByRole("heading", { name: "Thread systems", level: 1 })).toBeVisible();
  // The seeded three are listed with their threads.
  await expect(card(page, "dmc").getByTestId("thread-system-count")).toHaveText("454 threads");

  // Added from a JSON file: its name and licence fill the form, and the file's name the key.
  await page.getByRole("button", { name: "Add a system" }).click();
  const form = page.getByTestId("thread-system-form");
  const file = JSON.stringify({
    name: "E2E Silk",
    licence: "CC0",
    threads: [{ number: "S1", name: "Ivory", hex: "#fffff0" }, ["S2", "Coal", "#202020"]],
  });
  await form
    .getByTestId("thread-system-file")
    .setInputFiles({ name: `${key}.json`, mimeType: "application/json", buffer: Buffer.from(file) });
  await expect(form.getByTestId("thread-system-check")).toHaveText("2 threads read.");
  await expect(form.getByTestId("thread-system-key")).toHaveValue(key);
  await expect(form.getByTestId("thread-system-label")).toHaveValue("E2E Silk");
  await expect(form.getByTestId("thread-system-licence")).toHaveValue("CC0");

  // A broken list is named by its line, and cannot be added.
  await form.getByTestId("thread-system-list").fill("S1,Ivory,#fffff0\nS2,Coal");
  await expect(form.getByTestId("thread-system-check")).toHaveText("Line 2 has 2 cells: each line is a number, a name and a colour.");
  await expect(form.getByRole("button", { name: "Add the system" })).toBeDisabled();
  await form.getByTestId("thread-system-list").fill("S1,Ivory,#fffff0\nS2,Coal,#202020");
  await form.getByRole("button", { name: "Add the system" }).click();
  await expect(card(page, key).getByTestId("thread-system-count")).toHaveText("2 threads");

  // The same key again is refused.
  await page.getByRole("button", { name: "Add a system" }).click();
  await form.getByTestId("thread-system-key").fill(key);
  await form.getByTestId("thread-system-label").fill("Again");
  await form.getByTestId("thread-system-list").fill("X1,,#000000");
  await form.getByRole("button", { name: "Add the system" }).click();
  await expect(form.getByRole("alert")).toHaveText(`There is already a system "${key}".`);
  await form.getByRole("button", { name: "Cancel" }).click();

  // Edited by hand: a new name and a third thread.
  await card(page, key).getByRole("button", { name: "Edit" }).click();
  await form.getByTestId("thread-system-label").fill("E2E Silk Two");
  const list = form.getByTestId("thread-system-list");
  await list.fill(`${await list.inputValue()}S3,Rose,#e0a0b0\n`);
  await expect(form.getByTestId("thread-system-check")).toHaveText("3 threads read.");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(card(page, key).getByRole("heading", { name: "E2E Silk Two" })).toBeVisible();
  await expect(card(page, key).getByTestId("thread-system-count")).toHaveText("3 threads");

  // Downloaded as CSV, which reads back as the list.
  const download = page.waitForEvent("download");
  await card(page, key).getByRole("button", { name: "Download CSV" }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe(`${key}.csv`);
  const stream = await saved.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString("utf8")).toBe("number,name,hex\nS1,Ivory,#fffff0\nS2,Coal,#202020\nS3,Rose,#e0a0b0\n");

  // Its switch is on the Features page under Thread brands, by its name.
  await page.goto("/admin/features");
  const row = page.locator(`[data-testid="site-features"] [data-testid="feature-row"][data-feature="brand.${key}"]`);
  await expect(row).toContainText("E2E Silk Two");
  await row.getByRole("group").getByRole("button", { name: "Locked", exact: true }).click();
  await expect(row).toHaveAttribute("data-state", "locked");

  // Deleted after a second ask; its switch goes with it.
  await page.goto("/admin/thread-systems");
  await card(page, key).getByRole("button", { name: "Delete" }).click();
  await card(page, key).getByRole("button", { name: "Keep it" }).click();
  await expect(card(page, key)).toBeVisible();
  await card(page, key).getByRole("button", { name: "Delete" }).click();
  await card(page, key).getByRole("button", { name: "Confirm delete" }).click();
  await expect(card(page, key)).toHaveCount(0);
  await page.goto("/admin/features");
  await expect(page.locator(`[data-testid="feature-row"][data-feature="brand.${key}"]`)).toHaveCount(0);

  await page.goto("/admin/changes?scope=threads");
  const log = page.getByTestId("change-log");
  await expect(log.getByText(`E2E Silk (${key}) added, 2 threads`, { exact: true })).toHaveCount(1);
  await expect(log.getByText(`E2E Silk Two (${key}): renamed from E2E Silk, threads replaced (2 → 3)`, { exact: true })).toHaveCount(1);
  await expect(log.getByText(`E2E Silk Two (${key}) deleted, with its switches`, { exact: true })).toHaveCount(1);
});

test("the page sends a visitor away @alone", async ({ page }) => {
  await page.goto("/admin/thread-systems");
  await expect(page).not.toHaveURL(/\/admin\/thread-systems/);
});
