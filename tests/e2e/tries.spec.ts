import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { FIXTURE, expectPhotoLoaded, generateAndWait, pickTool, showWorkspace } from "./helpers/app";

/**
 * G-095 M4, D298: tries. Every chart a Generate makes is kept, so an earlier one is a press away and not another
 * generation: the five most recent, and up to five pinned beside them, across a reload, for the photo in hand.
 */

const OTHER_PHOTO = path.join(__dirname, "fixtures", "texture-fur.png");

const tries = (page: Page) => page.getByTestId("try");
const tryButton = (page: Page, number: number) => page.getByRole("button", { name: new RegExp(`^Try ${number}:`) });
const numbers = (page: Page) =>
  tries(page).evaluateAll((els) =>
    els.map((el) =>
      Number(
        el
          .querySelector("button")!
          .getAttribute("aria-label")!
          .match(/^Try (\d+)/)![1]
      )
    )
  );
const summary = (page: Page) => page.getByText(/^\d+ × \d+, [\d,]+ stitch(es)?, \d+ colors?$/);
const colours = (page: Page) => page.getByLabel("Number of colors");

async function photoLoaded(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);
  // A new photo takes the colour count from the recommendation when that arrives, which can be after a count typed here
  // (an old defect, in the triage list). So the recommendation for the size used is waited for before any count is set.
  const recommended = page.waitForResponse((response) => response.url().includes("/api/predictions"), { timeout: 15_000 });
  await page.getByRole("radio", { name: /Small/ }).check();
  await recommended;
  await expect(page.getByTestId("color-count-hint")).toBeVisible();
}

/** Generates with this many colours asked for; each is a chart of its own, since the count differs. */
async function generateWith(page: Page, count: number) {
  await colours(page).fill(String(count));
  await generateAndWait(page);
}

test("each Generate is kept as a try; going back to one generates nothing and puts its settings back", async ({ page }) => {
  await photoLoaded(page);
  await generateWith(page, 6);
  await expect(tries(page)).toHaveCount(1);
  await expect(tryButton(page, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(summary(page)).toContainText("6 colors");

  await generateWith(page, 3);
  await expect(tries(page)).toHaveCount(2);
  await expect(tryButton(page, 2)).toHaveAttribute("aria-pressed", "true");
  await expect(tryButton(page, 1)).toHaveAttribute("aria-pressed", "false");
  await expect(summary(page)).toContainText("3 colors");
  await expect(tryButton(page, 2)).toContainText("3 colours");

  // Back to the first: the chart is the six-colour one again, the count asked for is 6 again, and no job was sent.
  const jobs: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/jobs")) jobs.push(`${request.method()} ${request.url()}`);
  });
  await tryButton(page, 1).click();
  await expect(tryButton(page, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(summary(page)).toContainText("6 colors");
  await expect(colours(page)).toHaveValue("6");
  expect(jobs, "choosing a try generated something").toEqual([]);

  // It is one undoable step, like a Regenerate: Undo brings the three-colour chart back, and it is Try 2 again.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(summary(page)).toContainText("3 colors");
  await expect(tryButton(page, 2)).toHaveAttribute("aria-pressed", "true");
});

test("the five most recent are kept, pinned ones beside them, and a sixth pin is refused", async ({ page }) => {
  test.setTimeout(180_000);
  await photoLoaded(page);
  for (const count of [3, 4, 5, 6, 7]) await generateWith(page, count);
  expect(await numbers(page)).toEqual([1, 2, 3, 4, 5]);

  // Pinned, the first is no longer one of the five: the next two made push out the second and the third.
  await page.getByRole("button", { name: "Pin Try 1" }).click();
  await expect(page.getByRole("button", { name: "Unpin Try 1" })).toHaveAttribute("aria-pressed", "true");
  await generateWith(page, 8);
  expect(await numbers(page)).toEqual([1, 2, 3, 4, 5, 6]);
  await generateWith(page, 9);
  expect(await numbers(page)).toEqual([1, 3, 4, 5, 6, 7]);
  await generateWith(page, 10);
  expect(await numbers(page)).toEqual([1, 4, 5, 6, 7, 8]);

  // Five pinned is the most: the sixth pin is refused, with the reason, and nothing changes.
  for (const number of [4, 5, 6, 7]) await page.getByRole("button", { name: `Pin Try ${number}` }).click();
  await expect(page.locator('[data-testid="try"][data-pinned="true"]')).toHaveCount(5);
  await page.getByRole("button", { name: "Pin Try 8" }).click();
  await expect(page.getByTestId("tries-refusal")).toContainText("5 tries are pinned already");
  await expect(page.locator('[data-testid="try"][data-pinned="true"]')).toHaveCount(5);

  // Deleting one removes it and leaves the chart shown as it is; the pin is then allowed.
  await page.getByRole("button", { name: "Delete Try 4" }).click();
  expect(await numbers(page)).toEqual([1, 5, 6, 7, 8]);
  await expect(summary(page)).toContainText("10 colors");
  await page.getByRole("button", { name: "Pin Try 8" }).click();
  await expect(page.getByTestId("tries-refusal")).toHaveCount(0);
  await expect(page.locator('[data-testid="try"][data-pinned="true"]')).toHaveCount(5);
});

test("the tries survive a reload, with the one the chart is still marked, and can be gone back to", async ({ page }) => {
  await photoLoaded(page);
  await generateWith(page, 6);
  await generateWith(page, 3);
  await page.getByRole("button", { name: "Pin Try 1" }).click();
  await expect(page.getByTestId("autosave-status")).toHaveAttribute("data-status", "saved", { timeout: 10_000 });

  await page.reload();
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 15_000 });
  // A restored chart arrives in Edit; its tries are in Photo.
  await showWorkspace(page, "Photo");
  expect(await numbers(page)).toEqual([1, 2]);
  await expect(page.getByRole("button", { name: "Unpin Try 1" })).toHaveAttribute("aria-pressed", "true");
  await expect(tryButton(page, 2)).toHaveAttribute("aria-pressed", "true");

  await tryButton(page, 1).click();
  await expect(summary(page)).toContainText("6 colors");
  await expect(colours(page)).toHaveValue("6");
});

