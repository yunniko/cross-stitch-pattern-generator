import type { ThreadColor } from "./thread-color";

export type { ThreadColor };

/** A system as a chart stores it ("dmc"): any string (G-132), loaded here or not. */
export type ThreadBrand = string;

/**
 * A thread system loaded in this page (G-132, D400): a maker's numbered threads as data, given by the server
 * (`lib/thread-systems/server.ts`) rather than compiled in, so the site's systems and a person's own are alike here.
 */
export interface ThreadSystemInfo {
  /** What a chart stores as a colour's system. */
  id: string;
  label: string;
  /** What a person should know about the colours, such as how they were found; shown beside the system's list. */
  note?: string;
  /** The threads in the list's order, which is the order a picker shows them. */
  colors: readonly ThreadColor[];
}

let loaded: readonly ThreadSystemInfo[] = [];
let byId = new Map<string, ThreadSystemInfo>();

/**
 * Makes these the systems this page knows (G-132). Called by `ThreadSystemsProvider` in the browser with what the server
 * gave, and by the unit tests' setup with the seeded lists; never on the server, where requests of different people share
 * the module, so server code reads the table instead.
 */
export function loadThreadSystems(systems: readonly ThreadSystemInfo[]): void {
  if (systems === loaded) return;
  loaded = systems;
  byId = new Map(systems.map((system) => [system.id, system]));
}

/** The systems loaded, in the order offered. */
export function loadedSystems(): readonly ThreadSystemInfo[] {
  return loaded;
}

/** A loaded system by its id. */
export function loadedSystem(id: string): ThreadSystemInfo | undefined {
  return byId.get(id);
}

/** Whether a stored system is one loaded here (G-132): a colour of any other keeps its system, but has no list to pick from. */
export function isLoadedSystem(system: string): boolean {
  return byId.has(system);
}

/** The name a system is shown and printed by: the loaded system's, else the string as stored (G-132). */
export function systemLabel(system: string): string {
  return byId.get(system)?.label ?? system;
}

/** A system's thread by code: an exact match, else a case-insensitive one. Always returns the list's own entry, so callers store its canonical code. */
export function findThread(brand: string, code: string): ThreadColor | undefined {
  const colors = byId.get(brand)?.colors;
  if (!colors) return undefined;
  const wanted = code.toLowerCase();
  return colors.find((c) => c.code === code) ?? colors.find((c) => c.code.toLowerCase() === wanted);
}

/** The longest thread number kept (G-131): longer than any catalogue's, short enough for a printed key's column. */
export const THREAD_CODE_MAX = 20;

/** The longest system string kept (G-132): a maker's name fits, a paragraph does not. */
export const THREAD_SYSTEM_MAX = 40;

/** A system string as stored, checked without the loaded systems (G-132): 1 to 40 characters, no control characters, never "full". */
export function storedSystem(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value === "" || value.trim() !== value || value.length > THREAD_SYSTEM_MAX || /[\u0000-\u001f\u007f]/.test(value)) return undefined;
  return value.toLowerCase() === "full" ? undefined : value;
}

/**
 * A system as stored (G-132): a loaded one by its id, matched by id or name in any case ("DMC" is "dmc"); any other kept
 * as written, trimmed, since a chart may name a system not loaded here. Null when blank, too long, holding control
 * characters, or "full" (the palette mode of no system).
 */
export function threadSystem(written: string): string | null {
  const typed = written.trim();
  if (typed === "" || typed.length > THREAD_SYSTEM_MAX || /[\u0000-\u001f\u007f]/.test(typed)) return null;
  const wanted = typed.toLowerCase();
  if (wanted === "full") return null;
  const match =
    loaded.find((s) => s.id === wanted || s.label.toLowerCase() === wanted) ?? loaded.find((s) => s.id.toLowerCase() === wanted);
  return match?.id ?? typed;
}

/**
 * A colour's thread as someone typed or chose it (G-131): its system and number. A number the loaded list knows is stored as
 * the list writes it (so "b5200" is "B5200"); any other is kept as typed, trimmed, since people own threads no list here
 * has. The system may be one not loaded here (G-132), kept as `threadSystem` writes it. Null when the number or the system
 * is blank or too long.
 */
export function threadIdentity(brand: string, code: string): { brand: string; code: string } | null {
  const system = threadSystem(brand);
  const typed = code.trim();
  if (!system || typed === "" || typed.length > THREAD_CODE_MAX) return null;
  return { brand: system, code: findThread(system, typed)?.code ?? typed };
}

/** "CODE - Name", or just the code for a system with no names (never "352 - "). */
export function formatThreadName(thread: ThreadColor): string {
  return thread.name ? `${thread.code} - ${thread.name}` : thread.code;
}
