import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUEST_WORKSPACES, exportRefusal, generationRefusal, workspaceRefusal } from "../../lib/features/request-check";
import { isFeatureId } from "../../app/features/registry";
import { resolveFeatures } from "../../lib/features/resolve";

/** G-102 M2: the states resolve person > tier > site, and the server refuses a request for a feature not usable. */

describe("resolving a person's states", () => {
  it("lets the person win over the tier, the tier over the site, and keeps only what differs from on", () => {
    const states = resolveFeatures({
      site: { "tool.text": "locked", "tool.fill": "locked", "export.a4": "hidden", "tool.brush": "on" },
      tier: { "tool.text": "on", "tool.fill": "hidden" },
      person: { "tool.text": "hidden", "tool.line": "locked" },
    });
    expect(states).toEqual({ "tool.text": "hidden", "tool.fill": "hidden", "export.a4": "hidden", "tool.line": "locked" });
  });

  it("puts the set for guests or accounts between the site and the tier", () => {
    const states = resolveFeatures({
      site: { "tool.text": "locked", "tool.fill": "hidden" },
      audience: { "tool.text": "on", "tool.line": "locked", "tool.oval": "locked" },
      tier: { "tool.line": "on" },
    });
    // The audience lifts the site's lock on Text; the tier lifts the audience's lock on Line; Fill keeps the site's state.
    expect(states).toEqual({ "tool.fill": "hidden", "tool.oval": "locked" });
  });

  it("takes the site's alone for a visitor, and ignores a row for a feature that no longer exists", () => {
    expect(resolveFeatures({ site: { "tool.text": "locked", "tool.gone": "hidden" } }, isFeatureId)).toEqual({ "tool.text": "locked" });
    expect(resolveFeatures({ site: {} })).toEqual({});
  });
});

describe("the server's refusal", () => {
  const states = {
    "generation.vivid": "locked",
    "brand.cosmo": "hidden",
    "dither.lines": "locked",
    "export.a4": "hidden",
    "texture.stitch.pixel": "locked",
  } as const;

  it("refuses a generation that asks for a feature not usable, by its name, and lets one asking for nothing through", () => {
    expect(generationRefusal({ vivid: true }, states)).toBe("Vivid colour detail is not available to you.");
    expect(generationRefusal({ vivid: false }, states)).toBeNull();
    expect(generationRefusal({ paletteMode: "cosmo" }, states)).toBe("Cosmo is not available to you.");
    expect(generationRefusal({ paletteMode: "dmc" }, states)).toBeNull();
    expect(generationRefusal({ ditherMode: "lines-vertical" }, states)).toBe("Lines is not available to you.");
    expect(generationRefusal({ ditherMode: "bayer-4" }, states)).toBeNull();
    expect(generationRefusal({}, states)).toBeNull();
    // Dithering as a whole locked: every pattern but Off is refused, and the Off value passes.
    expect(generationRefusal({ ditherMode: "bayer-4" }, { "generation.ditherMode": "locked" })).toBe("Dithering is not available to you.");
    expect(generationRefusal({ ditherMode: "off" }, { "generation.ditherMode": "locked" })).toBeNull();
    // A sub-setting travels under its feature: the strokes' density is refused only with the strokes on.
    expect(generationRefusal({ textureStrokes: true, textureDensity: 0.4 }, { "generation.textureStrokes": "hidden" })).toBe(
      "Texture strokes is not available to you."
    );
    expect(generationRefusal({ textureStrokes: false, textureDensity: 0.4 }, { "generation.textureStrokes": "hidden" })).toBeNull();
  });

  it("refuses an export of a kind or with a texture not usable", () => {
    expect(exportRefusal({ kind: "a4-color" }, states)).toBe("A4 pages (ZIP) is not available to you.");
    expect(exportRefusal({ kind: "a4-bw" }, states)).toBe("A4 pages (ZIP) is not available to you.");
    expect(exportRefusal({ kind: "pdf-color" }, states)).toBeNull();
    expect(exportRefusal({ kind: "png-realistic", stitchTexture: "pixel" }, states)).toBe("Pixel stitch texture is not available to you.");
    expect(exportRefusal({ kind: "png-realistic", stitchTexture: "classic" }, states)).toBeNull();
    expect(exportRefusal({ kind: "all" }, { "export.all": "locked" })).toBe("Export all is not available to you.");
    expect(
      exportRefusal({ kind: "png-realistic", canvas: { color: "#ffffff", texture: "natural" } }, { "texture.canvas.natural": "hidden" })
    ).toBe("Natural linen cloth is not available to you.");
  });
});

describe("a workspace's requests (G-103, D314)", () => {
  const API = path.join(__dirname, "..", "..", "app", "api");
  const routes = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? routes(full) : name === "route.ts" ? [full] : [];
    });
  const address = (file: string) => "/" + path.relative(path.join(API, ".."), path.dirname(file)).split(path.sep).join("/");

  it("generating, the recommendation, a drawn pattern's preview and the photo are Photo's; an export is Export's", () => {
    expect(REQUEST_WORKSPACES).toEqual({
      "/api/jobs": "photo",
      "/api/predictions": "photo",
      "/api/dither-previews": "photo",
      "/api/photos": "photo",
      "/api/exports": "export",
    });
  });

  it("is refused by the workspace's name, Hidden or Locked alike, and served with it On", () => {
    for (const state of ["hidden", "locked"] as const) {
      expect(workspaceRefusal("/api/jobs", { "workspace.photo": state })).toBe("Photo is not available to you.");
      expect(workspaceRefusal("/api/photos", { "workspace.photo": state })).toBe("Photo is not available to you.");
      expect(workspaceRefusal("/api/predictions", { "workspace.photo": state })).toBe("Photo is not available to you.");
      expect(workspaceRefusal("/api/dither-previews", { "workspace.photo": state })).toBe("Photo is not available to you.");
      expect(workspaceRefusal("/api/exports", { "workspace.export": state })).toBe("Export is not available to you.");
    }
    expect(workspaceRefusal("/api/jobs", { "workspace.edit": "hidden", "workspace.export": "hidden" })).toBeNull();
    expect(workspaceRefusal("/api/exports", { "workspace.photo": "locked" })).toBeNull();
  });

  it("every route that starts work on the processor is in the list, and each one in it asks under its own address", () => {
    // A job's own routes (its status, events, result) follow a job and start none; the rest that reach the processor start work.
    const starting = routes(API).filter((file) => readFileSync(file, "utf8").includes("processorUrl(") && !file.includes("[id]"));
    expect(starting.map(address).sort()).toEqual(Object.keys(REQUEST_WORKSPACES).sort());
    for (const file of starting) expect(readFileSync(file, "utf8"), address(file)).toContain(`workspaceRefusal("${address(file)}"`);
  });
});
