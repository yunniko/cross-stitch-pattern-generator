import { describe, expect, it } from "vitest";
import {
  ACCOUNT_LIMITS,
  BYTES_PER_MB,
  formatLimit,
  fromColumn,
  layerOver,
  limitBytes,
  limitById,
  limitDefaults,
  limitValue,
  limitValuesOf,
  parseLimitInput,
  resolveLimits,
  toColumn,
} from "../../lib/limits/limits";
import { isFeatureIdShape } from "../../lib/features/features";

/** G-108 M1 (D353): limits set by the admin per layer, resolved person > tier > guests or accounts > site > default. */

const CHARTS = "storage.charts";
const charts = limitById(CHARTS)!;

describe("the list of limits", () => {
  it("has unique ids shaped as feature ids, and defaults within each limit's range", () => {
    const ids = ACCOUNT_LIMITS.map((limit) => limit.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const limit of ACCOUNT_LIMITS) {
      expect(isFeatureIdShape(limit.id)).toBe(true);
      if (limit.siteDefault !== "unlimited") expect(limit.siteDefault).toBeLessThanOrEqual(limit.max);
      // The column is a 32-bit integer.
      expect(limit.max).toBeLessThan(2 ** 31);
    }
  });

  it("holds the space for saved charts", () => {
    expect(charts.unit).toBe("MB");
    expect(charts.siteDefault).toBe(50);
  });
});

describe("resolving a person's limits", () => {
  it("gives every limit its default when no layer sets anything", () => {
    expect(resolveLimits({})).toEqual(limitDefaults());
    expect(limitValue(resolveLimits({}), CHARTS)).toBe(50);
  });

  it("lets the person win over the tier, the tier over accounts, accounts over the site", () => {
    expect(limitValue(resolveLimits({ site: { [CHARTS]: 10 } }), CHARTS)).toBe(10);
    expect(limitValue(resolveLimits({ site: { [CHARTS]: 10 }, audience: { [CHARTS]: 20 } }), CHARTS)).toBe(20);
    expect(limitValue(resolveLimits({ site: { [CHARTS]: 10 }, audience: { [CHARTS]: 20 }, tier: { [CHARTS]: 500 } }), CHARTS)).toBe(500);
    expect(
      limitValue(
        resolveLimits({ site: { [CHARTS]: 10 }, audience: { [CHARTS]: 20 }, tier: { [CHARTS]: 500 }, person: { [CHARTS]: 5 } }),
        CHARTS
      )
    ).toBe(5);
  });

  it("treats unlimited as a value: it wins from its layer, and a higher layer can set a number over it", () => {
    expect(limitValue(resolveLimits({ audience: { [CHARTS]: "unlimited" } }), CHARTS)).toBe("unlimited");
    expect(limitValue(resolveLimits({ tier: { [CHARTS]: "unlimited" }, person: { [CHARTS]: 1 } }), CHARTS)).toBe(1);
  });

  it("drops a stored row for a limit no longer in the list", () => {
    const values = limitValuesOf([
      { limitId: CHARTS, value: 7 },
      { limitId: "storage.gone", value: 3 },
    ]);
    expect(values).toEqual({ [CHARTS]: 7 });
    expect(Object.keys(resolveLimits({ person: { "storage.gone": 3 } }))).toEqual(ACCOUNT_LIMITS.map((limit) => limit.id));
  });

  it("shows the admin what a layer ends up with: its own over the layer below", () => {
    const site = layerOver(limitDefaults(), { [CHARTS]: 30 });
    expect(layerOver(site, {})[CHARTS]).toBe(30);
    expect(layerOver(site, { [CHARTS]: "unlimited" })[CHARTS]).toBe("unlimited");
  });
});

describe("stored and typed values", () => {
  it("stores unlimited as null and a number as itself", () => {
    expect(toColumn("unlimited")).toBeNull();
    expect(toColumn(12)).toBe(12);
    expect(fromColumn(null)).toBe("unlimited");
    expect(fromColumn(0)).toBe(0);
  });

  it("takes a whole number up to the limit's largest, or unlimited in any case", () => {
    expect(parseLimitInput(charts, "50")).toEqual({ value: 50 });
    expect(parseLimitInput(charts, " 0 ")).toEqual({ value: 0 });
    expect(parseLimitInput(charts, "Unlimited")).toEqual({ value: "unlimited" });
    expect(parseLimitInput(charts, String(charts.max))).toEqual({ value: charts.max });
  });

  it("refuses anything else with a sentence naming the limit", () => {
    for (const input of ["", "-1", "1.5", "50 MB", "1e3", "abc", String(charts.max + 1), "9999999999", null, undefined, {}]) {
      const result = parseLimitInput(charts, input);
      expect(result, String(input)).toHaveProperty("error");
      expect((result as { error: string }).error).toContain(charts.label);
    }
  });

  it("formats and converts to bytes", () => {
    expect(formatLimit(charts, 1500)).toBe("1,500 MB");
    expect(formatLimit(charts, "unlimited")).toBe("Unlimited");
    expect(limitBytes(2)).toBe(2 * BYTES_PER_MB);
    expect(limitBytes("unlimited")).toBe(Infinity);
  });
});
