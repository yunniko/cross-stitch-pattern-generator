import { describe, expect, it } from "vitest";
import { chartCount, chartFacts, chartsShown, savedWhen, type SavedChartCard } from "../../lib/charts/chart-cards";

/** G-108 part 1 M8 (D358): the account's Charts as the design draws them. */

function card(id: string, over: Partial<SavedChartCard> = {}): SavedChartCard {
  return {
    id,
    name: id,
    bytes: 1000,
    width: 50,
    height: 31,
    colors: 12,
    palette: "DMC",
    pinned: false,
    version: 1,
    savedAt: "2026-10-08T10:00:00.000Z",
    ...over,
  };
}

const charts = [
  card("a", { name: "Rose garden", bytes: 3000, savedAt: "2026-10-01T10:00:00.000Z" }),
  card("b", { name: "rose 10", bytes: 5000, savedAt: "2026-10-07T10:00:00.000Z" }),
  card("c", { name: "Rose 9", bytes: 1000, savedAt: "2026-10-08T09:00:00.000Z" }),
  card("d", { name: "Owl", bytes: 2000, savedAt: "2026-09-01T10:00:00.000Z", pinned: true }),
];
const ids = (shown: SavedChartCard[]) => shown.map((c) => c.id);

describe("the charts shown", () => {
  it("puts pinned charts first in every order, then newest, A to Z, or largest", () => {
    expect(ids(chartsShown(charts, "", "recent"))).toEqual(["d", "c", "b", "a"]);
    expect(ids(chartsShown(charts, "", "name"))).toEqual(["d", "c", "b", "a"]);
    expect(ids(chartsShown(charts, "", "size"))).toEqual(["d", "b", "a", "c"]);
  });

  it("orders names as people read them: case aside, 9 before 10", () => {
    const unpinned = charts.map((c) => ({ ...c, pinned: false }));
    expect(chartsShown(unpinned, "", "name").map((c) => c.name)).toEqual(["Owl", "Rose 9", "rose 10", "Rose garden"]);
  });

  it("keeps the charts whose name holds every word searched for, in any case", () => {
    expect(ids(chartsShown(charts, "ROSE", "recent"))).toEqual(["c", "b", "a"]);
    expect(ids(chartsShown(charts, "  garden   rose ", "recent"))).toEqual(["a"]);
    expect(chartsShown(charts, "tulip", "recent")).toEqual([]);
  });

  it("does not reorder the list it is given", () => {
    const before = ids(charts);
    chartsShown(charts, "", "size");
    expect(ids(charts)).toEqual(before);
  });
});

describe("the words on a card", () => {
  it("names the size, the colours and the palette", () => {
    expect(chartFacts({ width: 180, height: 135, colors: 32, palette: "DMC" })).toBe("180 × 135 · 32 colours · DMC");
    expect(chartFacts({ width: 2, height: 2, colors: 1, palette: "Full range" })).toBe("2 × 2 · 1 colour · Full range");
  });

  it("counts charts", () => {
    expect(chartCount(0)).toBe("0 charts");
    expect(chartCount(1)).toBe("1 chart");
    expect(chartCount(12)).toBe("12 charts");
  });
});

describe("when a chart was saved", () => {
  const now = new Date(2026, 9, 8, 15, 30).getTime();
  const at = (...parts: [number, number, number, number, number]) => new Date(...parts).toISOString();

  it("says how long ago today, in minutes then hours", () => {
    expect(savedWhen(new Date(now - 30_000).toISOString(), now)).toBe("Just now");
    expect(savedWhen(at(2026, 9, 8, 15, 29), now)).toBe("1 min ago");
    expect(savedWhen(at(2026, 9, 8, 15, 25), now)).toBe("5 min ago");
    expect(savedWhen(at(2026, 9, 8, 13, 0), now)).toBe("2 h ago");
    expect(savedWhen(at(2026, 9, 8, 0, 5), now)).toBe("15 h ago");
  });

  it("says Yesterday, then the date, with the year once it is another year", () => {
    expect(savedWhen(at(2026, 9, 7, 23, 50), now)).toBe("Yesterday");
    expect(savedWhen(at(2026, 9, 3, 12, 0), now, "en-GB")).toBe("3 Oct");
    expect(savedWhen(at(2025, 9, 3, 12, 0), now, "en-GB")).toBe("3 Oct 2025");
  });

  it("treats a save stamped a moment ahead of the clock as just now", () => {
    expect(savedWhen(at(2026, 9, 8, 15, 31), now)).toBe("Just now");
  });
});
