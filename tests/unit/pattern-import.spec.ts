import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { serializeOxs } from "@/lib/editor/oxs";
import { loadPatternFromFile } from "@/lib/editor/pattern-import";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";

/**
 * G-027 (Owner request, 2026-09-12): "Open pattern" accepts a plain .json file OR a .cspzip/.zip export-all bundle,
 * searching inside the archive for a valid pattern. G-028 adds .oxs charts, on their own or inside an archive. Detection
 * is by content, never file name/extension -- these tests deliberately use filenames that don't match the real format.
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
    expect(loaded.format).toBe("json");
    expect(loaded.oxsReport).toBeUndefined();
    expect(loaded.pattern.width).toBe(2);
    expect(loaded.pattern.palette.map((c) => c.rgb)).toEqual([
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
    expect(loaded.format).toBe("zip");
    expect(loaded.pattern.width).toBe(2);
  });

  it("detects a zip by content, not by its file extension", async () => {
    const pattern = makePattern();
    // Deliberately named .json even though its actual bytes are a zip archive.
    const file = await makeZipFile("actually_a_zip.json", { "pattern.json": serializePattern(pattern) });
    expect((await loadPatternFromFile(file)).pattern.width).toBe(2);
  });

  it("searches multiple .json entries, skipping invalid ones to find a valid pattern", async () => {
    const pattern = makePattern();
    const file = await makeZipFile("bundle.zip", {
      "not-a-pattern.json": JSON.stringify({ hello: "world" }),
      "the-real-one.json": serializePattern(pattern),
    });
    expect((await loadPatternFromFile(file)).pattern.width).toBe(2);
  });

  it("throws a clear error when a zip has no valid pattern inside it", async () => {
    const file = await makeZipFile("empty.cspzip", { "readme.txt": "no pattern here" });
    await expect(loadPatternFromFile(file)).rejects.toThrow("No valid pattern (.json or .oxs) file was found inside that archive.");
  });

  it("throws when the file is neither a valid zip, an OXS chart nor valid pattern JSON", async () => {
    const file = makeFile("garbage.json", "this is not json at all {{{");
    await expect(loadPatternFromFile(file)).rejects.toThrow();
  });

  it("opens an OXS chart by content, whatever its name, with the import report", async () => {
    const file = makeFile("chart-from-another-app.txt", serializeOxs({ ...makePattern(), name: "From elsewhere" }));
    const loaded = await loadPatternFromFile(file);
    expect(loaded.format).toBe("oxs");
    expect(loaded.pattern.name).toBe("From elsewhere");
    expect(Array.from(loaded.pattern.cellPalette)).toEqual([0, 1, 1, 0]);
    expect(loaded.oxsReport?.approximatedPartStitches).toBe(0);
  });

  it("opens an archive holding only an .oxs chart, but prefers this app's lossless .json when both are present", async () => {
    const pattern = makePattern();
    const oxsOnly = await makeZipFile("bundle.zip", { "chart.oxs": serializeOxs(pattern) });
    expect((await loadPatternFromFile(oxsOnly)).format).toBe("oxs");

    const both = await makeZipFile("bundle.cspzip", {
      "chart.oxs": serializeOxs({ ...pattern, name: "oxs copy" }),
      "chart_editable.json": serializePattern({ ...pattern, name: "json copy" }),
    });
    const loaded = await loadPatternFromFile(both);
    expect(loaded.format).toBe("zip");
    expect(loaded.pattern.name).toBe("json copy");
  });

  it("refuses an OXS file over the size limit before reading it, and reports a broken OXS entry's own error", async () => {
    const text = serializeOxs(makePattern());
    await expect(loadPatternFromFile(makeFile("big.oxs", text), { maxOxsBytes: 100 })).rejects.toThrow(
      "larger than the 1 KB this app can open"
    );
    const broken = await makeZipFile("bundle.zip", { "chart.oxs": "<chart><palette></chart>" });
    await expect(loadPatternFromFile(broken)).rejects.toThrow("couldn't be read");
  });
});
