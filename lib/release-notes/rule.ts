/**
 * Which changes ask for a release note, and what a note is (G-105 M2). Pure: the check around it
 * (`scripts/check-release-notes.mjs`) reads git and the files, and this decides. No imports, so Node runs it as it is.
 *
 * A note is one small file in `release-notes/next/`, written in a user's words, gathered into the release when one is cut.
 * Its kind says what it is: `new`, `changed` or `fixed` reach "What's new"; `internal` is the explicit mark that a change
 * under a watched path has nothing a user sees, with one line saying why, and is dropped at release. See D309.
 */

export const NOTE_KINDS = ["new", "changed", "fixed", "internal"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

/** Where the notes of the coming release wait until it is cut. */
export const NEXT_NOTES_DIR = "release-notes/next/";

/** Where a cut release's notes go, one file per version (`RELEASES_DIR` in `release.ts`, kept here so this imports nothing). */
export const RELEASED_NOTES_DIR = "release-notes/releases/";

export interface ReleaseNote {
  kind: NoteKind;
  /** What a user reads (or, for `internal`, why there is nothing to read). Markdown, trimmed. */
  text: string;
}

/** A path in a change, and whether the change added or edited it (`"present"`) or removed it (`"deleted"`). */
export interface ChangedPath {
  path: string;
  state: "present" | "deleted";
}

const WATCHED = ["app/", "lib/", "rust/", "public/"];

/** Git writes forward slashes; a path typed on Windows may not. */
function toSlashes(path: string): string {
  return path.replaceAll("\\", "/");
}
const UNWATCHED = ["app/admin/"];

/**
 * Whether a change to this file can alter what a user sees. Judged by the path alone, and erring on asking: a rule that
 * tried to judge the change itself would be guessed around, and a change with nothing to see says so with an `internal`
 * note. The admin's pages are not the users'; tests of any kind are not the product.
 */
export function asksForNote(path: string): boolean {
  const p = toSlashes(path);
  if (!WATCHED.some((dir) => p.startsWith(dir))) return false;
  if (UNWATCHED.some((dir) => p.startsWith(dir))) return false;
  if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(p)) return false;
  if (/^rust\/[^/]+\/tests\//.test(p) || /^rust\/[^/]+\/benches\//.test(p)) return false;
  return true;
}

/**
 * A note file's text: a front matter block naming its kind, then the text.
 *
 *     ---
 *     kind: fixed
 *     ---
 *     The custom size can be typed freely again.
 */
export function parseNote(source: string): ReleaseNote | { error: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source.replace(/^\uFEFF/, ""));
  if (!match) return { error: "it does not start with a front matter block (--- kind: ... ---)" };
  const kindLine = /^kind:\s*(\S+)\s*$/m.exec(match[1]);
  if (!kindLine) return { error: "its front matter names no kind" };
  const kind = kindLine[1] as NoteKind;
  if (!NOTE_KINDS.includes(kind)) return { error: `"${kindLine[1]}" is not a kind (${NOTE_KINDS.join(", ")})` };
  const text = match[2].trim();
  if (!text) return { error: "it has no text" };
  return { kind, text };
}

export interface NoteCheck {
  ok: boolean;
  /** The changed files that ask for a note. */
  asking: string[];
  /** The notes the change adds or edits. */
  notes: string[];
  /** The releases the change cuts: each holds the notes gathered out of `release-notes/next/`. */
  releases: string[];
  /** What is wrong, one line each, written for the person who made the change. */
  problems: string[];
}

/**
 * Whether a change carries what it must. A change touching a watched path needs at least one note added or edited in
 * `release-notes/next/` with it, or a release cut in it: a pushed range that ends in "Release vX" has moved its notes
 * into that release's file, and the release is where they are now (found on v0.2.1's push). Any note it adds or edits
 * must parse. `readNote` gives a note file's text.
 */
export function checkChange(changed: ChangedPath[], readNote: (path: string) => string): NoteCheck {
  const present = changed.filter((c) => c.state === "present").map((c) => toSlashes(c.path));
  const asking = changed.map((c) => toSlashes(c.path)).filter(asksForNote);
  const notes = present.filter((p) => p.startsWith(NEXT_NOTES_DIR) && p.endsWith(".md"));
  const releases = present.filter((p) => p.startsWith(RELEASED_NOTES_DIR) && p.endsWith(".md"));
  const problems: string[] = [];
  for (const note of notes) {
    const parsed = parseNote(readNote(note));
    if ("error" in parsed) problems.push(`${note}: ${parsed.error}`);
  }
  if (asking.length > 0 && notes.length === 0 && releases.length === 0) {
    problems.push(
      `${asking.length} changed file(s) can alter what a user sees (${asking.slice(0, 3).join(", ")}${asking.length > 3 ? ", ..." : ""}), ` +
        `and no note was added to ${NEXT_NOTES_DIR}. Add one (kind new, changed or fixed), or one of kind internal saying why nothing shows.`
    );
  }
  return { ok: problems.length === 0, asking, notes, releases, problems };
}
