import type { FontFamily, LocalFace } from "./local-fonts";

/**
 * The fonts that ship with the app (G-081 M6): a short list chosen for stitching, served from this site's own `public/fonts/bundled/`
 * so that picking one asks nobody else for anything, and so that it works in browsers that cannot list the fonts on a computer.
 * Every one is under the SIL Open Font License 1.1, which allows bundling and use in a product; each folder carries its own
 * `OFL.txt` and `public/fonts/bundled/LICENSES.md` records where each came from. None is modified or renamed.
 *
 * A bundled family is told apart from a family of the same name on the computer by the `bundled:` prefix on its id, which is what
 * the workspace stores as the chosen family.
 */

export const BUNDLED_PREFIX = "bundled:";

export interface BundledFont {
  /** The name shown, and the family's own name. */
  family: string;
  /** Folder under `public/fonts/bundled/`. */
  dir: string;
  /** "pixel": drawn on a grid of its own, so it reads at the small sizes where outline fonts fall apart. */
  kind: "pixel" | "outline";
  faces: Array<{ style: string; weight: number; file: string; variableWeight?: string }>;
  /**
   * For a pixel font drawn with its own grid, the size step at which it comes out as clean whole stitches: sizes that are
   * multiples of it put straight strokes exactly on stitches (round letters keep one soft corner, which Weight decides).
   */
  crispStep?: number;
}

export const BUNDLED_FONTS: readonly BundledFont[] = [
  {
    family: "Silkscreen",
    dir: "silkscreen",
    kind: "pixel",
    crispStep: 8,
    faces: [
      { style: "Regular", weight: 400, file: "Silkscreen-Regular.ttf" },
      { style: "Bold", weight: 700, file: "Silkscreen-Bold.ttf" },
    ],
  },
  {
    family: "Press Start 2P",
    dir: "press-start-2p",
    kind: "pixel",
    crispStep: 8,
    faces: [{ style: "Regular", weight: 400, file: "PressStart2P-Regular.ttf" }],
  },
  { family: "Tiny5", dir: "tiny5", kind: "pixel", crispStep: 8, faces: [{ style: "Regular", weight: 400, file: "Tiny5-Regular.ttf" }] },
  {
    family: "Pixelify Sans",
    dir: "pixelify-sans",
    kind: "pixel",
    faces: [
      { style: "Regular", weight: 400, file: "PixelifySans.ttf", variableWeight: "400 700" },
      { style: "Bold", weight: 700, file: "PixelifySans.ttf", variableWeight: "400 700" },
    ],
  },
  { family: "Jersey 10", dir: "jersey-10", kind: "pixel", faces: [{ style: "Regular", weight: 400, file: "Jersey10-Regular.ttf" }] },
  { family: "VT323", dir: "vt323", kind: "pixel", faces: [{ style: "Regular", weight: 400, file: "VT323-Regular.ttf" }] },
  {
    family: "Lora",
    dir: "lora",
    kind: "outline",
    faces: [
      { style: "Regular", weight: 400, file: "Lora.ttf", variableWeight: "400 700" },
      { style: "Bold", weight: 700, file: "Lora.ttf", variableWeight: "400 700" },
    ],
  },
  {
    family: "Oswald",
    dir: "oswald",
    kind: "outline",
    faces: [
      { style: "Light", weight: 300, file: "Oswald.ttf", variableWeight: "200 700" },
      { style: "Regular", weight: 400, file: "Oswald.ttf", variableWeight: "200 700" },
      { style: "Bold", weight: 700, file: "Oswald.ttf", variableWeight: "200 700" },
    ],
  },
  {
    family: "Playfair Display",
    dir: "playfair-display",
    kind: "outline",
    faces: [
      { style: "Regular", weight: 400, file: "PlayfairDisplay.ttf", variableWeight: "400 900" },
      { style: "Bold", weight: 700, file: "PlayfairDisplay.ttf", variableWeight: "400 900" },
    ],
  },
  {
    family: "Caveat",
    dir: "caveat",
    kind: "outline",
    faces: [
      { style: "Regular", weight: 400, file: "Caveat.ttf", variableWeight: "400 700" },
      { style: "Bold", weight: 700, file: "Caveat.ttf", variableWeight: "400 700" },
    ],
  },
  { family: "Pacifico", dir: "pacifico", kind: "outline", faces: [{ style: "Regular", weight: 400, file: "Pacifico-Regular.ttf" }] },
];

export const bundledId = (family: string): string => `${BUNDLED_PREFIX}${family}`;
export const isBundledId = (id: string): boolean => id.startsWith(BUNDLED_PREFIX);

/** This site's own copy of a bundled font file: a plain same-origin GET, nothing about the text or the choice in it. */
export function bundledUrl(font: BundledFont, file: string): string {
  return `/fonts/bundled/${font.dir}/${file}`;
}

/** The bundled fonts as families the Font list can show, their faces reading their files from this site. */
export function bundledFamilies(fetcher: (url: string) => Promise<Blob> = fetchBlob): FontFamily[] {
  return BUNDLED_FONTS.map((font) => ({
    family: bundledId(font.family),
    label: font.family,
    faces: font.faces.map((face): LocalFace => ({
      family: bundledId(font.family),
      style: face.style,
      fullName: `${font.family} ${face.style}`,
      postscriptName: `${BUNDLED_PREFIX}${font.family}:${face.style}`,
      weight: face.weight,
      slant: "normal",
      stretch: "normal",
      blob: () => fetcher(bundledUrl(font, face.file)),
      ...(face.variableWeight ? { variableWeight: face.variableWeight } : {}),
    })),
  }));
}

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The font file could not be loaded (${response.status}).`);
  return response.blob();
}

/** The bundled font a stored family id names, if it is one. */
export function bundledFont(id: string): BundledFont | undefined {
  return BUNDLED_FONTS.find((font) => bundledId(font.family) === id);
}

/**
 * What to tell the stitcher about a bundled pixel font at a size: it is cleanest at a multiple of its own grid, so a size that is
 * not one gets the nearest that is. Null when the font has no such grid or the size already is one.
 */
export function pixelSizeHint(font: BundledFont | undefined, size: number): { clean: number[] } | null {
  if (!font?.crispStep) return null;
  const step = font.crispStep;
  if (size % step === 0) return null;
  const below = Math.floor(size / step) * step;
  const above = below + step;
  return { clean: below >= 7 ? [below, above] : [above] };
}
