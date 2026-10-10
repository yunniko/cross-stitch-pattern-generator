import type { PaletteColor } from "../types";
import { THREAD_BRAND_IDS, THREAD_BRANDS } from "./thread-brands";

/**
 * What the exports print for a colour's thread (G-131, D396): the same System, Number and Color name columns in every
 * chart, whatever its threads' systems. The Rust exporter (`Color::printed_thread` in `rust/cs-export/src/model.rs`)
 * prints the same.
 */
export interface PrintedThread {
  system: string;
  number: string;
  name: string;
}

/**
 * The system and number come only from the colour's thread, never from its name, so a colour that is no thread prints
 * both blank and its whole name. A name that begins with the thread's number ("321 - Red") prints without it, since the
 * Number column already says it.
 */
export function printedThread(color: Pick<PaletteColor, "name" | "source">): PrintedThread {
  if (!color.source) return { system: "", number: "", name: color.name };
  const { code, name } = splitThreadCodeName(color.name);
  return {
    system: THREAD_BRANDS[color.source.brand].label,
    number: color.source.code,
    name: code === color.source.code ? name : color.name,
  };
}

/**
 * `formatThreadName`'s inverse: "310 - Black" is code "310" and name "Black". With no " - " the whole string is the code,
 * which is how `formatThreadName` writes a thread with no published name (a Cosmo number).
 */
export function splitThreadCodeName(fullName: string): { code: string; name: string } {
  const idx = fullName.indexOf(" - ");
  if (idx === -1) return { code: fullName, name: "" };
  return { code: fullName.slice(0, idx), name: fullName.slice(idx + 3) };
}

/** The same three on one line, for the legends that have no columns: "DMC 321 - Red". */
export function printedThreadLabel(color: Pick<PaletteColor, "name" | "source">): string {
  const { system, number, name } = printedThread(color);
  const thread = `${system} ${number}`.trim();
  if (!thread) return name;
  return name ? `${thread} - ${name}` : thread;
}

/** The systems a palette's threads are of, in catalogue order: what the details' Thread row says. */
export function threadSystems(palette: ReadonlyArray<Pick<PaletteColor, "source">>): string[] {
  return THREAD_BRAND_IDS.filter((brand) => palette.some((color) => color.source?.brand === brand)).map(
    (brand) => THREAD_BRANDS[brand].label
  );
}
