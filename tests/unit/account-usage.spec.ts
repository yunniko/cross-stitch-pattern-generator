import { describe, expect, it } from "vitest";
import { barShares, dailyUsage, exportKindLabel, exportsByKind, NOT_RECORDED } from "@/lib/account/usage";
import { FREE_PLAN, planName } from "@/lib/account/plan";

const NOW = new Date("2026-10-07T15:00:00Z");
const at = (iso: string) => new Date(iso);

describe("dailyUsage (G-107 M2)", () => {
  it("has 30 UTC days, today last, with zeros for quiet days", () => {
    const days = dailyUsage([], NOW);
    expect(days).toHaveLength(30);
    expect(days[29].day.toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(days[0].day.toISOString()).toBe("2026-09-08T00:00:00.000Z");
    expect(days.every((d) => d.generations === 0 && d.exports === 0)).toBe(true);
  });

  it("puts each event on its UTC day and leaves out what is older", () => {
    const days = dailyUsage(
      [
        { kind: "GENERATE", createdAt: at("2026-10-07T00:00:00Z") },
        { kind: "GENERATE", createdAt: at("2026-10-07T23:59:59Z") },
        { kind: "EXPORT", createdAt: at("2026-10-06T23:59:59Z") },
        { kind: "EXPORT", createdAt: at("2026-09-08T00:00:00Z") },
        { kind: "EXPORT", createdAt: at("2026-09-07T23:59:59Z") },
      ],
      NOW
    );
    expect(days[29]).toMatchObject({ generations: 2, exports: 0 });
    expect(days[28]).toMatchObject({ generations: 0, exports: 1 });
    expect(days[0]).toMatchObject({ generations: 0, exports: 1 });
    expect(days.reduce((n, d) => n + d.generations + d.exports, 0)).toBe(4);
  });
});

describe("barShares", () => {
  it("measures each day against the busiest day's total", () => {
    const shares = barShares([
      { day: NOW, generations: 3, exports: 1 },
      { day: NOW, generations: 1, exports: 1 },
    ]);
    expect(shares).toEqual([
      { generations: 75, exports: 25 },
      { generations: 25, exports: 25 },
    ]);
  });

  it("is all zero when nothing was asked for", () => {
    expect(barShares(dailyUsage([], NOW)).every((s) => s.generations === 0 && s.exports === 0)).toBe(true);
  });
});

describe("exports by kind", () => {
  it("names a kind as the Export workspace does, colour and black-and-white as one", () => {
    expect(exportKindLabel("a4-color")).toBe("A4 pages (ZIP)");
    expect(exportKindLabel("a4-bw")).toBe("A4 pages (ZIP)");
    expect(exportKindLabel("pdf-bw")).toBe("PDF for Pattern Keeper");
    expect(exportKindLabel("png-realistic")).toBe("Realistic preview PNG");
    expect(exportKindLabel("all")).toBe("Export all (ZIP)");
    expect(exportKindLabel(null)).toBe(NOT_RECORDED);
  });

  it("merges by name, orders by all-time count, and puts the unrecorded last", () => {
    const rows = exportsByKind(
      [
        { exportKind: "a4-color", count: 2 },
        { exportKind: "a4-bw", count: 1 },
      ],
      [
        { exportKind: "a4-color", count: 4 },
        { exportKind: "a4-bw", count: 1 },
        { exportKind: "oxs", count: 7 },
        { exportKind: null, count: 50 },
      ]
    );
    expect(rows).toEqual([
      { label: "OXS chart for other programs (.oxs)", recent: 0, allTime: 7 },
      { label: "A4 pages (ZIP)", recent: 3, allTime: 5 },
      { label: NOT_RECORDED, recent: 0, allTime: 50 },
    ]);
  });
});

describe("planName", () => {
  it("is the tier's while the entitlement rule gives it, Free otherwise", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    const periodEnd = new Date("2026-11-08T12:00:00Z");
    const on = (status: string) => ({ status, currentPeriodEnd: periodEnd, firstFailedAt: null, tier: { name: "Stitcher" } });
    expect(planName(null, now)).toBe(FREE_PLAN);
    expect(planName(on("active"), now)).toBe("Stitcher");
    expect(planName(on("trialing"), now)).toBe("Stitcher");
    expect(planName(on("canceled"), now)).toBe(FREE_PLAN);
    expect(planName(on("incomplete"), now)).toBe(FREE_PLAN);
    expect(planName(on("active"), new Date("2026-12-01T00:00:00Z")), "past the period's end").toBe(FREE_PLAN);
  });
});
