import type { LimitValue } from "@/lib/limits/limits";
import { readThreadList, THREAD_FILE_MAX_BYTES } from "./thread-list-file";
import { OWN_KEY_PREFIX, SYSTEM_KEY_MAX, systemDetails, type ThreadRow } from "./thread-system";

/**
 * A person's own thread systems (G-132 M4, D402): uploaded as a CSV or JSON list, kept with their account, private to them,
 * and offered in generation and editing beside the site's. Pure: the database half is `own-server.ts`. A file is read by
 * the same reader as the admin's (`readThreadList`), so it is data and nothing else.
 */

export { OWN_SYSTEMS_FEATURE } from "./thread-system";

/** The limit on how many systems a person keeps. */
export const OWN_SYSTEMS_LIMIT = "threads.systems";

/** The largest upload body: the file's text JSON-escaped, with room for its name. */
export const OWN_SYSTEM_MAX_BYTES = 2 * THREAD_FILE_MAX_BYTES + 4096;

/** One of a person's systems as their account lists it. */
export interface OwnSystem {
  id: string;
  key: string;
  label: string;
  note: string | null;
  source: string | null;
  licence: string | null;
  threads: ThreadRow[];
  savedAt: string;
}

/**
 * The key a new system is stored under: `my-` and its name made a key, numbered when the person keeps one so already. It
 * never changes, so a rename leaves the person's charts naming it.
 */
export function ownSystemKey(label: string, taken: ReadonlySet<string>): string {
  const room = SYSTEM_KEY_MAX - OWN_KEY_PREFIX.length - 3; // room for "-99"
  const slug = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, room)
    .replace(/^-+|-+$/g, "");
  const base = `${OWN_KEY_PREFIX}${slug || "threads"}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function ownSystemCountRefusal(kept: number, allowed: LimitValue): string | null {
  if (allowed === "unlimited" || kept < allowed) return null;
  return `You keep ${kept} thread ${kept === 1 ? "system" : "systems"}, as many as your account allows. Delete one to upload another.`;
}

/**
 * An upload's body, `{ name?, text }`, `text` being the file as read: the system's details and threads, or what is wrong.
 * The name given wins over one the file carries; with neither, it is "My threads".
 */
export function readOwnSystemUpload(
  body: unknown
):
  | { details: { label: string; note: string | null; source: string | null; licence: string | null }; threads: ThreadRow[] }
  | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "That is not a thread system." };
  const { name, text } = body as { name?: unknown; text?: unknown };
  if (typeof text !== "string") return { error: "Choose a CSV or JSON file of threads." };
  if (new TextEncoder().encode(text).length > THREAD_FILE_MAX_BYTES) {
    return { error: `The file is larger than ${THREAD_FILE_MAX_BYTES / 1024} KB.` };
  }
  const read = readThreadList(text);
  if ("error" in read) return read;
  const fromFile = read.details ?? {};
  const given = typeof name === "string" ? name.trim() : "";
  const details = systemDetails({ ...fromFile, label: given || fromFile.label || "My threads" });
  if ("error" in details) return details;
  return { details, threads: read.threads };
}
