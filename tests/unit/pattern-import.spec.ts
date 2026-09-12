import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { loadPatternFromFile } from "@/lib/pattern-import";
import { serializePattern } from "@/lib/pattern-serialize";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";

/**
 * G-027 (Owner request, 2026-09-12): "Open pattern" now accepts a plain
 * .json file (the original format) OR a .cspzip/.zip export-all bundle,
 * searching inside the archive for a valid pattern rather than requiring
 * the file to already be unzipped. Detection is by content, never file
 * name/extension -- these tests deliberately use filenames that don't
 * match the real format to prove that.
 */

function makePattern(): StitchPattern {
  const colors: RGB[] = [
    [10, 20, 30],
    [200, 210, 220],
  ];
  const cellPalette = [0, 1, 1, 0];
  const counts = [0, 0];
  for (const i of cellPalette) counts[i]++;
  const palette: PaletteColor[] = colors.map((rgb, i) => ({ index: i, rgb, symbol: String(i), name: `Color ${i}`, count: counts[i] }));
  return { width: 2, height: 2, cellPalette: Uint8Array.from(cellPalette), palette, isLandscape: false };
}

function makeFile(name: string, content: string | Uint8Array, type = "application/octet-stream"): File {
  return new File([content as BlobPart], name, { type });
}

async function makeZipFile(name: string, entries: Record<string, string>): Promise<File> {
  const zip = new JSZip();
  for (const [entryName, content] of Object.entries(entries)) zip.file(entryName, content);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return makeFile(name, bytes, "application/zip");
}

describe("loadPatternFromFile", () => {
  it("imports a plain .json file directly, exactly like the original format", async () => {
    const pattern = makePattern();
    const file = makeFile("mypattern.json", serializePattern(pattern), "application/json");
    const loaded = await loadPatternFromFile(file);
    expect(loaded.width).toBe(2);
    expect(loaded.palette.map((c) => c.rgb)).toEqual([
      [10, 20, 30],
      [200, 210, 220],
    ]);
  });

  it("finds and imports a valid pattern .json inside a .cspzip bundle", async () => {
    const pattern = makePattern();
    const file = await makeZipFile("mybundle.cspzip", {
      "mypattern_editable.json": serializePattern(pattern),
      "mypattern_color.png": "not a real png, doesn't matter for this test",
    });
    const loaded = await loadPatternFromFile(file);
    expect(loaded.width).toBe(2);
  });

  it("detects a zip by content, not by its file extension", async () => {
    const pattern = makePattern();
    // Deliberately named .json even though its actual bytes are a zip archive.
    const file = await makeZipFile("actually_a_zip.json", { "pattern.json": serializePattern(pattern) });
    const loaded = await loadPatternFromFile(file);
    expect(loaded.width).toBe(2);
  });

  it("searches multiple .json entries, skipping invalid ones to find a valid pattern", async () => {
    const pattern = makePattern();
    const file = await makeZipFile("bundle.zip", {
      "not-a-pattern.json": JSON.stringify({ hello: "world" }),
      "the-real-one.json": serializePattern(pattern),
    });
    const loaded = await loadPatternFromFile(file);
    expect(loaded.width).toBe(2);
  });

  it("throws a clear error when a zip has no valid pattern .json inside it", async () => {
    const file = await makeZipFile("empty.cspzip", { "readme.txt": "no pattern here" });
    await expect(loadPatternFromFile(file)).rejects.toThrow("No valid pattern (.json) file was found inside that archive.");
  });

  it("throws when the file is neither a valid zip nor valid pattern JSON", async () => {
    const file = makeFile("garbage.json", "this is not json at all {{{");
    await expect(loadPatternFromFile(file)).rejects.toThrow();
  });
});
