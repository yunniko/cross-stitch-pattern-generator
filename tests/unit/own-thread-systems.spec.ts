import { describe, expect, it } from "vitest";
import { featureById } from "@/app/features/registry";
import { ACCOUNT_SECTIONS } from "@/lib/account/sections";
import { DEFAULT_OPTIONS } from "@/lib/editor/workspace-storage";
import { brandFeature } from "@/lib/features/declare";
import { optionsInForce } from "@/lib/features/in-force";
import { limitById } from "@/lib/limits/limits";
import {
  OWN_SYSTEM_MAX_BYTES,
  OWN_SYSTEMS_FEATURE,
  OWN_SYSTEMS_LIMIT,
  ownSystemCountRefusal,
  ownSystemKey,
  readOwnSystemUpload,
} from "@/lib/thread-systems/own-system";
import { THREAD_FILE_MAX_BYTES } from "@/lib/thread-systems/thread-list-file";
import { MAX_THREADS, systemFeature, systemKeyRefusal, systemRefusal } from "@/lib/thread-systems/thread-system";

/** G-132 M4, D402: a person's own thread systems, uploaded as a file, private to them, under one switch and one limit. */

describe("an own system's key", () => {
  it("is my- and its name made a key, numbered when the person keeps one so already", () => {
    expect(ownSystemKey("Kreinik Metallics", new Set())).toBe("my-kreinik-metallics");
    expect(ownSystemKey("Kreinik Metallics", new Set(["my-kreinik-metallics"]))).toBe("my-kreinik-metallics-2");
    expect(ownSystemKey("Kreinik Metallics", new Set(["my-kreinik-metallics", "my-kreinik-metallics-2"]))).toBe("my-kreinik-metallics-3");
    expect(ownSystemKey("Příze české", new Set())).toBe("my-prize-ceske");
    expect(ownSystemKey("★★", new Set())).toBe("my-threads");
  });

  it("is a valid key however long the name, and one the site's keys can never be", () => {
    const key = ownSystemKey("A very long name for a thread system indeed", new Set());
    expect(key.length).toBeLessThanOrEqual(30);
    expect(key).toMatch(/^my-[a-z0-9-]*[a-z0-9]$/);
    expect(ownSystemKey("x".repeat(40), new Set([ownSystemKey("x".repeat(40), new Set())])).length).toBeLessThanOrEqual(30);
    expect(systemKeyRefusal("my-silk")).toBe("A key beginning \"my-\" is a person's own system's.");
    expect(systemKeyRefusal("silk")).toBeNull();
  });
});

describe("the switch and the limit", () => {
  it("puts every own system under threads.custom, and a site system under its own switch", () => {
    expect(systemFeature("my-silk")).toBe(OWN_SYSTEMS_FEATURE);
    expect(systemFeature("dmc")).toBe("brand.dmc");
    expect(brandFeature("my-silk")).toBe("threads.custom");
    expect(brandFeature("full")).toBeNull();
    expect(featureById("threads.custom")).toMatchObject({ label: "Thread systems of your own", group: "Saving" });
  });

  it("refuses generating in an own system when the switch is not on, by the system's name", () => {
    const labels = new Map([["my-silk", "Silk"]]);
    expect(systemRefusal({ paletteMode: "my-silk" }, {}, labels)).toBeNull();
    expect(systemRefusal({ paletteMode: "my-silk" }, { "threads.custom": "locked" }, labels)).toMatch(/^Silk/);
  });

  it("reads an own mode as the full range while the switch is off, and keeps it while on", () => {
    const options = { ...DEFAULT_OPTIONS, paletteMode: "my-silk", defaultPaletteMode: "my-silk" };
    expect(optionsInForce(options, {}).paletteMode).toBe("my-silk");
    const off = optionsInForce(options, { "threads.custom": "hidden" });
    expect([off.paletteMode, off.defaultPaletteMode]).toEqual(["full", "full"]);
  });

  it("counts up to ten systems by default, and says so at the limit", () => {
    expect(limitById(OWN_SYSTEMS_LIMIT)).toMatchObject({ unit: "systems", siteDefault: 10 });
    expect(ownSystemCountRefusal(9, 10)).toBeNull();
    expect(ownSystemCountRefusal(10, 10)).toBe("You keep 10 thread systems, as many as your account allows. Delete one to upload another.");
    expect(ownSystemCountRefusal(1, 1)).toMatch(/^You keep 1 thread system,/);
    expect(ownSystemCountRefusal(500, "unlimited")).toBeNull();
  });

  it("has a page in the account", () => {
    expect(ACCOUNT_SECTIONS.find((section) => section.id === "thread-systems")?.href).toBe("/account/thread-systems");
  });
});

describe("an upload", () => {
  it("reads a CSV with the name given, or the JSON file's own details", () => {
    expect(readOwnSystemUpload({ name: " Silk ", text: "S1,Ivory,#fffff0\nS2,,#202020" })).toEqual({
      details: { label: "Silk", note: null, source: null, licence: null },
      threads: [
        ["S1", "Ivory", "fffff0"],
        ["S2", "", "202020"],
      ],
    });
    const json = JSON.stringify({ name: "Kreinik", licence: "CC0", threads: [{ number: "001", name: "Silver", hex: "#c0c0c0" }] });
    expect(readOwnSystemUpload({ text: json })).toMatchObject({ details: { label: "Kreinik", licence: "CC0" } });
    expect(readOwnSystemUpload({ name: "Mine", text: json })).toMatchObject({ details: { label: "Mine", licence: "CC0" } });
    expect(readOwnSystemUpload({ text: "1,,#000000" })).toMatchObject({ details: { label: "My threads" } });
  });

  it("refuses what is not a list of threads, says which line is wrong, and refuses a file too large", () => {
    expect(readOwnSystemUpload(null)).toEqual({ error: "That is not a thread system." });
    expect(readOwnSystemUpload({ name: "x" })).toEqual({ error: "Choose a CSV or JSON file of threads." });
    expect(readOwnSystemUpload({ text: "1,Black" })).toEqual({ error: "Line 1 has 2 cells: each line is a number, a name and a colour." });
    expect(readOwnSystemUpload({ name: "x".repeat(41), text: "1,,#000000" })).toEqual({ error: "A name is 1 to 40 characters." });
    expect(readOwnSystemUpload({ text: "x".repeat(THREAD_FILE_MAX_BYTES + 1) })).toEqual({ error: "The file is larger than 512 KB." });
    const many = Array.from({ length: MAX_THREADS + 1 }, (_, i) => `${i},,#000000`).join("\n");
    expect(readOwnSystemUpload({ text: many })).toEqual({ error: `A thread system lists between 1 and ${MAX_THREADS} threads.` });
  });

  it("allows a body large enough for the largest file JSON-escaped", () => {
    expect(OWN_SYSTEM_MAX_BYTES).toBeGreaterThan(2 * THREAD_FILE_MAX_BYTES);
  });
});
