import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_STITCH_TEXTURE, isStitchTextureId, STITCH_TEXTURES, stitchTextureById } from "@/lib/export/stitch-texture-catalog";

describe("stitch texture catalog", () => {
  it("has unique ids, and every texture's file is shipped in public/", () => {
    const ids = STITCH_TEXTURES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { url } of STITCH_TEXTURES) expect(existsSync(path.join(process.cwd(), "public", url))).toBe(true);
  });

  it("holds the default", () => {
    expect(isStitchTextureId(DEFAULT_STITCH_TEXTURE)).toBe(true);
  });

  it("recognises its ids and refuses anything else by name", () => {
    expect(isStitchTextureId("pixel")).toBe(true);
    expect(isStitchTextureId("lace")).toBe(false);
    expect(isStitchTextureId(undefined)).toBe(false);
    expect(() => stitchTextureById("lace" as never)).toThrow('Unknown stitch texture "lace"');
  });
});
