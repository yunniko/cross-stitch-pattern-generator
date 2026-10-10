import { THREAD_CODE_MAX } from "../threads/thread-brands";
import { threadListRefusal, type ThreadRow } from "./thread-system";

/**
 * A thread system as a file (G-132, D401): read from CSV (number, name, colour) or JSON, written as either. Pure, so the
 * admin's page and a person's upload read a file by the same rules, and a file downloaded here reads back unchanged.
 */

/** The JSON a download writes, and the first thing a JSON upload is read as. */
export const THREAD_SYSTEM_FORMAT = "cross-stitch-thread-system";

/** The largest file read: 2,000 threads with long names fit several times over. */
export const THREAD_FILE_MAX_BYTES = 512 * 1024;

/** What a file may say about its system besides the threads; the JSON a download writes carries all four. */
export interface ThreadSystemDetails {
  label?: string;
  note?: string;
  source?: string;
  licence?: string;
}

export type ThreadListRead = { threads: ThreadRow[]; details: ThreadSystemDetails } | { error: string };

const HEX = /^#?([0-9a-fA-F]{6})$/;

/** A colour as written in a file ("#A1B2C3", "a1b2c3", or three numbers 0-255 in JSON), as "rrggbb"; null if it is none. */
function colourOf(value: unknown): string | null {
  if (typeof value === "string") {
    const match = HEX.exec(value.trim());
    return match ? match[1].toLowerCase() : null;
  }
  if (Array.isArray(value) && value.length === 3 && value.every((c) => Number.isInteger(c) && c >= 0 && c <= 255)) {
    return value.map((c: number) => c.toString(16).padStart(2, "0")).join("");
  }
  return null;
}

/** A number as written: text as it is, trimmed, or a JSON number as its digits. */
const codeOf = (value: unknown): string | null =>
  typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : null;

/**
 * The threads of a file, CSV or JSON, told apart by the first character: `[` or `{` is JSON. What is wrong is said with
 * where it is (a CSV line, a JSON entry), so a person can find it in their file.
 */
export function readThreadList(text: string): ThreadListRead {
  const body = text.replace(/^﻿/, "");
  if (body.trim() === "") return { error: "The file is empty." };
  const read = /^\s*[[{]/.test(body) ? readJson(body) : readCsv(body);
  if ("error" in read) return read;
  const refusal = threadListRefusal(read.threads);
  return refusal ? { error: refusal } : read;
}

function readJson(text: string): ThreadListRead {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "The file is not valid JSON." };
  }
  const object = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  const entries = object ? object.threads : data;
  if (!Array.isArray(entries)) return { error: "A JSON file is a list of threads, or an object whose threads are one." };
  const threads: ThreadRow[] = [];
  for (const [i, entry] of entries.entries()) {
    const fields = Array.isArray(entry)
      ? { code: entry[0], name: entry[1], colour: entry[2] }
      : typeof entry === "object" && entry !== null
        ? {
            code: (entry as Record<string, unknown>).number ?? (entry as Record<string, unknown>).code,
            name: (entry as Record<string, unknown>).name,
            colour: (entry as Record<string, unknown>).hex ?? (entry as Record<string, unknown>).rgb,
          }
        : null;
    const code = fields && codeOf(fields.code);
    if (!code) return { error: `Thread ${i + 1} has no number.` };
    const hex = colourOf(fields.colour);
    if (!hex) return { error: `Thread ${code} has no colour: give it as "#rrggbb".` };
    const name = fields.name === undefined || fields.name === null ? "" : typeof fields.name === "string" ? fields.name.trim() : null;
    if (name === null) return { error: `The name of thread ${code} is not text.` };
    threads.push([code, name, hex]);
  }
  const details: ThreadSystemDetails = {};
  for (const [key, from] of [
    ["label", object?.name],
    ["note", object?.note],
    ["source", object?.source],
    ["licence", object?.licence],
  ] as const) {
    if (typeof from === "string" && from.trim() !== "") details[key] = from.trim();
  }
  return { threads, details };
}

/** One CSV line's cells: separated by `separator`, a cell in double quotes may hold it, and `""` is a quote. */
function cells(line: string, separator: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === separator) {
      out.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

function readCsv(text: string): ThreadListRead {
  const lines = text.split(/\r\n|\r|\n/);
  const first = lines.find((line) => line.trim() !== "") ?? "";
  // A spreadsheet in a comma-decimal locale writes semicolons; a copy from one, tabs.
  const separator = [",", ";", "\t"].reduce((best, s) => (first.split(s).length > first.split(best).length ? s : best), ",");
  const threads: ThreadRow[] = [];
  let header = true;
  for (const [i, line] of lines.entries()) {
    if (line.trim() === "") continue;
    const row = cells(line, separator);
    // The first line is a header when its third cell names the column ("number,name,hex"); any other line is a thread,
    // so a first thread with a mistyped colour is refused rather than skipped.
    if (header) {
      header = false;
      if (row.length >= 3 && !HEX.test(row[2]) && /hex|colou?r|rgb/i.test(row[2])) continue;
    }
    if (row.length !== 3) return { error: `Line ${i + 1} has ${row.length} cells: each line is a number, a name and a colour.` };
    const [code, name, colour] = row;
    if (code === "") return { error: `Line ${i + 1} has no thread number.` };
    if (code.length > THREAD_CODE_MAX) return { error: `Line ${i + 1}: a thread number is at most ${THREAD_CODE_MAX} characters.` };
    const hex = colourOf(colour);
    if (!hex) return { error: `Line ${i + 1}: "${colour.slice(0, 20)}" is not a colour; write it as #rrggbb.` };
    threads.push([code, name, hex]);
  }
  return { threads, details: {} };
}

const csvCell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The threads as CSV, with a header, one thread a line. */
export function threadListCsv(threads: readonly ThreadRow[]): string {
  return ["number,name,hex", ...threads.map(([code, name, hex]) => [code, name, `#${hex}`].map(csvCell).join(","))].join("\n") + "\n";
}

/** The system as the JSON a download writes: its details and its threads, which `readThreadList` reads back. */
export function threadSystemJson(details: ThreadSystemDetails, threads: readonly ThreadRow[]): string {
  return `${JSON.stringify(
    {
      format: THREAD_SYSTEM_FORMAT,
      version: 1,
      name: details.label ?? "",
      ...(details.note ? { note: details.note } : {}),
      ...(details.source ? { source: details.source } : {}),
      ...(details.licence ? { licence: details.licence } : {}),
      threads: threads.map(([number, name, hex]) => ({ number, name, hex: `#${hex}` })),
    },
    null,
    1
  )}\n`;
}