test("a chart that has been edited is none of the tries, and they are all still there", async ({ page }) => {
  await photoLoaded(page);
  await generateWith(page, 5);
  await showWorkspace(page, "Edit");
  await expect(page.getByRole("tab", { name: "Edit", exact: true })).toHaveAttribute("aria-selected", "true");

  // The same stitch painted in one thread and then another: whatever it was, it is not that now.
  await pickTool(page, "Brush");
  const box = (await page.getByTestId("chart-frame").boundingBox())!;
  for (const row of [0, 1]) {
    await page.getByTestId("legend-color-row").nth(row).click();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await showWorkspace(page, "Photo");
  await expect(tries(page)).toHaveCount(1);
  await expect(tryButton(page, 1)).toHaveAttribute("aria-pressed", "false");

  // Going back to the try puts the generated chart back, and the edited one is one Undo away.
  await tryButton(page, 1).click();
  await expect(tryButton(page, 1)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(tryButton(page, 1)).toHaveAttribute("aria-pressed", "false");
});

test("the same chart made again with the same settings is the try already kept, not a second one", async ({ page }) => {
  await photoLoaded(page);
  await generateWith(page, 6);
  await generateWith(page, 3);
  await expect(tryButton(page, 2)).toHaveAttribute("aria-pressed", "true");

  // Back to six colours and Generate again: the same chart from the same settings is Try 1 again.
  await generateWith(page, 6);
  expect(await numbers(page)).toEqual([1, 2]);
  await expect(tryButton(page, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(tryButton(page, 2)).toHaveAttribute("aria-pressed", "false");
  // And every try can still be chosen.
  await tryButton(page, 2).click();
  await expect(tryButton(page, 2)).toHaveAttribute("aria-pressed", "true");
  await tryButton(page, 1).click();
  await expect(tryButton(page, 1)).toHaveAttribute("aria-pressed", "true");
});

test("many tries leave the last one in reach: the strip has nothing beside it to cover a try", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1100, height: 800 });
  await photoLoaded(page);
  for (const count of [3, 4, 5, 6, 7]) await generateWith(page, count);
  await page.getByRole("button", { name: "Pin Try 1" }).click();
  await page.getByRole("button", { name: "Pin Try 2" }).click();
  await generateWith(page, 8);
  await generateWith(page, 9);
  expect(await numbers(page)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  await expect(page.getByTestId("tries").getByRole("button", { name: /Continue in Edit/ })).toHaveCount(0);

  // The track scrolls, and the last try, scrolled to, is wholly inside the strip and takes a press.
  const strip = (await page.getByTestId("tries").boundingBox())!;
  const last = page.getByTestId("try").last();
  await last.scrollIntoViewIfNeeded();
  const box = (await last.boundingBox())!;
  expect(box.x + box.width, "the last try runs past the strip").toBeLessThanOrEqual(strip.x + strip.width);
  await tryButton(page, 3).click();
  await expect(tryButton(page, 3)).toHaveAttribute("aria-pressed", "true");
  await tryButton(page, 7).click();
  await expect(tryButton(page, 7)).toHaveAttribute("aria-pressed", "true");
});

test("tries belong to the photo: the question before another photo names the pinned ones, and the new photo starts at Try 1", async ({
  page,
}) => {
  await photoLoaded(page);
  await generateWith(page, 6);
  await generateWith(page, 4);
  await page.getByRole("button", { name: "Pin Try 2" }).click();

  await page.getByRole("button", { name: "New chart" }).click();
  await page.getByRole("button", { name: /^Choose a photo/ }).click();
  await expect(page.getByTestId("confirm-pinned-tries")).toContainText("1 pinned try is kept for this photo");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Start new chart" }).click();
  await (await chooser).setFiles(OTHER_PHOTO);
  await expectPhotoLoaded(page);

  await page.getByLabel("Custom size in stitches").fill("40");
  await generateAndWait(page);
  expect(await numbers(page)).toEqual([1]);
  await expect(tryButton(page, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-testid="try"][data-pinned="true"]')).toHaveCount(0);
});

test("a chart opened from a file has no tries until a Generate makes one, and the strip says what it is for", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Open pattern file").setInputFiles(path.join(__dirname, "fixtures", "sample_editable.json"));
  await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
  await showWorkspace(page, "Photo");
  await expect(tries(page)).toHaveCount(0);
  await expect(page.getByTestId("tries")).toContainText("Each Generate is kept here as a try");
  await generateAndWait(page);
  await expect(tries(page)).toHaveCount(1);
});
