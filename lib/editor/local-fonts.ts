import type { TextFace } from "./text-raster";

/**
 * The fonts on the Owner's own computer (G-081): listed by the browser, read by the browser, drawn by the browser, and never
 * anywhere else. Nothing in this file makes a network request, and nothing in it writes a font name or a font file to storage;
 * `tests/unit/local-fonts.spec.ts` guards the first by reading this very file.
 *
 * Listing is the browser's Local Font Access API, `window.queryLocalFonts()`: Chrome and Edge, a permission prompt, a secure
 * context. Where it is missing, or the Owner says no, the list falls back to the generic families and the tab lets a font be
 * typed by name: the browser draws an installed font by its name without any permission.
 */

/** What `queryLocalFonts()` gives for one face (the parts used here). */
export interface FontDataLike {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob(): Promise<Blob>;
}

/** One face of a family, with the weight, slant and width read from its style name. */
export interface LocalFace {
  family: string;
  /** The face's own name, such as "Bold Italic". */
  style: string;
  fullName: string;
  postscriptName: string;
  weight: number;
  slant: "normal" | "italic";
  stretch: string;
  /** Reads the font file; absent for a face that is only a name (the fallback). */
  blob?: () => Promise<Blob>;
  /** A variable font's weight range ("400 700"), when the file holds more than this one weight. */
  variableWeight?: string;
}

export interface FontFamily {
  family: string;
  /** What the list shows when it is not the family's own name. */
  label?: string;
  /** For a bundled family, which list it belongs to. */
  group?: "pixel" | "outline";
  faces: LocalFace[];
}

export type FontListing =
  | { kind: "local"; families: FontFamily[] }
  | { kind: "fallback"; reason: "unsupported" | "denied" | "error"; message: string; families: FontFamily[] };

/** The generic families every browser has: drawn unquoted, so they name the browser's own choice. */
export const GENERIC_FAMILIES = ["sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui"] as const;

const WEIGHTS: Array<[RegExp, number]> = [
  [/\b(extra|ultra)[\s-]?black\b/i, 950],
  [/\b(black|heavy)\b/i, 900],
  [/\b(extra|ultra)[\s-]?bold\b/i, 800],
  [/\b(semi|demi)[\s-]?bold\b/i, 600],
  [/\bbold\b/i, 700],
  [/\bmedium\b/i, 500],
  [/\b(extra|ultra)[\s-]?light\b/i, 200],
  [/\bthin\b|\bhairline\b/i, 100],
  [/\blight\b/i, 300],
];

const STRETCHES: Array<[RegExp, string]> = [
  [/\bultra[\s-]?condensed\b/i, "ultra-condensed"],
  [/\bextra[\s-]?condensed\b/i, "extra-condensed"],
  [/\bsemi[\s-]?condensed\b/i, "semi-condensed"],
  [/\b(condensed|narrow|compressed)\b/i, "condensed"],
  [/\bsemi[\s-]?expanded\b/i, "semi-expanded"],
  [/\bultra[\s-]?expanded\b/i, "ultra-expanded"],
  [/\bextra[\s-]?expanded\b/i, "extra-expanded"],
  [/\b(expanded|extended|wide)\b/i, "expanded"],
];

/** The weight, slant and width a face's style name ("Semibold Italic", "Condensed Bold") stands for. */
export function parseFaceStyle(style: string): { weight: number; slant: "normal" | "italic"; stretch: string } {
  const weight = WEIGHTS.find(([pattern]) => pattern.test(style))?.[1] ?? 400;
  const slant = /\b(italic|oblique)\b/i.test(style) ? "italic" : "normal";
  const stretch = STRETCHES.find(([pattern]) => pattern.test(style))?.[1] ?? "normal";
  return { weight, slant, stretch };
}

/** The faces the browser listed, grouped by family: families A to Z, each family's faces from light to heavy, upright first. */
export function groupFaces(fonts: readonly FontDataLike[]): FontFamily[] {
  const byFamily = new Map<string, Map<string, LocalFace>>();
  for (const font of fonts) {
    if (!font.family) continue;
    const faces = byFamily.get(font.family) ?? new Map<string, LocalFace>();
    // One entry per face: a font listed twice (two folders) is one choice.
    const key = font.postscriptName || font.fullName || font.style;
    if (!faces.has(key)) {
      faces.set(key, {
        family: font.family,
        style: font.style,
        fullName: font.fullName,
        postscriptName: font.postscriptName,
        ...parseFaceStyle(font.style),
        blob: () => font.blob(),
      });
    }
    byFamily.set(font.family, faces);
  }
  return [...byFamily.entries()]
    .map(([family, faces]) => ({
      family,
      faces: [...faces.values()].sort(
        (a, b) => a.weight - b.weight || Number(a.slant === "italic") - Number(b.slant === "italic") || a.style.localeCompare(b.style)
      ),
    }))
    .sort((a, b) => a.family.localeCompare(b.family, undefined, { sensitivity: "base" }));
}

