import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  familyByName,
  fallbackFamilies,
  GENERIC_FAMILIES,
  groupFaces,
  listFonts,
  loadFace,
  parseFaceStyle,
  type FontDataLike,
  type FontLoader,
} from "@/lib/editor/local-fonts";

/**
 * G-081 M2: the Owner's fonts. The browser's listing is replaced by a stand-in, so the grouping, the fallbacks and the loading
 * are tested on every machine, whatever fonts it has.
 */

const font = (family: string, style: string, postscriptName = `${family}-${style}`.replace(/\s/g, "")): FontDataLike => ({
  family,
  fullName: `${family} ${style}`,
  postscriptName,
  style,
  blob: async () => new Blob([`bytes of ${postscriptName}`]),
});

describe("parseFaceStyle", () => {
  it("reads the weight, the slant and the width out of a style name", () => {
    expect(parseFaceStyle("Regular")).toEqual({ weight: 400, slant: "normal", stretch: "normal" });
    expect(parseFaceStyle("Bold")).toEqual({ weight: 700, slant: "normal", stretch: "normal" });
    expect(parseFaceStyle("Bold Italic")).toEqual({ weight: 700, slant: "italic", stretch: "normal" });
    expect(parseFaceStyle("Light Oblique")).toEqual({ weight: 300, slant: "italic", stretch: "normal" });
    expect(parseFaceStyle("Condensed Bold")).toEqual({ weight: 700, slant: "normal", stretch: "condensed" });
    expect(parseFaceStyle("Semibold")).toMatchObject({ weight: 600 });
    expect(parseFaceStyle("ExtraBold")).toMatchObject({ weight: 800 });
    expect(parseFaceStyle("Black")).toMatchObject({ weight: 900 });
    expect(parseFaceStyle("Thin")).toMatchObject({ weight: 100 });
    expect(parseFaceStyle("Narrow")).toMatchObject({ stretch: "condensed" });
    expect(parseFaceStyle("SemiCondensed")).toMatchObject({ stretch: "semi-condensed" });
    expect(parseFaceStyle("Extended")).toMatchObject({ stretch: "expanded" });
    expect(parseFaceStyle("Something Unheard Of")).toEqual({ weight: 400, slant: "normal", stretch: "normal" });
  });
});

describe("groupFaces", () => {
  const listed = [
    font("Verdana", "Bold"),
    font("Arial", "Bold Italic"),
    font("Arial", "Regular"),
    font("Arial", "Bold"),
    font("arial narrow", "Regular"),
    font("Arial", "Italic"),
    font("Arial", "Regular"), // the same face listed twice (two folders)
    font("", "Regular"),
  ];

  it("makes a family of each name, A to Z, ignoring case", () => {
    expect(groupFaces(listed).map((f) => f.family)).toEqual(["Arial", "arial narrow", "Verdana"]);
  });

  it("lists a family's faces from light to heavy, upright before slanted, each once", () => {
    const arial = groupFaces(listed).find((f) => f.family === "Arial")!;
    expect(arial.faces.map((f) => f.style)).toEqual(["Regular", "Italic", "Bold", "Bold Italic"]);
    expect(arial.faces.map((f) => [f.weight, f.slant])).toEqual([
      [400, "normal"],
      [400, "italic"],
      [700, "normal"],
      [700, "italic"],
    ]);
  });

  it("gives every face a way to read its file", async () => {
    const [face] = groupFaces([font("Arial", "Regular")])[0].faces;
    expect(await (await face.blob!()).text()).toBe("bytes of Arial-Regular");
  });
});

