import { describe, expect, it } from "vitest";
import { RELEASES_DIR } from "@/lib/release-notes/release";
import { asksForNote, checkChange, parseNote, RELEASED_NOTES_DIR, type ChangedPath } from "@/lib/release-notes/rule";

/** G-105 M2, D309: which changes ask for a release note, and what satisfies the ask. */

const note = (kind: string, text = "Something a person can see.") => `---\nkind: ${kind}\n---\n${text}\n`;
const present = (...paths: string[]): ChangedPath[] => paths.map((path) => ({ path, state: "present" }));

describe("which paths ask for a note", () => {
  it("asks for the app, the library, the engine and the public files", () => {
    for (const path of [
      "app/components/preferences.tsx",
      "lib/editor/commands.ts",
      "rust/cs-core/src/pattern.rs",
      "public/fonts/x.woff2",
    ]) {
      expect(asksForNote(path), path).toBe(true);
    }
  });

  it("does not ask for tests, docs, scripts, the admin's pages or the notes themselves", () => {
    for (const path of [
      "tests/unit/x.spec.ts",
      "tests/e2e/helpers/app.ts",
      "lib/editor/x.spec.ts",
      "rust/cs-core/tests/pattern_invariants.rs",
      "docs/architecture.md",
      "scripts/look.mjs",
      "app/admin/features/page.tsx",
      "GOALS.md",
      "package.json",
      "release-notes/next/a.md",
    ]) {
      expect(asksForNote(path), path).toBe(false);
    }
  });

  it("reads a path written with backslashes as git's", () => {
    expect(asksForNote("app\\components\\app-bar.tsx")).toBe(true);
    expect(asksForNote("app\\admin\\layout.tsx")).toBe(false);
  });
});

describe("a note file", () => {
  it("is a kind in front matter, then the text", () => {
    expect(parseNote(note("fixed", "The size field keeps what you type."))).toEqual({
      kind: "fixed",
      text: "The size field keeps what you type.",
    });
    expect(parseNote(note("internal", "A rename; nothing on screen moves."))).toEqual({
      kind: "internal",
      text: "A rename; nothing on screen moves.",
    });
  });

  it("is read with Windows line ends and a byte-order mark", () => {
    expect(parseNote("﻿---\r\nkind: new\r\n---\r\nA colour picker.\r\n")).toEqual({ kind: "new", text: "A colour picker." });
  });

  it("is refused without front matter, without a kind, with an unknown kind or with no text", () => {
    expect(parseNote("A colour picker.")).toHaveProperty("error");
    expect(parseNote("---\ntitle: x\n---\nA colour picker.")).toHaveProperty("error");
    expect(parseNote(note("feature"))).toHaveProperty("error");
    expect(parseNote("---\nkind: new\n---\n   \n")).toHaveProperty("error");
  });
});

describe("a change", () => {
  const files: Record<string, string> = {
    "release-notes/next/picker.md": note("new"),
    "release-notes/next/rename.md": note("internal", "Renamed a hook."),
    "release-notes/next/broken.md": "no front matter",
  };
  const read = (path: string) => files[path];

  it("under app/ with no note fails, naming the files", () => {
    const result = checkChange(present("app/components/app-bar.tsx"), read);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("app/components/app-bar.tsx");
  });

  it("with a note, or with an internal mark, passes", () => {
    expect(checkChange(present("app/components/app-bar.tsx", "release-notes/next/picker.md"), read).ok).toBe(true);
    expect(checkChange(present("lib/editor/commands.ts", "release-notes/next/rename.md"), read).ok).toBe(true);
  });

  it("to tests or docs alone asks for nothing", () => {
    expect(checkChange(present("tests/e2e/workspaces.spec.ts", "docs/architecture.md"), read)).toMatchObject({ ok: true, asking: [] });
  });

  it("deleting a file under app/ still asks", () => {
    expect(checkChange([{ path: "app/components/old.tsx", state: "deleted" }], read).ok).toBe(false);
  });

  it("whose only note is being deleted (a release being gathered) is not satisfied by it", () => {
    const result = checkChange([...present("app/x.tsx"), { path: "release-notes/next/picker.md", state: "deleted" }], read);
    expect(result.ok).toBe(false);
  });

  it("that cuts a release is carried by it: the notes moved into the release's file (v0.2.1's push)", () => {
    const pushed = [
      ...present("app/whats-new/page.tsx", "release-notes/releases/0.2.1.md"),
      { path: "release-notes/next/picker.md", state: "deleted" as const },
    ];
    expect(checkChange(pushed, read)).toMatchObject({ ok: true, releases: ["release-notes/releases/0.2.1.md"] });
    // A release's file elsewhere, or a file that is not one, carries nothing.
    expect(checkChange(present("app/x.tsx", "release-notes/README.md"), read).ok).toBe(false);
    // The rule names the folder the release step writes to.
    expect(RELEASED_NOTES_DIR).toBe(RELEASES_DIR);
  });

  it("carrying a note that does not parse fails, even with nothing else to ask for", () => {
    const result = checkChange(present("release-notes/next/broken.md"), read);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("release-notes/next/broken.md");
  });
});