/** The four faces any family can be asked for by name: the browser fills in what a family lacks. */
function namedFaces(family: string): LocalFace[] {
  return [
    { style: "Regular", weight: 400, slant: "normal" as const },
    { style: "Bold", weight: 700, slant: "normal" as const },
    { style: "Italic", weight: 400, slant: "italic" as const },
    { style: "Bold Italic", weight: 700, slant: "italic" as const },
  ].map((face) => ({ family, fullName: `${family} ${face.style}`, postscriptName: "", stretch: "normal", ...face }));
}

/** The families that need no permission: the generic ones. A name typed in the tab is added by `familyByName`. */
export function fallbackFamilies(): FontFamily[] {
  return GENERIC_FAMILIES.map((family) => ({ family, faces: namedFaces(family) }));
}

/** A family the Owner typed: the browser draws it by name if it is installed, and a generic one if it is not. */
export function familyByName(name: string): FontFamily {
  const family = name.trim();
  return { family, faces: namedFaces(family) };
}

export interface FontSource {
  queryLocalFonts?: () => Promise<FontDataLike[]>;
}

/**
 * The fonts of this computer, or the fallback and why. Called from a press of a button, because the browser asks for its
 * permission then. A denial or a failure is an answer, not an error: the tab goes on with the fallback.
 */
export async function listFonts(
  source: FontSource = typeof window === "undefined" ? {} : (window as unknown as FontSource)
): Promise<FontListing> {
  if (typeof source.queryLocalFonts !== "function") {
    return {
      kind: "fallback",
      reason: "unsupported",
      message: "This browser cannot list the fonts on your computer. Type a font name, or use a generic family.",
      families: fallbackFamilies(),
    };
  }
  try {
    const families = groupFaces(await source.queryLocalFonts());
    if (families.length === 0) {
      return {
        kind: "fallback",
        reason: "error",
        message: "No fonts were found. Type a font name, or use a generic family.",
        families: fallbackFamilies(),
      };
    }
    return { kind: "local", families };
  } catch (error) {
    const denied = error instanceof Error && (error.name === "NotAllowedError" || error.name === "SecurityError");
    return {
      kind: "fallback",
      reason: denied ? "denied" : "error",
      message: denied
        ? "Access to your fonts was declined. Type a font name, or use a generic family."
        : "Your fonts could not be read. Type a font name, or use a generic family.",
      families: fallbackFamilies(),
    };
  }
}

/** The browser's own font loading, as far as this file uses it (a stand-in in tests). */
export interface FontLoader {
  create(family: string, data: ArrayBuffer, descriptors?: { weight: string }): { load(): Promise<unknown> };
  add(face: unknown): void;
}

function browserLoader(): FontLoader {
  return {
    create: (family, data, descriptors) => new FontFace(family, data, descriptors),
    add: (face) => document.fonts.add(face as FontFace),
  };
}

let nextPrivateName = 1;
const loaded = new Map<string, string>();

/**
 * The face to draw, ready: a face with a file is read, given to the browser under a private name for this visit only, and drawn
 * as that name at normal weight and slant (the file is already the right face). A face that is only a name is drawn by the name
 * with its own weight and slant, which the browser matches or imitates. Nothing is stored and nothing is sent.
 */
export async function loadFace(face: LocalFace, loader: FontLoader = browserLoader()): Promise<TextFace> {
  if (!face.blob) return { family: face.family, weight: face.weight, style: face.slant, stretch: face.stretch };
  const key = face.postscriptName || face.fullName;
  let name = loaded.get(key);
  if (!name) {
    name = `localface-${nextPrivateName++}`;
    const data = await (await face.blob()).arrayBuffer();
    const font = face.variableWeight ? loader.create(name, data, { weight: face.variableWeight }) : loader.create(name, data);
    await font.load();
    loader.add(font);
    loaded.set(key, name);
  }
  return { family: name, weight: face.variableWeight ? face.weight : 400, style: "normal", stretch: "normal" };
}
