import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { withEditableEntry } from "@/lib/export/bundle-editable";

/** G-130 M4: Export all's editable entry replaced by the layered save, every other entry kept byte for byte (D393). */

const PNG = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) % 256);

async function bundle(): Promise<Blob> {
  const zip = new JSZip();
  zip.file("chart_editable.json", '{"flat":true}');
  zip.file("chart_color.png", PNG);
  zip.file("A4_color/page_01.png", PNG.slice(0, 50));
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

describe("Export all's editable entry for a chart of layers", () => {
  it("is replaced, and every other entry is kept as it was, in its order", async () => {
    const replaced = await withEditableEntry(await bundle(), "chart", '{"layers":[]}');
    const zip = await JSZip.loadAsync(await replaced.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(["chart_editable.json", "chart_color.png", "A4_color/", "A4_color/page_01.png"]);
    expect(await zip.file("chart_editable.json")!.async("string")).toBe('{"layers":[]}');
    expect(await zip.file("chart_color.png")!.async("uint8array")).toEqual(PNG);
    expect(await zip.file("A4_color/page_01.png")!.async("uint8array")).toEqual(PNG.slice(0, 50));
    expect(replaced.type).toBe("application/zip");
  });

  it("is refused by name when the bundle has none under the chart's name", async () => {
    await expect(withEditableEntry(await bundle(), "other", "{}")).rejects.toThrow("The export bundle has no other_editable.json");
  });
});
