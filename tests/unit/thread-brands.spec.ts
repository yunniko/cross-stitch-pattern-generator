import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findThread,
  formatThreadName,
  isLoadedSystem,
  loadedSystems,
  loadThreadSystems,
  storedSystem,
  systemLabel,
  threadSystem,
} from "@/lib/threads/thread-brands";
import { threadListRefusal } from "@/lib/thread-systems/thread-system";
import { requestSystems, SEEDED_SYSTEMS, seededColors } from "./helpers/thread-systems";

describe("the seeded thread systems (G-132, D400)", () => {
  it("are the three lists compiled in before, each a valid list", () => {
    expect(SEEDED_SYSTEMS.map((s) => [s.id, s.label, s.colors.length])).toEqual([
      ["dmc", "DMC", 454],
      ["cosmo", "Cosmo", 500],
      ["anchor", "Anchor", 355],
    ]);
    for (const { threads } of requestSystems()) expect(threadListRefusal(threads)).toBeNull();
  });

  it("are what the migration seeds, row for row", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../prisma/migrations/20261010100000_thread_systems/migration.sql"), "utf8");
    const seeded = [
      ...sql.matchAll(
        /VALUES \('site-(\w+)', '\w+', '[^']*', (?:NULL|'(?:[^']|'')*'), '(?:[^']|'')*', '(?:[^']|'')*', '((?:[^']|'')*)', (\d+), (\d+)/g
      ),
    ];
    expect(seeded.map((m) => m[1])).toEqual(["dmc", "cosmo", "anchor"]);
    for (const [, key, threads, count] of seeded) {
      const fixture = requestSystems([key])[0].threads;
      expect(JSON.parse(threads.replace(/''/g, "'"))).toEqual(fixture);
      expect(Number(count)).toBe(fixture.length);
    }
  });

  it("Cosmo and Anchor publish no names; DMC does", () => {
    expect(seededColors("cosmo").every((c) => c.name === "")).toBe(true);
    expect(seededColors("anchor").every((c) => c.name === "")).toBe(true);
    expect(findThread("dmc", "310")?.name).toBe("Black");
  });

  it("Anchor is a plain list whose colours are its DMC equivalents' (D094): 403 is DMC 310's black", () => {
    expect(findThread("anchor", "403")?.rgb).toEqual(findThread("dmc", "310")?.rgb);
    expect(SEEDED_SYSTEMS.find((s) => s.id === "anchor")?.note).toMatch(/not measured/);
  });

  it("Cosmo 600 keeps its sampled colour", () => {
    expect(findThread("cosmo", "600")?.rgb).toEqual([16, 17, 19]);
  });
});

describe("the registry (G-132)", () => {
  afterEach(() => loadThreadSystems(SEEDED_SYSTEMS));

  it("knows only what was loaded, and names any other system as stored", () => {
    loadThreadSystems([{ id: "kreinik", label: "Kreinik", colors: [{ code: "001", name: "Silver", rgb: [200, 200, 200] }] }]);
    expect(loadedSystems().map((s) => s.id)).toEqual(["kreinik"]);
    expect(isLoadedSystem("dmc")).toBe(false);
    expect(systemLabel("dmc")).toBe("dmc");
    expect(systemLabel("kreinik")).toBe("Kreinik");
    expect(findThread("kreinik", "001")?.name).toBe("Silver");
    expect(findThread("dmc", "310")).toBeUndefined();
  });

  it("writes a loaded system by its id, matched by id or name in any case; any other as typed", () => {
    expect(threadSystem("DMC")).toBe("dmc");
    expect(threadSystem(" Anchor ")).toBe("anchor");
    expect(threadSystem("Madeira")).toBe("Madeira");
    expect(threadSystem("full")).toBeNull();
    expect(threadSystem("")).toBeNull();
  });

  it("checks a stored system without the lists", () => {
    expect(storedSystem("Madeira")).toBe("Madeira");
    expect(storedSystem(" dmc")).toBeUndefined();
    expect(storedSystem("FULL")).toBeUndefined();
    expect(storedSystem("x".repeat(41))).toBeUndefined();
    expect(storedSystem(7)).toBeUndefined();
  });
});

describe("formatThreadName", () => {
  it("formats 'CODE - Name' for a brand with real descriptive names (DMC)", () => {
    expect(formatThreadName({ code: "310", name: "Black", rgb: [0, 0, 0] })).toBe("310 - Black");
  });

  it("falls back to just the code for a brand with no descriptive names (Cosmo) -- never a trailing ' - ' artifact", () => {
    expect(formatThreadName({ code: "352", name: "", rgb: [0, 0, 0] })).toBe("352");
  });
});
