import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { zipEntryName } from "@/lib/export/a4-export";

describe("zipEntryName (G-035 M2 review)", () => {
  it("leaves ordinary page names unchanged", () => {
    expect(zipEntryName("sample_r01_c02.png")).toBe("sample_r01_c02.png");
    expect(zipEntryName("My pattern_legend_extended_02.png")).toBe("My pattern_legend_extended_02.png");
  });

  it("resolves dot segments the way JSZip does when it loads an archive", () => {
    expect(zipEntryName("../cat_r01_c01.png")).toBe("cat_r01_c01.png");
    expect(zipEntryName("a/./b/../c_legend.png")).toBe("a/c_legend.png");
  });

  it("keeps color and B&W pages distinct inside an Export all bundle for a name like ../cat", async () => {
    const bundle = new JSZip();
    bundle.folder("A4_color")!.file(zipEntryName("../cat_r01_c01.png"), "color");
    bundle.folder("A4_bw")!.file(zipEntryName("../cat_r01_c01.png"), "bw");
    const loaded = await JSZip.loadAsync(await bundle.generateAsync({ type: "uint8array" }));
    expect(await loaded.file("A4_color/cat_r01_c01.png")!.async("string")).toBe("color");
    expect(await loaded.file("A4_bw/cat_r01_c01.png")!.async("string")).toBe("bw");
  });
});
