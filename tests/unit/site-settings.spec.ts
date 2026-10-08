import { describe, expect, it } from "vitest";
import { parseSiteSetting, policyOf, resolveSiteSettings, SITE_SETTINGS } from "../../lib/settings/site-settings";

describe("site settings (G-126 M1, D374)", () => {
  it("takes each setting's default when nothing is stored", () => {
    expect(resolveSiteSettings([])).toEqual({ "billing.graceDays": 14 });
  });

  it("takes a stored value in range", () => {
    expect(resolveSiteSettings([{ key: "billing.graceDays", value: 0 }])["billing.graceDays"]).toBe(0);
    expect(resolveSiteSettings([{ key: "billing.graceDays", value: 60 }])["billing.graceDays"]).toBe(60);
  });

  it("gives way to the default for a row out of range, not whole, or of no setting", () => {
    for (const value of [-1, 61, 2.5, Number.NaN])
      expect(resolveSiteSettings([{ key: "billing.graceDays", value }])["billing.graceDays"]).toBe(14);
    expect(resolveSiteSettings([{ key: "billing.nothing", value: 3 }])).toEqual({ "billing.graceDays": 14 });
  });

  it("checks an admin's entry and says what is wrong in words", () => {
    expect(parseSiteSetting("billing.graceDays", " 21 ")).toEqual({ value: 21 });
    expect(parseSiteSetting("billing.graceDays", "0")).toEqual({ value: 0 });
    expect(parseSiteSetting("billing.graceDays", "61")).toEqual({ error: "Enter between 0 and 60 days." });
    for (const input of ["", "  ", "-1", "2.5", "1e1", "two", "14 days"])
      expect(parseSiteSetting("billing.graceDays", input)).toEqual({ error: "Enter a whole number of days." });
    expect(parseSiteSetting("billing.nothing", "3")).toEqual({ error: "There is no such setting." });
  });

  it("gives every setting a default inside its own range", () => {
    for (const setting of SITE_SETTINGS) {
      expect(setting.default).toBeGreaterThanOrEqual(setting.min);
      expect(setting.default).toBeLessThanOrEqual(setting.max);
    }
  });

  it("hands the entitlement rule its policy", () => {
    expect(policyOf({ "billing.graceDays": 7 })).toEqual({ graceDays: 7 });
  });
});