describe("listFonts", () => {
  it("lists the computer's fonts when the browser can", async () => {
    const listing = await listFonts({ queryLocalFonts: async () => [font("Arial", "Regular"), font("Arial", "Bold")] });
    expect(listing.kind).toBe("local");
    expect(listing.families.map((f) => f.family)).toEqual(["Arial"]);
  });

  it("falls back to the generic families, and says why, where the browser cannot list fonts", async () => {
    const listing = await listFonts({});
    expect(listing).toMatchObject({ kind: "fallback", reason: "unsupported" });
    expect(listing.families.map((f) => f.family)).toEqual([...GENERIC_FAMILIES]);
    expect(listing.kind === "fallback" && listing.message).toMatch(/Type a font name/);
  });

  it("treats a refusal as an answer: the fallback, marked as declined", async () => {
    const denied = Object.assign(new Error("no"), { name: "NotAllowedError" });
    const listing = await listFonts({ queryLocalFonts: async () => Promise.reject(denied) });
    expect(listing).toMatchObject({ kind: "fallback", reason: "denied" });
    expect(listing.kind === "fallback" && listing.message).toMatch(/declined/);
  });

  it("falls back, marked as an error, when the listing fails or finds nothing", async () => {
    expect(await listFonts({ queryLocalFonts: async () => Promise.reject(new Error("boom")) })).toMatchObject({
      kind: "fallback",
      reason: "error",
    });
    expect(await listFonts({ queryLocalFonts: async () => [] })).toMatchObject({ kind: "fallback", reason: "error" });
  });
});

describe("the faces that need no permission", () => {
  it("offers regular, bold, italic and bold italic of each generic family", () => {
    const sans = fallbackFamilies().find((f) => f.family === "sans-serif")!;
    expect(sans.faces.map((f) => f.style)).toEqual(["Regular", "Bold", "Italic", "Bold Italic"]);
    expect(sans.faces.every((f) => f.blob === undefined)).toBe(true);
  });

  it("makes a family of a name that was typed", () => {
    expect(familyByName("  Comic Sans MS ").family).toBe("Comic Sans MS");
    expect(familyByName("X").faces).toHaveLength(4);
  });
});

describe("loadFace", () => {
  function loader() {
    const created: Array<{ family: string; data: ArrayBuffer }> = [];
    const added: unknown[] = [];
    const impl: FontLoader = {
      create: (family, data) => {
        created.push({ family, data });
        return { load: async () => undefined };
      },
      add: (face) => added.push(face),
    };
    return { impl, created, added };
  }

  it("reads the face's file, gives it to the browser under a private name, and draws it as that name at normal weight", async () => {
    const { impl, created, added } = loader();
    const [face] = groupFaces([font("Arial", "Bold Italic", "Arial-BoldItalic-A")])[0].faces;
    const drawn = await loadFace(face, impl);
    expect(drawn.family).toMatch(/^localface-\d+$/);
    expect(drawn).toMatchObject({ weight: 400, style: "normal", stretch: "normal" });
    expect(created).toHaveLength(1);
    expect(new TextDecoder().decode(created[0].data)).toBe("bytes of Arial-BoldItalic-A");
    expect(added).toHaveLength(1);
  });

  it("loads a face once, however often it is asked for", async () => {
    const { impl, created } = loader();
    const [face] = groupFaces([font("Georgia", "Regular", "Georgia-Regular-B")])[0].faces;
    const first = await loadFace(face, impl);
    const second = await loadFace(face, impl);
    expect(second.family).toBe(first.family);
    expect(created).toHaveLength(1);
  });

  it("draws a face that is only a name by that name, with its own weight and slant", async () => {
    const { impl, created } = loader();
    const bold = fallbackFamilies()[0].faces.find((f) => f.style === "Bold Italic")!;
    expect(await loadFace(bold, impl)).toEqual({ family: "sans-serif", weight: 700, style: "italic", stretch: "normal" });
    expect(created).toHaveLength(0);
  });
});

describe("what the file does not do", () => {
  const source = readFileSync(path.join(process.cwd(), "lib", "editor", "local-fonts.ts"), "utf8");

  it("makes no network request and keeps nothing in storage: fonts stay on the computer (G-081)", () => {
    for (const forbidden of [
      "fetch(",
      "XMLHttpRequest",
      "sendBeacon",
      "WebSocket",
      "EventSource",
      "localStorage",
      "sessionStorage",
      "indexedDB",
    ]) {
      expect(source.includes(forbidden), forbidden).toBe(false);
    }
    const loaded = vi.fn();
    expect(loaded).not.toHaveBeenCalled();
  });
});
