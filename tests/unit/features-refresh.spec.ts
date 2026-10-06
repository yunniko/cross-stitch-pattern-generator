import { describe, expect, it } from "vitest";
import { featuresExpired, featuresRefreshSeconds } from "../../lib/features/refresh";

describe("how long the browser keeps its feature states", () => {
  it("is 300 seconds unless set, and held between 5 seconds and a day", () => {
    expect(featuresRefreshSeconds(undefined)).toBe(300);
    expect(featuresRefreshSeconds("")).toBe(300);
    expect(featuresRefreshSeconds("soon")).toBe(300);
    expect(featuresRefreshSeconds("60")).toBe(60);
    expect(featuresRefreshSeconds("1")).toBe(5);
    expect(featuresRefreshSeconds("-10")).toBe(5);
    expect(featuresRefreshSeconds("999999")).toBe(86_400);
    expect(featuresRefreshSeconds("12.6")).toBe(13);
  });

  it("expires once that long has passed", () => {
    expect(featuresExpired(1_000, 60_999, 60)).toBe(false);
    expect(featuresExpired(1_000, 61_000, 60)).toBe(true);
  });
});
