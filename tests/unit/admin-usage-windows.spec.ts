import { describe, expect, it } from "vitest";
import { usageWindowStarts } from "@/lib/admin/usage-windows";

/** The admin stats page's window boundaries (G-075 M4): UTC throughout, "today" clamped to midnight, 7/30
 *  days counting today as one of the days rather than adding a full extra day on top of it. */

describe("usageWindowStarts", () => {
  it("clamps today to UTC midnight", () => {
    const now = new Date("2026-09-27T14:32:11.500Z");
    expect(usageWindowStarts(now).today.toISOString()).toBe("2026-09-27T00:00:00.000Z");
  });

  it("counts today as one of the 7 days, not an 8th", () => {
    const now = new Date("2026-09-27T14:32:11.500Z");
    expect(usageWindowStarts(now).sevenDays.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("counts today as one of the 30 days, not a 31st", () => {
    const now = new Date("2026-09-27T14:32:11.500Z");
    expect(usageWindowStarts(now).thirtyDays.toISOString()).toBe("2026-08-29T00:00:00.000Z");
  });

  it("crosses a month boundary correctly", () => {
    const now = new Date("2026-01-03T00:00:00.000Z");
    const windows = usageWindowStarts(now);
    expect(windows.sevenDays.toISOString()).toBe("2025-12-28T00:00:00.000Z");
    expect(windows.thirtyDays.toISOString()).toBe("2025-12-05T00:00:00.000Z");
  });

  it("is stable exactly at UTC midnight, not off by one", () => {
    const now = new Date("2026-09-27T00:00:00.000Z");
    expect(usageWindowStarts(now).today.toISOString()).toBe("2026-09-27T00:00:00.000Z");
  });
});
