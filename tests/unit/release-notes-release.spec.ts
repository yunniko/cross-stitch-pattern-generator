import { describe, expect, it } from "vitest";
import { compareVersionsNewestFirst, deployLogRow, nextVersion, parseRelease, releaseFile } from "@/lib/release-notes/release";
import type { ReleaseNote } from "@/lib/release-notes/rule";

/** G-105 M3, D310: numbering a release by its notes, and its file written and read back. */

describe("the number a release takes", () => {
  it("raises the middle number for something new or changed, and starts the last again", () => {
    expect(nextVersion("0.1.0", ["new"])).toBe("0.2.0");
    expect(nextVersion("0.2.3", ["fixed", "changed"])).toBe("0.3.0");
  });

  it("raises the last number for fixes alone, or for work nobody sees", () => {
    expect(nextVersion("0.2.0", ["fixed", "fixed"])).toBe("0.2.1");
    expect(nextVersion("0.2.1", ["internal"])).toBe("0.2.2");
  });

  it("never raises the first number: that is the public launch, by hand", () => {
    expect(nextVersion("0.99.0", ["new"])).toBe("0.100.0");
    expect(nextVersion("1.4.2", ["new"])).toBe("1.5.0");
  });

  it("refuses a current version that is not major.minor.patch", () => {
    expect(() => nextVersion("0.2", ["new"])).toThrow(/not a version/);
  });
});

describe("a release's file", () => {
  const notes: ReleaseNote[] = [
    { kind: "fixed", text: "The size field keeps what you type." },
    { kind: "internal", text: "A rename." },
    { kind: "new", text: "A colour picker.\nHold Alt with any drawing tool." },
    { kind: "changed", text: "Save is in the bar." },
  ];

  it("lists new, changed and fixed in that order, and leaves internal notes out", () => {
    const file = releaseFile("0.2.0", "2026-10-06", notes);
    expect(file).toBe(
      "---\nversion: 0.2.0\ndate: 2026-10-06\n---\n\n## New\n\n- A colour picker.\n  Hold Alt with any drawing tool.\n\n## Changed\n\n- Save is in the bar.\n\n## Fixed\n\n- The size field keeps what you type.\n"
    );
    expect(file).not.toContain("A rename");
  });

  it("says so when the release carries internal work only", () => {
    expect(releaseFile("0.2.1", "2026-10-07", [{ kind: "internal", text: "A rename." }])).toContain("nothing you would notice");
  });

  it("reads back as its version, date and notes", () => {
    expect(parseRelease(releaseFile("0.2.0", "2026-10-06", notes))).toMatchObject({ version: "0.2.0", date: "2026-10-06" });
    expect(parseRelease(releaseFile("0.2.0", "2026-10-06", notes))?.body).toMatch(/^## New/);
    expect(parseRelease("no front matter")).toBeNull();
    expect(parseRelease("---\nversion: x\ndate: 2026-10-06\n---\nBody")).toBeNull();
  });
});

describe("releases in order", () => {
  it("are newest first by number, not by text", () => {
    expect(["0.2.0", "0.10.0", "0.9.1", "1.0.0"].sort(compareVersionsNewestFirst)).toEqual(["1.0.0", "0.10.0", "0.9.1", "0.2.0"]);
  });
});

describe("the deploy log's row", () => {
  it("names the date, the commit, the version and what it carries", () => {
    expect(
      deployLogRow("2026-10-06", "abc1234", "0.2.0", [
        { kind: "new", text: "x" },
        { kind: "internal", text: "y" },
      ])
    ).toBe("| 2026-10-06 | abc1234 | **v0.2.0:** 1 note(s) in What's new | (how verified) |");
  });
});
