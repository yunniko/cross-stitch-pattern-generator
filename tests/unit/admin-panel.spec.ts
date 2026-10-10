import { describe, expect, it } from "vitest";
import { changeNote, parseRange, percentChange, rangeWindow } from "@/lib/admin/overview";
import { FEATURE_SCOPES, groupLabelOf, parseChangeGroup, scopesOf, changeTime } from "@/lib/admin/change-log";
import { ownStatesSummary, parseUserFilters, usersHref } from "@/lib/admin/users-filter";
import { dailyUsage, exportMix, NOT_RECORDED } from "@/lib/account/usage";
import { isoDay, lastSeen } from "@/lib/panel/format";

const NOW = new Date("2026-10-07T15:00:00Z");

describe("the Overview's range (G-107 M3)", () => {
  it("reads a known range and falls back to 30 days", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("all")).toBe("all");
    expect(parseRange("1y")).toBe("30d");
    expect(parseRange(undefined)).toBe("30d");
  });

  it("compares a range of UTC days with as many days just before it", () => {
    const week = rangeWindow("7d", NOW);
    expect(week.from?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(week.previous?.from.toISOString()).toBe("2026-09-24T00:00:00.000Z");
    expect(week.previous?.to.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    const today = rangeWindow("today", NOW);
    expect(today.from?.toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(today.previous?.from.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(rangeWindow("all", NOW)).toEqual({ from: null, previous: null });
  });

  it("says the change in whole percent, with its sign, and nothing for all time", () => {
    expect(percentChange(112, 100)).toBe(12);
    expect(percentChange(5, 0)).toBeNull();
    expect(changeNote("30d", 112, 100)).toEqual({ text: "+12% vs the 30 days before", trend: "up" });
    expect(changeNote("7d", 97, 100)).toEqual({ text: "−3% vs the 7 days before", trend: "down" });
    expect(changeNote("today", 4, 4)).toEqual({ text: "±0% vs yesterday", trend: "flat" });
    expect(changeNote("today", 4, 0).text).toBe("none yesterday");
    expect(changeNote("30d", 0, 0).text).toBe("none in the 30 days before either");
    expect(changeNote("all", 10, null)).toEqual({ text: "", trend: "flat" });
  });
});

describe("the Change log's groups (D348)", () => {
  it("groups the stored scopes the way an admin looks for them", () => {
    expect(scopesOf(parseChangeGroup("users"))).toEqual(["ACCOUNT", "USER"]);
    expect(scopesOf(parseChangeGroup("nonsense"))).toBeNull();
    expect(groupLabelOf("AUDIENCE")).toBe("Features");
    expect(groupLabelOf("TIER")).toBe("Tiers");
    expect(groupLabelOf("ACCOUNT")).toBe("Users");
    expect(groupLabelOf("SETTING")).toBe("Settings");
    expect(groupLabelOf("BILLING")).toBe("Billing");
    expect(groupLabelOf("THREADS")).toBe("Thread systems");
    expect(groupLabelOf("OTHER")).toBe("OTHER");
  });

  it("keeps roles and logins out of the Features page's own changes", () => {
    expect(FEATURE_SCOPES).not.toContain("ACCOUNT");
    expect([...FEATURE_SCOPES].sort()).toEqual(["AUDIENCE", "SET", "SITE", "TIER", "USER"]);
  });

  it("writes a change's time in UTC to the minute", () => {
    expect(changeTime(new Date("2026-10-07T16:58:41Z"))).toBe("2026-10-07 16:58");
  });
});

describe("the Users list's address", () => {
  it("reads only the filters it knows", () => {
    expect(parseUserFilters({ q: "  jana ", role: "ADMIN", status: "banned" })).toEqual({ query: "jana", role: "ADMIN", status: null });
  });

  it("keeps the filters, the page and the chosen person, and leaves out what is empty", () => {
    const filters = parseUserFilters({ q: "a b", status: "disabled" });
    expect(usersHref(filters, 2, "u1")).toBe("/admin/users?q=a+b&status=disabled&page=2&user=u1");
    expect(usersHref(parseUserFilters({}), 1)).toBe("/admin/users");
  });

  it("lists a person's own states in one line", () => {
    expect(ownStatesSummary([])).toBe("None");
    expect(
      ownStatesSummary([
        { featureId: "tool.text", state: "ON" },
        { featureId: "export.all", state: "LOCKED" },
      ])
    ).toBe("export.all: locked, tool.text: on");
  });
});

describe("last seen and days", () => {
  it("is as fine as the five minutes it is kept to", () => {
    const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
    expect(lastSeen(ago(3), NOW, "7 Oct 2026")).toBe("within 5 min");
    expect(lastSeen(ago(40), NOW, "7 Oct 2026")).toBe("40 min ago");
    expect(lastSeen(ago(185), NOW, "7 Oct 2026")).toBe("3 h ago");
    expect(lastSeen(ago(3 * 24 * 60), NOW, "7 Oct 2026")).toBe("4 Oct 2026");
    expect(lastSeen(null, NOW, "7 Oct 2026")).toBe("Not since 7 Oct 2026");
    expect(isoDay(NOW)).toBe("2026-10-07");
  });
});

describe("counts already summed per day", () => {
  it("add into the day as single events do", () => {
    const days = dailyUsage(
      [
        { kind: "GENERATE", createdAt: new Date("2026-10-07T00:00:00Z"), count: 5 },
        { kind: "EXPORT", createdAt: new Date("2026-10-07T00:00:00Z"), count: 2 },
        { kind: "EXPORT", createdAt: new Date("2026-10-07T09:00:00Z") },
      ],
      NOW
    );
    expect(days[29]).toMatchObject({ generations: 5, exports: 3 });
  });

  it("give each export kind its width against the largest", () => {
    expect(
      exportMix([
        { exportKind: "a4-color", count: 6 },
        { exportKind: "a4-bw", count: 2 },
        { exportKind: "oxs", count: 4 },
        { exportKind: null, count: 16 },
      ])
    ).toEqual([
      { label: "A4 pages (ZIP)", count: 8, share: 50 },
      { label: "OXS chart for other programs (.oxs)", count: 4, share: 25 },
      { label: NOT_RECORDED, count: 16, share: 100 },
    ]);
  });
});
