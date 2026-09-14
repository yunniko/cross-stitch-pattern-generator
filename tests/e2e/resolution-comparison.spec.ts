import { expect, test } from "@playwright/test";
import path from "node:path";

// 160 × 100 px. At Small (50 stitches) the grid is 50 × 31: 2 px per stitch shrinks it to 100 × 62, while 8 px per
// stitch would need 400 × 248, so that cap can't apply.
const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

test("the photo resolution comparison appears only with ?compare-resolution, and each result keeps its own details (G-035 M3)", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expect(page.getByText("Photo resolution (comparison)")).toHaveCount(0);

  await page.goto("/?compare-resolution");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await page.getByRole("radio", { name: /Small/ }).check();
  await expect(page.getByText("Photo resolution (comparison)")).toBeVisible();

  const details = page.getByTestId("generation-details");
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await expect(details).toContainText("full decoded photo, 160×100");

  await page.getByRole("button", { name: "2 px/stitch" }).click();
  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect(details).toContainText("Read 100×62 (2 px per stitch)");

  await page.getByRole("button", { name: "8 px/stitch" }).click();
  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect(details).toContainText("Asked for 8 px per stitch");

  const undo = page.getByRole("button", { name: /^Undo/ });
  await undo.click();
  await expect(details).toContainText("Read 100×62 (2 px per stitch)");
  await undo.click();
  await expect(details).toContainText("full decoded photo, 160×100");
});
