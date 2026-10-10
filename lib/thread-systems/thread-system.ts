import { featureUsable, lockedNote, type Feature, type FeatureStates } from "../features/features";
import { storedSystem, THREAD_CODE_MAX, type ThreadSystemInfo } from "../threads/thread-brands";

/**
 * Thread systems as data (G-132, D400): what a system's list is, read and checked once for the table, the requests the
 * server makes of the pipeline, and the browser's registry. Pure, so the admin's and a person's uploads (M3, M4) are
 * checked by the same code as the seeded lists.
 */

/** A thread as stored and as the pipeline is handed it: its number, its name ("" for none) and its colour as "rrggbb". */
export type ThreadRow = [code: string, name: string, hex: string];

/** A system as a generation request carries it to the pipeline. */
export interface RequestSystem {
  key: string;
  threads: ThreadRow[];
}

/**
 * A person's own systems' keys begin so, and a site system's never does, so a chart's system names one or the other
 * (G-132 M4, D402). An own key is unique among its owner's systems only.
 */
export const OWN_KEY_PREFIX = "my-";

/** The feature a person's own systems are under, all of them alike (Owner, G-132: gated as palettes are). */
export const OWN_SYSTEMS_FEATURE = "threads.custom";

/** The switch a system is used under: a site system's own `brand.<key>`, or the one switch of a person's own systems. */
export function systemFeature(key: string): string {
  return key.startsWith(OWN_KEY_PREFIX) ? OWN_SYSTEMS_FEATURE : `brand.${key}`;
}

/** The group the systems' switches are listed under in the admin's feature lists. */
export const THREAD_BRANDS_GROUP = "Thread brands";

/**
 * Each site system is a feature of its own, `brand.<key>`, switched per site, set, tier and person like any other (G-132
 * M3, D401). The systems are rows, not code, so their features are made from the rows wherever the list is shown.
 */
export function systemFeatures(systems: readonly { key: string; label: string }[]): Feature[] {
  return systems.map(({ key, label }) => ({ id: `brand.${key}`, group: THREAD_BRANDS_GROUP, label }));
}

/**
 * A generation asking for a system this person may not use, refused by the system's name (`labels`, from its row), or
 * null. A system not in `labels` is no switch's: the pipeline refuses it by name, having been given no list for it.
 */
export function systemRefusal(body: Record<string, unknown>, states: FeatureStates, labels: ReadonlyMap<string, string>): string | null {
  const mode = body.paletteMode;
  if (typeof mode !== "string" || mode === "full" || featureUsable(states, systemFeature(mode))) return null;
  return lockedNote(labels.get(mode) ?? mode);
}

/** The longest key: it is stored in charts and named in a feature id, so it stays short. */
export const SYSTEM_KEY_MAX = 30;
/** The longest name of a system. */
export const SYSTEM_LABEL_MAX = 40;
/** The longest note, source or licence. */
export const SYSTEM_TEXT_MAX = 500;

/**
 * What is wrong with a new system's key, or null. Lower-case letters, digits and hyphens, so it is a valid feature id and
 * reads the same in a file; never "full", the mode of no system. A key is never changed: charts store it.
 */
export function systemKeyRefusal(key: unknown): string | null {
  if (typeof key !== "string" || !new RegExp(`^[a-z0-9][a-z0-9-]{0,${SYSTEM_KEY_MAX - 1}}$`).test(key) || key === "full") {
    return `A key is 1 to ${SYSTEM_KEY_MAX} lower-case letters, digits and hyphens, and not "full".`;
  }
  if (key.startsWith(OWN_KEY_PREFIX)) return `A key beginning "${OWN_KEY_PREFIX}" is a person's own system's.`;
  return null;
}

/** A system's name, note, source and licence as entered: trimmed, with what is wrong with them, if anything. */
export function systemDetails(input: {
  label: unknown;
  note?: unknown;
  source?: unknown;
  licence?: unknown;
}): { label: string; note: string | null; source: string | null; licence: string | null } | { error: string } {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const label = text(input.label);
  if (label === "" || label.length > SYSTEM_LABEL_MAX || CONTROL.test(label)) {
    return { error: `A name is 1 to ${SYSTEM_LABEL_MAX} characters.` };
  }
  const out = { label, note: null as string | null, source: null as string | null, licence: null as string | null };
  for (const field of ["note", "source", "licence"] as const) {
    const value = text(input[field]);
    if (value.length > SYSTEM_TEXT_MAX) return { error: `The ${field} is longer than ${SYSTEM_TEXT_MAX} characters.` };
    out[field] = value === "" ? null : value;
  }
  return out;
}

