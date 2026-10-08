import { test, expect, type Page } from "@playwright/test";
import { CURRENT_PROJECT_KEY, PROJECT_DB_NAME, PROJECT_DB_VERSION, PROJECT_OBJECT_STORE } from "../../lib/editor/project-store";
import { openSmallChart, saveButton, saveMenuItem } from "./helpers/app";
import { registerReader, uniqueEmail } from "./helpers/auth";
import { clearPersonFeatures, setUserFeatures } from "./helpers/features";

/**
 * G-108 part 1 M3 (D355): Save is a menu, the account above the file. The first Save makes a chart with an id of the
 * server's; every Save after overwrites that one whatever the chart is called by then; Save as copy makes another and the
 * editor carries on with it; a reload keeps which chart it is; a chart saved elsewhere since is asked about first.
 */

const message = (page: Page) => page.getByTestId("account-save-message");

async function savedCharts(page: Page): Promise<{ id: string; name: string; version: number }[]> {
  return (await (await page.request.get("/api/charts")).json()).charts;
}

/** Which saved chart the autosave says the open one is. */
function storedLinkId(page: Page): Promise<string | null> {
  return page.evaluate(
    ({ name, version, store, key }) =>
      new Promise<string | null>((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const read = request.result.transaction(store).objectStore(store).get(key);
          read.onsuccess = () => {
            request.result.close();
            resolve(read.result?.savedChart?.id ?? null);
          };
          read.onerror = () => reject(read.error);
        };
      }),
    { name: PROJECT_DB_NAME, version: PROJECT_DB_VERSION, store: PROJECT_OBJECT_STORE, key: CURRENT_PROJECT_KEY }
  );
}

async function rename(page: Page, name: string) {
  await page.getByRole("tab", { name: "Chart" }).click();
  const input = page.getByLabel("Pattern name");
  await input.fill(name);
  await input.blur();
  await expect(page.getByTestId("chart-name")).toHaveText(name);
}

async function saveToAccount(page: Page, item: "Save" | "Save as copy" = "Save") {
  await saveButton(page).click();
  await saveMenuItem(page, item).click();
}

test("signed out, the account group is greyed with a way to sign in, and the file is still there", async ({ page }) => {
  await openSmallChart(page);
  await saveButton(page).click();
  await expect(page.getByTestId("save-account-group")).toBeVisible();
  await expect(saveMenuItem(page, "Save")).toBeDisabled();
  await expect(saveMenuItem(page, "Save as copy")).toBeDisabled();
  await expect(page.getByTestId("save-sign-in-note").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  await expect(saveMenuItem(page, "Save to file")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Save" })).toHaveCount(0);
  await expect(saveButton(page)).toBeFocused();
});

test("Save keeps the chart's id: a rename and Save overwrite it, Save as copy makes another, and a reload keeps which one", async ({
  page,
}) => {
  await registerReader(page, uniqueEmail("menu-saver"));
  await openSmallChart(page);

  // Not saved yet: no copy to make.
  await saveButton(page).click();
  await expect(saveMenuItem(page, "Save as copy")).toBeDisabled();
  await saveMenuItem(page, "Save").click();
  await expect(message(page)).toHaveText("Saved to your account.");
  let charts = await savedCharts(page);
  expect(charts).toHaveLength(1);
  const first = charts[0];
  expect(first).toMatchObject({ name: "sample", version: 1 });

  // Renamed and saved: the same chart, not a new one.
  await rename(page, "Rose garden");
  await saveToAccount(page);
  await expect(message(page)).toHaveText("Saved to your account.");
  charts = await savedCharts(page);
  expect(charts).toHaveLength(1);
  expect(charts[0]).toMatchObject({ id: first.id, name: "Rose garden", version: 2 });

  // The menu says when; a reload keeps which chart this is.
  await saveButton(page).click();
  await expect(page.getByTestId("saved-to-account")).toContainText("Saved");
  await page.keyboard.press("Escape");
  await expect.poll(() => storedLinkId(page), { timeout: 10_000 }).toBe(first.id);
  await page.reload();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await saveToAccount(page);
  await expect(message(page)).toHaveText("Saved to your account.");
  expect(await savedCharts(page)).toEqual([expect.objectContaining({ id: first.id, version: 3 })]);

  // A copy: a second chart, and Save goes on to the copy.
  await saveToAccount(page, "Save as copy");
  await expect(message(page)).toContainText("you are now editing the copy");
  charts = await savedCharts(page);
  expect(charts).toHaveLength(2);
  const copy = charts.find((chart) => chart.id !== first.id)!;
  expect(copy).toMatchObject({ name: "Rose garden", version: 1 });
  await saveToAccount(page);
  await expect(message(page)).toHaveText("Saved to your account.");
  charts = await savedCharts(page);
  expect(charts.find((chart) => chart.id === copy.id)).toMatchObject({ version: 2 });
  expect(charts.find((chart) => chart.id === first.id)).toMatchObject({ version: 3 });
});

test("a chart saved elsewhere since is asked about first: cancel keeps it, a copy keeps both, replace overwrites", async ({ page }) => {
  await registerReader(page, uniqueEmail("conflict"));
  await openSmallChart(page);
  await saveToAccount(page);
  await expect(message(page)).toHaveText("Saved to your account.");
  const [chart] = await savedCharts(page);
  const origin = new URL(page.url()).origin;
  const elsewhere = async (version: number) => {
    const body = await (await page.request.get(`/api/charts/${chart.id}`)).text();
    const saved = await page.request.put(`/api/charts/${chart.id}`, {
      data: body,
      headers: { origin, "content-type": "application/json", "x-chart-version": String(version) },
    });
    expect(saved.status()).toBe(200);
  };

  // Saved from somewhere else: version 2 there, this browser saw 1.
  await elsewhere(1);
  await saveToAccount(page);
  const dialog = page.getByTestId("save-conflict");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save as a copy" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await savedCharts(page)).toEqual([expect.objectContaining({ id: chart.id, version: 2 })]);

  // Replace: overwritten, at the version it is at now.
  await saveToAccount(page);
  await dialog.getByRole("button", { name: "Replace it" }).click();
  await expect(message(page)).toHaveText("Saved to your account.");
  expect(await savedCharts(page)).toEqual([expect.objectContaining({ id: chart.id, version: 3 })]);

  // Again elsewhere, and this time a copy: both kept.
  await elsewhere(3);
  await saveToAccount(page);
  await dialog.getByRole("button", { name: "Save as a copy" }).click();
  await expect(message(page)).toContainText("you are now editing the copy");
  const charts = await savedCharts(page);
  expect(charts).toHaveLength(2);
  expect(charts.find((c) => c.id === chart.id)).toMatchObject({ version: 4 });
});

test("saving to an account switched off for someone: the group is greyed with the note, the file still works", async ({ page }) => {
  const email = uniqueEmail("no-account-save");
  await registerReader(page, email);
  await setUserFeatures(email, { "charts.account": "locked" });
  try {
    await openSmallChart(page);
    await saveButton(page).click();
    await expect(page.getByTestId("save-account-group").locator('[data-feature-locked="charts.account"]')).toBeVisible();
    await expect(saveMenuItem(page, "Save")).toBeDisabled();
    await expect(page.getByTestId("save-sign-in-note")).toHaveCount(0);
    await expect(saveMenuItem(page, "Save to file")).toBeEnabled();
  } finally {
    await clearPersonFeatures(email);
  }
});
