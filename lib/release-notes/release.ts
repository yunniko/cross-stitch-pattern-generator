/**
 * Cutting a release from the notes in `release-notes/next/`, and reading a release back (G-105 M3, D310). Pure: the
 * release step (`scripts/release.mjs`) does the files and git, the "What's new" page the drawing. Type imports only, so
 * Node runs it as it is.
 */
import type { NoteKind, ReleaseNote } from "./rule";

/** Where each release's notes are kept once it is cut, one file per release, named by its version. */
export const RELEASES_DIR = "release-notes/releases/";

/** The kinds a reader sees, in the order "What's new" lists them; `internal` notes are dropped at release. */
export const SHOWN_KINDS = [
  { kind: "new", heading: "New" },
  { kind: "changed", heading: "Changed" },
  { kind: "fixed", heading: "Fixed" },
] as const satisfies readonly { kind: NoteKind; heading: string }[];

interface Version {
  major: number;
  minor: number;
  patch: number;
}

export function parseVersion(text: string): Version | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
}

/** Newest first: negative when `a` is the later release. */
export function compareVersionsNewestFirst(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return a < b ? 1 : a > b ? -1 : 0;
  return y.major - x.major || y.minor - x.minor || y.patch - x.patch;
}

/**
 * The number the coming release takes (semantic versioning, Owner 2026-10-06; rule (d) of G-105's plan). Something new
 * or changed raises the middle number; fixes alone, or only work a user does not see, the last. The first number is
 * raised by hand, at the public launch (0.x until then, Owner 2026-10-06), never by this rule.
 */
export function nextVersion(current: string, kinds: readonly NoteKind[]): string {
  const version = parseVersion(current);
  if (!version) throw new Error(`"${current}" is not a version (major.minor.patch)`);
  const { major, minor, patch } = version;
  return kinds.some((kind) => kind === "new" || kind === "changed") ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

/** A note's text as one item of a Markdown list: its later lines indented under the first. */
function listItem(text: string): string {
  return `- ${text.trim().split(/\r?\n/).join("\n  ")}`;
}

/**
 * The release's own file: its version and date, then a section per kind a reader sees. Notes keep the order given (the
 * release step gives them by file name, so a cut is the same however often it is made). A release of internal work only
 * says so, since every deploy is a numbered release.
 */
export function releaseFile(version: string, date: string, notes: readonly ReleaseNote[]): string {
  const sections = SHOWN_KINDS.map(({ kind, heading }) => {
    const items = notes.filter((note) => note.kind === kind).map((note) => listItem(note.text));
    return items.length > 0 ? `## ${heading}\n\n${items.join("\n")}\n` : null;
  }).filter((section): section is string => section !== null);
  const body = sections.length > 0 ? sections.join("\n") : "Work behind the scenes only: nothing you would notice has changed.\n";
  return `---\nversion: ${version}\ndate: ${date}\n---\n\n${body}`;
}

export interface Release {
  version: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** The notes, Markdown. */
  body: string;
}

/** A release file read back; null when it is not one. */
export function parseRelease(source: string): Release | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source.replace(/^﻿/, ""));
  if (!match) return null;
  const version = /^version:\s*(\S+)\s*$/m.exec(match[1])?.[1];
  const date = /^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m.exec(match[1])?.[1];
  if (!version || !parseVersion(version) || !date) return null;
  return { version, date, body: match[2].trim() };
}

/** The deploy log's row for a release, to fill in its last column with how the deploy was verified. */
export function deployLogRow(date: string, commit: string, version: string, notes: readonly ReleaseNote[]): string {
  const shown = notes.filter((note) => note.kind !== "internal").length;
  const what = shown > 0 ? `${shown} note(s) in What's new` : "work behind the scenes only";
  return `| ${date} | ${commit} | **v${version}:** ${what} | (how verified) |`;
}