/** The most threads one system may list (Owner, G-132): more than any maker's range. */
export const MAX_THREADS = 2000;
/** The longest thread name kept. */
export const THREAD_NAME_MAX = 60;
/** The most systems one request may carry: the palette mode's and those of a set's colours, which the server limits anyway. */
export const MAX_REQUEST_SYSTEMS = 32;

const HEX = /^[0-9a-f]{6}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** What is wrong with a list of threads, or null. Every code is unique, case aside, so a number finds one thread. */
export function threadListRefusal(threads: unknown): string | null {
  if (!Array.isArray(threads) || threads.length < 1 || threads.length > MAX_THREADS) {
    return `A thread system lists between 1 and ${MAX_THREADS} threads.`;
  }
  const codes = new Set<string>();
  for (const row of threads) {
    if (!Array.isArray(row) || row.length !== 3 || !row.every((v) => typeof v === "string")) {
      return "Each thread is its number, its name and its colour.";
    }
    const [code, name, hex] = row as string[];
    if (code === "" || code.trim() !== code || code.length > THREAD_CODE_MAX || CONTROL.test(code)) {
      return `A thread number is 1 to ${THREAD_CODE_MAX} characters: ${JSON.stringify(code.slice(0, 30))} is not one.`;
    }
    if (name.length > THREAD_NAME_MAX || CONTROL.test(name))
      return `The name of thread ${code} is longer than ${THREAD_NAME_MAX} characters.`;
    if (!HEX.test(hex)) return `The colour of thread ${code} is not a colour.`;
    const folded = code.toLowerCase();
    if (codes.has(folded)) return `Thread ${code} is listed twice.`;
    codes.add(folded);
  }
  return null;
}

/** The `threadSystems` a generation request carries (put in by the server, never the browser): what is wrong, or null. */
export function threadSystemsRefusal(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > MAX_REQUEST_SYSTEMS) {
    return `threadSystems must be a list of at most ${MAX_REQUEST_SYSTEMS} thread systems.`;
  }
  const keys = new Set<string>();
  for (const system of value) {
    if (typeof system !== "object" || system === null) return "threadSystems must each be a key and its threads.";
    const { key, threads } = system as Record<string, unknown>;
    if (storedSystem(key) === undefined) return "threadSystems must each have a key of 1 to 40 characters.";
    if (keys.has(key as string)) return `threadSystems names ${key as string} twice.`;
    keys.add(key as string);
    const refusal = threadListRefusal(threads);
    if (refusal) return `threadSystems ${key as string}: ${refusal}`;
  }
  return null;
}

/** The keys of the systems a request carries. */
export function requestSystemKeys(body: Record<string, unknown>): string[] {
  return Array.isArray(body.threadSystems)
    ? body.threadSystems.flatMap((s) => (typeof s === "object" && s !== null && typeof s.key === "string" ? [s.key] : []))
    : [];
}

/** The systems a generation or prediction request names: its palette mode's, its set's, and those of its set's colours. */
export function namedSystems(body: Record<string, unknown>): string[] {
  const named = new Set<string>();
  const add = (value: unknown) => {
    const system = storedSystem(value);
    if (system) named.add(system);
  };
  add(body.paletteMode);
  const set = body.paletteSet;
  if (typeof set === "object" && set !== null && !Array.isArray(set)) {
    const s = set as Record<string, unknown>;
    add(s.mode);
    if (Array.isArray(s.colors))
      for (const c of s.colors) if (typeof c === "object" && c !== null) add((c as Record<string, unknown>).system);
  }
  return [...named];
}

const hex = (rgb: readonly number[]) => rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
const rgb = (h: string): [number, number, number] => [
  parseInt(h.slice(0, 2), 16),
  parseInt(h.slice(2, 4), 16),
  parseInt(h.slice(4, 6), 16),
];

/** A list as the registry holds it. */
export function threadColors(rows: readonly ThreadRow[]): ThreadSystemInfo["colors"] {
  return rows.map(([code, name, h]) => ({ code, name, rgb: rgb(h) }));
}

/** A registry list as rows. */
export function threadRows(colors: ThreadSystemInfo["colors"]): ThreadRow[] {
  return colors.map((c) => [c.code, c.name, hex(c.rgb)]);
}
