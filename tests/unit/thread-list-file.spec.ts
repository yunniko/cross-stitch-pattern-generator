import { describe, expect, it } from "vitest";
import { readThreadList, THREAD_SYSTEM_FORMAT, threadListCsv, threadSystemJson } from "@/lib/thread-systems/thread-list-file";
import { MAX_THREADS, systemDetails, systemKeyRefusal, type ThreadRow } from "@/lib/thread-systems/thread-system";
import { requestSystems } from "./helpers/thread-systems";

/** A thread system as a file (G-132 M3, D401): what the admin's page and a person's upload read, and what they download. */

const threads = (read: ReturnType<typeof readThreadList>) => {
  if ("error" in read) throw new Error(read.error);
  return read.threads;
};

describe("reading a CSV list", () => {
  it("reads number, name and colour a line, with or without a header, in any case of hex", () => {
    expect(threads(readThreadList("number,name,hex\n310,Black,#000000\n321,Red,C72B3B\n"))).toEqual([
      ["310", "Black", "000000"],
      ["321", "Red", "c72b3b"],
    ]);
    expect(threads(readThreadList("310,Black,#000000"))).toEqual([["310", "Black", "000000"]]);
  });

  it("reads semicolons and tabs, quoted cells, a byte-order mark, Windows line ends and blank lines", () => {
    expect(threads(readThreadList('﻿code;name;colour\r\n310;"Black; deep";#000000\r\n\r\n'))).toEqual([["310", "Black; deep", "000000"]]);
    expect(threads(readThreadList('310\t"Say ""hi"""\t#010203'))).toEqual([["310", 'Say "hi"', "010203"]]);
  });

  it("allows an empty name, as Cosmo and Anchor have", () => {
    expect(threads(readThreadList("600,,#101113"))).toEqual([["600", "", "101113"]]);
  });

  it("says which line is wrong", () => {
    expect(readThreadList("310,Black,#000000\n321,Red")).toEqual({
      error: "Line 2 has 2 cells: each line is a number, a name and a colour.",
    });
    expect(readThreadList("310,Black,#000000\n,Red,#ff0000")).toEqual({ error: "Line 2 has no thread number." });
    expect(readThreadList("310,Black,black")).toEqual({ error: 'Line 1: "black" is not a colour; write it as #rrggbb.' });
    // A first line that is a thread with a mistyped colour is refused, not taken for a header.
    expect(readThreadList("310,Black,#00000")).toMatchObject({ error: expect.stringMatching(/^Line 1/) });
  });

  it("refuses an empty file, a list without threads, a number twice, and more threads than allowed", () => {
    expect(readThreadList("  \n")).toEqual({ error: "The file is empty." });
    expect(readThreadList("number,name,hex\n")).toEqual({ error: `A thread system lists between 1 and ${MAX_THREADS} threads.` });
    expect(readThreadList("310,Black,#000000\n310,Again,#000001")).toEqual({ error: "Thread 310 is listed twice." });
    const many = Array.from({ length: MAX_THREADS + 1 }, (_, i) => `${i},,#000000`).join("\n");
    expect(readThreadList(many)).toEqual({ error: `A thread system lists between 1 and ${MAX_THREADS} threads.` });
  });
});

describe("reading a JSON list", () => {
  it("reads a list of rows, of objects, or an object with its threads and details", () => {
    expect(threads(readThreadList('[["310","Black","#000000"]]'))).toEqual([["310", "Black", "000000"]]);
    expect(threads(readThreadList('[{"code":310,"name":"Black","rgb":[0,0,16]}]'))).toEqual([["310", "Black", "000010"]]);
    expect(readThreadList('{"name":"Kreinik","licence":"CC0","threads":[{"number":"001","hex":"#c0c0c0"}]}')).toEqual({
      threads: [["001", "", "c0c0c0"]],
      details: { label: "Kreinik", licence: "CC0" },
    });
  });

  it("says which thread is wrong", () => {
    expect(readThreadList("{")).toEqual({ error: "The file is not valid JSON." });
    expect(readThreadList('{"threads":3}')).toMatchObject({ error: expect.stringMatching(/^A JSON file is a list/) });
    expect(readThreadList('[{"name":"Black","hex":"#000000"}]')).toEqual({ error: "Thread 1 has no number." });
    expect(readThreadList('[{"number":"310","hex":"#0000"}]')).toEqual({ error: 'Thread 310 has no colour: give it as "#rrggbb".' });
    expect(readThreadList('[{"number":"310","name":5,"hex":"#000000"}]')).toEqual({ error: "The name of thread 310 is not text." });
  });
});

describe("downloading", () => {
  const rows: ThreadRow[] = [
    ["310", "Black", "000000"],
    ["B5200", 'Snow, "bright" white', "ffffff"],
  ];

  it("writes CSV and JSON that read back unchanged", () => {
    expect(threadListCsv(rows)).toBe('number,name,hex\n310,Black,#000000\nB5200,"Snow, ""bright"" white",#ffffff\n');
    expect(threads(readThreadList(threadListCsv(rows)))).toEqual(rows);
    const json = threadSystemJson({ label: "DMC", note: "Measured." }, rows);
    expect(JSON.parse(json)).toMatchObject({ format: THREAD_SYSTEM_FORMAT, version: 1, name: "DMC", note: "Measured." });
    expect(readThreadList(json)).toEqual({ threads: rows, details: { label: "DMC", note: "Measured." } });
  });

  it("round-trips every seeded system", () => {
    for (const { key, threads: seeded } of requestSystems()) {
      expect(threads(readThreadList(threadListCsv(seeded))), key).toEqual(seeded);
      expect(threads(readThreadList(threadSystemJson({ label: key }, seeded))), key).toEqual(seeded);
    }
  });
});

describe("a system's key and details", () => {
  it("takes a short lower-case key that is not full", () => {
    for (const key of ["dmc", "kreinik-metallic", "a1"]) expect(systemKeyRefusal(key), key).toBeNull();
    for (const key of ["", "DMC", "-dmc", "full", "dm c", "x".repeat(31), 7]) expect(systemKeyRefusal(key), String(key)).not.toBeNull();
  });

  it("trims the details, keeps an empty optional one as none, and refuses a name too long or missing", () => {
    expect(systemDetails({ label: " Kreinik ", note: "  ", source: "kreinik.com" })).toEqual({
      label: "Kreinik",
      note: null,
      source: "kreinik.com",
      licence: null,
    });
    expect(systemDetails({ label: "" })).toEqual({ error: "A name is 1 to 40 characters." });
    expect(systemDetails({ label: "x".repeat(41) })).toEqual({ error: "A name is 1 to 40 characters." });
    expect(systemDetails({ label: "K", licence: "x".repeat(501) })).toEqual({ error: "The licence is longer than 500 characters." });
  });
});
