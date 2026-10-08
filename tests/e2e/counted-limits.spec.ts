import { test, expect, type Page } from "@playwright/test";
import { registerReader, uniqueEmail } from "./helpers/auth";
import { featuresDb } from "./helpers/features";
import { FIXTURE, chooseExport, showWorkspace } from "./helpers/app";

/**
 * G-109 M2: the counted limits on the server's work (D364, D365). A generation or a server export is checked and counted
 * before the processor is asked, given back when the processor does not take it, and refused by name once the limit is
 * reached; the browser shows the server's words. The rows are written straight into the database, as the admin's page
 * would write them, and removed afterwards: with no row every limit is unlimited and the rest of the suite is untouched.
 */

/** Posts JSON to a route from the page, as the interface would. */
async function post(page: Page, address: string, body: unknown) {
  return page.evaluate(
    async ({ address, body }) => {
      const response = await fetch(address, { method: "POST", headers: { "content-type": "application/json" }, body });
      const json = (await response.json().catch(() => ({}))) as { error?: string; limit?: string };
      return { status: response.status, retryAfter: response.headers.get("retry-after"), error: json.error, limit: json.limit };
    },
    { address, body: typeof body === "string" ? body : JSON.stringify(body) }
  );
}

async function userIdOf(email: string): Promise<string> {
  const { rows } = await featuresDb().query<{ id: string }>(`SELECT "id" FROM "User" WHERE "email" = $1`, [email]);
  return rows[0].id;
}

async function setUserLimit(userId: string, limitId: string, value: number): Promise<void> {
  await featuresDb().query(
    `INSERT INTO "UserLimit" ("userId", "limitId", "value", "updatedAt", "updatedBy") VALUES ($1, $2, $3, now(), 'e2e')
     ON CONFLICT ("userId", "limitId") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now()`,
    [userId, limitId, value]
  );
}

