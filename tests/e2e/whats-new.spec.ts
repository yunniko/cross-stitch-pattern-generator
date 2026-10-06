import { test, expect, type Page } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { openPreferences } from "./helpers/app";
import { RELEASES_DIR, compareVersionsNewestFirst, parseRelease } from "../../lib/release-notes/release";

/**
 * G-105 M3, D310: "What's new", every release's notes newest first, and the two ways to it — the link at the foot of
 * Preferences and the command list. Both open it in a tab of its own, so the chart being worked on stays where it is.
 */

/** The releases the build was made from, newest first: what the page must show. */
async function releasesOnDisk() {
  const names = await readdir(RELEASES_DIR).catch(() => [] as string[]);
  const releases = await Promise.all(
    names.filter((name) => name.endsWith(".md")).map(async (name) => parseRelease(await readFile(path.join(RELEASES_DIR, name), "utf8")))
  );
  return releases.flatMap((release) => (release ? [release] : [])).sort((a, b) => compareVersionsNewestFirst(a.version, b.version));
}

async function expectWhatsNew(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "What's new" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the editor" })).toHaveAttribute("href", "/");
}

test("lists every release newest first, and marks the one this page is", async ({ page }) => {
  const releases = await releasesOnDisk();
  const { version } = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
  await page.goto("/whats-new");
  await expectWhatsNew(page);
  const headings = page.getByRole("heading", { level: 2 });
  if (releases.length === 0) {
    await expect(page.getByText("No release has notes yet.")).toBeVisible();
    await expect(headings).toHaveCount(0);
    return;
  }
  await expect(headings).toHaveCount(releases.length);
  for (const [index, release] of releases.entries()) await expect(headings.nth(index)).toContainText(release.version);
  const current = page.getByRole("region", { name: new RegExp(`^${version.replaceAll(".", "\\.")}\\b`) });
  await expect(current.getByText("this version")).toBeVisible();
  await expect(page.getByText("this version")).toHaveCount(1);
});

test("the link at the foot of Preferences opens it in a tab of its own", async ({ page, context }) => {
  await page.goto("/");
  const preferences = await openPreferences(page);
  const opened = context.waitForEvent("page");
  await preferences.getByRole("link", { name: "What's new" }).click();
  const tab = await opened;
  await expect(tab).toHaveURL(/\/whats-new$/);
  await expectWhatsNew(tab);
  // The editor is still there, Preferences and all.
  await expect(preferences).toBeVisible();
});

test("the command list opens it too, in a tab of its own", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  const search = page.getByRole("combobox", { name: "Search commands" });
  await search.fill("what's new");
  const list = page.getByRole("dialog", { name: "Commands" });
  await expect(list.locator('[data-command="view.whats-new"]')).toBeVisible();
  const opened = context.waitForEvent("page");
  await search.press("Enter");
  const tab = await opened;
  await expect(tab).toHaveURL(/\/whats-new$/);
  await expectWhatsNew(tab);
});
