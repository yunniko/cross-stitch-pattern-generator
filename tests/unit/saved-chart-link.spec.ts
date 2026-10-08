import { describe, expect, it } from "vitest";
import { formatSavedAt, readSavedChartLink, saveOutcome, saveRequest } from "@/lib/charts/saved-chart-link";
import { CONFLICT_MESSAGE, SAVE_TO_ACCOUNT_FEATURE } from "@/lib/charts/saved-charts";
import { featureById } from "../../app/features/registry";

/** G-108 part 1 M3 (D355): which saved chart the open one is, and what the server's answer to a save means. */

const LINK = { id: "ckabc123", version: 2, savedAt: "2026-10-08T10:00:00.000Z" };

describe("readSavedChartLink", () => {
  it("keeps a well-formed link and drops anything else", () => {
    expect(readSavedChartLink(LINK)).toEqual(LINK);
    expect(readSavedChartLink({ ...LINK, extra: 1 })).toEqual(LINK);
    expect(readSavedChartLink(undefined)).toBeUndefined();
    expect(readSavedChartLink(null)).toBeUndefined();
    expect(readSavedChartLink("ckabc123")).toBeUndefined();
    expect(readSavedChartLink({ ...LINK, id: "../etc" })).toBeUndefined();
    expect(readSavedChartLink({ ...LINK, id: "" })).toBeUndefined();
    expect(readSavedChartLink({ ...LINK, version: 0 })).toBeUndefined();
    expect(readSavedChartLink({ ...LINK, version: 1.5 })).toBeUndefined();
    expect(readSavedChartLink({ ...LINK, savedAt: "yesterday" })).toBeUndefined();
  });
});

describe("saveRequest", () => {
  it("makes a new chart with no link, and overwrites the linked one at its version", () => {
    expect(saveRequest(null)).toEqual({ url: "/api/charts", method: "POST", headers: { "content-type": "application/json" } });
    expect(saveRequest(LINK)).toEqual({
      url: "/api/charts/ckabc123",
      method: "PUT",
      headers: { "content-type": "application/json", "x-chart-version": "2" },
    });
  });
});

describe("saveOutcome", () => {
  it("a saved chart becomes the link, with its name", () => {
    expect(saveOutcome(201, { ...LINK, name: "Roses" })).toEqual({ kind: "saved", link: LINK, name: "Roses" });
    expect(saveOutcome(200, { ...LINK, name: "Roses" })).toMatchObject({ kind: "saved" });
  });

  it("a success without a usable chart is not taken as saved", () => {
    expect(saveOutcome(201, { name: "Roses" })).toMatchObject({ kind: "refused" });
    expect(saveOutcome(201, null)).toMatchObject({ kind: "refused" });
  });

  it("a conflict carries the version and time it is at now", () => {
    expect(saveOutcome(409, { reason: "conflict", version: 5, savedAt: LINK.savedAt, error: "x" })).toEqual({
      kind: "conflict",
      message: CONFLICT_MESSAGE,
      version: 5,
      savedAt: LINK.savedAt,
    });
  });

  it("a chart that is gone is said so; nothing was overwritten", () => {
    const outcome = saveOutcome(404, { error: "Not found" });
    expect(outcome.kind).toBe("gone");
    expect(outcome.kind === "gone" && outcome.message).toContain("nothing was overwritten");
  });

  it("a refusal shows the server's sentence, or a fallback when it sent none", () => {
    const full = "This chart needs 2 MB, but 49 MB of your 50 MB for saved charts are in use.";
    expect(saveOutcome(403, { reason: "storage", error: full })).toEqual({ kind: "refused", message: full });
    expect(saveOutcome(500, null)).toMatchObject({ kind: "refused", message: expect.stringContaining("save to a file") });
    // A 409 that is not a version conflict is a refusal, not a prompt.
    expect(saveOutcome(409, { error: "Busy" })).toEqual({ kind: "refused", message: "Busy" });
  });
});

describe("formatSavedAt", () => {
  it("names the day and the time", () => {
    const text = formatSavedAt(LINK.savedAt, "en-GB");
    expect(text).toContain("2026");
    expect(text).toContain("Oct");
  });
});

describe("the feature", () => {
  it("saving to an account is a switch of its own", () => {
    expect(featureById(SAVE_TO_ACCOUNT_FEATURE)).toBeDefined();
  });
});