async function usesOf(userId: string, kind: "GENERATE" | "EXPORT"): Promise<number> {
  const { rows } = await featuresDb().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "UsageEvent" WHERE "userId" = $1 AND "kind" = $2::"UsageKind"`,
    [userId, kind]
  );
  return rows[0].n;
}

/** A photo that the processor has never seen: it refuses the job, so the use must be given back. */
const UNKNOWN_PHOTO = { photoHash: "0".repeat(64) };

test("generations are refused by name at the limit, given back when the processor refuses, and one of two at the last passes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("counted");
  await registerReader(page, email);
  const userId = await userIdOf(email);
  try {
    // A value of 0: never, so no time to come back.
    await setUserLimit(userId, "generations.24h", 0);
    expect(await post(page, "/api/jobs", UNKNOWN_PHOTO)).toEqual({
      status: 429,
      retryAfter: null,
      error: "Generating a chart is not available to your account.",
      limit: "generations.24h",
    });

    await setUserLimit(userId, "generations.24h", 2);
    const unknown = await post(page, "/api/jobs", UNKNOWN_PHOTO);
    expect(unknown.status).toBeGreaterThanOrEqual(400);
    expect(unknown.limit).toBeUndefined();
    expect(await usesOf(userId, "GENERATE"), "a job the processor refused is given back").toBe(0);

    // One real generation, through the interface; its request is kept to send again.
    await page.goto("/");
    await page.getByLabel("Image").setInputFiles(FIXTURE);
    await page.getByRole("radio", { name: /Small/ }).check();
    const [job] = await Promise.all([
      page.waitForRequest((request) => request.url().endsWith("/api/jobs") && request.method() === "POST"),
      page.getByRole("button", { name: "Generate pattern" }).click(),
    ]);
    await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });
    expect(await usesOf(userId, "GENERATE")).toBe(1);

    // Two at once for the last one: exactly one is taken.
    const body = job.postData()!;
    const answers = await Promise.all([post(page, "/api/jobs", body), post(page, "/api/jobs", body)]);
    const statuses = answers.map((answer) => answer.status).sort();
    expect(statuses).toEqual([202, 429]);
    const refused = answers.find((answer) => answer.status === 429)!;
    expect(refused.limit).toBe("generations.24h");
    expect(refused.error).toMatch(/^You have used all 2 generations allowed in 24 hours\. The next is available in 24 hours\.$/);
    expect(Number(refused.retryAfter)).toBeGreaterThan(23 * 3600);
    expect(await usesOf(userId, "GENERATE")).toBe(2);

    // The interface shows the server's words.
    await page.getByRole("button", { name: "Regenerate" }).click();
    await expect(page.getByText("You have used all 2 generations allowed in 24 hours.", { exact: false })).toBeVisible();
    expect(await usesOf(userId, "GENERATE")).toBe(2);

    // The account's Usage page shows the limit in force, and only that one (G-109 M3).
    await setUserLimit(userId, "exports.30d", 5);
    await page.goto("/account/usage");
    const limits = page.getByTestId("usage-limits");
    await expect(limits.locator("tbody tr")).toHaveCount(2);
    const day = limits.locator(`tr[data-limit="generations.24h"]`);
    await expect(day).toContainText("Generations in 24 hours");
    await expect(day).toContainText("2 of 2");
    await expect(day).toContainText("in 24 hours");
    await expect(limits.locator(`tr[data-limit="exports.30d"]`)).toContainText("0 of 5");
    await expect(limits.locator(`tr[data-limit="exports.30d"]`)).toContainText("now");
  } finally {
    await featuresDb().query(`DELETE FROM "UserLimit" WHERE "userId" = $1`, [userId]);
  }
});

test("a server export is counted and the next is refused in the export's own notice", async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("exports");
  await registerReader(page, email);
  const userId = await userIdOf(email);
  try {
    await setUserLimit(userId, "exports.24h", 1);
    await page.goto("/");
    await page.getByLabel("Image").setInputFiles(FIXTURE);
    await page.getByRole("radio", { name: /Small/ }).check();
    await page.getByRole("button", { name: "Generate pattern" }).click();
    await expect(page.getByTestId("chart-canvas")).toBeVisible({ timeout: 30_000 });

    await showWorkspace(page, "Export");
    await chooseExport(page, "png-color");
    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), exportButton.click()]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    expect(await usesOf(userId, "EXPORT")).toBe(1);

    await exportButton.click();
    await expect(page.getByText("You have used all 1 export allowed in 24 hours.", { exact: false })).toBeVisible();
    expect(await usesOf(userId, "EXPORT")).toBe(1);
    // Generating is a different action: its limits are unset, so it is not touched.
    expect(await usesOf(userId, "GENERATE")).toBe(1);
  } finally {
    await featuresDb().query(`DELETE FROM "UserLimit" WHERE "userId" = $1`, [userId]);
  }
});

// @alone: the guests' row applies to every guest, so no other spec may be generating or exporting as one meanwhile.
test("a guest is told to sign in where a limit is in force, and nothing is counted", { tag: "@alone" }, async ({ page }) => {
  await page.goto("/");
  const before = await featuresDb().query<{ n: number }>(`SELECT count(*)::int AS n FROM "UsageEvent" WHERE "userId" IS NULL`);
  try {
    await featuresDb().query(
      `INSERT INTO "AudienceLimit" ("audience", "limitId", "value", "updatedAt", "updatedBy") VALUES ('guests', 'exports.24h', 1, now(), 'e2e')
       ON CONFLICT ("audience", "limitId") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now()`
    );
    expect(await post(page, "/api/exports", { kind: "oxs" })).toEqual({
      status: 403,
      retryAfter: null,
      error: "Exporting from the server needs an account: sign in, or create one.",
      limit: "sign-in",
    });
    // Generating has no limit set, so a guest still reaches the processor.
    expect((await post(page, "/api/jobs", UNKNOWN_PHOTO)).limit).toBeUndefined();
    const after = await featuresDb().query<{ n: number }>(`SELECT count(*)::int AS n FROM "UsageEvent" WHERE "userId" IS NULL`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  } finally {
    await featuresDb().query(`DELETE FROM "AudienceLimit" WHERE "audience" = 'guests' AND "limitId" = 'exports.24h'`);
  }
});
