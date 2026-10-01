import type { FontFamily, LocalFace } from "./local-fonts";

/**
 * The fonts that ship with the app (G-081 M6): a list chosen for stitching, served from this site's own `public/fonts/bundled/`
 * so that picking one asks nobody else for anything, and so that it works in browsers that cannot list the fonts on a computer.
 * Each is under a licence that allows bundling (SIL OFL 1.1, CC0, or a public-domain dedication); each folder carries its licence
 * text or note, and `public/fonts/bundled/LICENSES.md` records where each came from. None is modified or renamed.
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
  /** The licence, as the font's own notice or its publisher states it. */
  licence: "OFL-1.1" | "CC0-1.0" | "Public domain (publisher's statement)";
  /** The licence text or note kept beside the font, in `dir`. */
  licenceFile: string;
  faces: Array<{ style: string; weight: number; file: string; variableWeight?: string }>;
  /**
   * For a pixel font, the sizes (stitches, 7 to 64) at which its straight strokes land exactly on whole stitches: measured by
   * drawing it at every size and counting half-covered pixels (docs/reviews/2026-10-01-bundled-font-licences.md). Round letters
   * may keep one soft corner, which Weight decides. Absent where the font has no such size.
   */
  crispSizes?: number[];
}

/** The multiples of `step` from 7 to 64. */
const multiples = (step: number): number[] => Array.from({ length: Math.floor(64 / step) }, (_, i) => (i + 1) * step).filter((s) => s >= 7);

const one = (style: string, weight: number, file: string) => ({ style, weight, file });
const variable = (style: string, weight: number, file: string, range: string) => ({ style, weight, file, variableWeight: range });
const OFL = "OFL-1.1" as const;
const PUBLIC = "Public domain (publisher's statement)" as const;
const NB = "nb-pixel-font-bundle";
const nb = (family: string, file: string): BundledFont => ({
  family,
  dir: NB,
  kind: "pixel",
  licence: PUBLIC,
  licenceFile: "README-from-the-bundle.md",
  crispSizes: multiples(16),
  faces: [one("Regular", 400, file)],
});

export const BUNDLED_FONTS: readonly BundledFont[] = [
  // Pixel fonts, A to Z.
  nb("Atari Games", "atarigames.ttf"),
  nb("Awex", "awexbmp.ttf"),
  nb("Beanstalk", "beanstalk.ttf"),
  nb("Bitfantasy", "bitfantasy.ttf"),
  nb("Celtic Time", "celtictime.ttf"),
  nb("Karen Fat", "karenfat.ttf"),
  nb("Kubasta", "kubasta.ttf"),
  nb("LCD Block", "lcdblock.ttf"),
  nb("Rockbox Condensed", "rockboxcond12.ttf"),
  nb("Sandy Forest", "sandyforest.ttf"),
  nb("Square Sounds", "squaresounds.ttf"),
  nb("Tallpix", "tallpix.ttf"),
  nb("Tiny Unicode", "tinyunicode.ttf"),
  nb("Triple N", "triplen.ttf"),
  {
    family: "3x3 Mono",
    dir: "3x3-mono",
    kind: "pixel",
    licence: "CC0-1.0",
    licenceFile: "LICENSE.txt",
    crispSizes: multiples(4),
    faces: [one("Regular", 400, "3x3-mono.ttf")],
  },
  {
    family: "Jersey 10",
    dir: "jersey-10",
    kind: "pixel",
    licence: OFL,
    licenceFile: "OFL.txt",
    faces: [one("Regular", 400, "Jersey10-Regular.ttf")],
  },
  {
    family: "Old English Gothic Pixel",
    dir: "old-english-gothic-pixel",
    kind: "pixel",
    licence: OFL,
    licenceFile: "OFL.txt",
    crispSizes: [20],
    faces: [one("Regular", 400, "old-english-gothic-pixel.ttf")],
  },
  {
    family: "Pixelify Sans",
    dir: "pixelify-sans",
    kind: "pixel",
    licence: OFL,
    licenceFile: "OFL.txt",
    faces: [variable("Regular", 400, "PixelifySans.ttf", "400 700"), variable("Bold", 700, "PixelifySans.ttf", "400 700")],
  },
  {
    family: "Pixeloid Mono",
    dir: "pixeloid",
    kind: "pixel",
    licence: OFL,
    licenceFile: "OFL.txt",
    crispSizes: multiples(9),
    faces: [one("Regular", 400, "pixeloid-mono.ttf")],
  },
  {
    family: "Pixeloid Sans",
    dir: "pixeloid",
    kind: "pixel",
    licence: OFL,
    licenceFile: "OFL.txt",
    crispSizes: multiples(9),
    faces: [one("Regular", 400, "pixeloid-sans.ttf"), one("Bold", 700, "pixeloid-sans-bold.ttf")],
  },
  {
    family: "Press Start 2P",
    dir: "press-start-2p",
    kind: "pixel",
    licence: OFL,
    licenceFile: "OFL.txt",
    crispSizes: multiples(8),
    faces: [one("Regular", 400, "PressStart2P-Regular.ttf")],
  },
  {
    family: "Public Pixel",
    dir: "public-pixel",
    kind: "pixel",
    licence: "CC0-1.0",
    licenceFile: "LICENSE.txt",
    crispSizes: multiples(8),
    faces: [one("Regular", 400, "public-pixel.ttf")],
  },
  {
    family: "Quinque Five",
    dir: "quinque-five",
    kind: "pixel",
    licence: OFL,
    licenceFile: "OFL.txt",
    crispSizes: [10, 15, 20, 25, 30, 35],
    faces: [one("Regular", 400, "quinque-five.ttf")],
  },
  {
    family: "Silkscreen",
    dir: "silkscreen",
    kind: "pixel",
    licence: OFL,
    licenceFile: "OFL.txt",
    crispSizes: multiples(8),
    faces: [one("Regular", 400, "Silkscreen-Regular.ttf"), one("Bold", 700, "Silkscreen-Bold.ttf")],
  },
  {
    family: "Tiny5",
    dir: "tiny5",
    kind: "pixel",
    licence: OFL,
    licenceFile: "OFL.txt",
    crispSizes: multiples(8),
    faces: [one("Regular", 400, "Tiny5-Regular.ttf")],
  },
  { family: "VT323", dir: "vt323", kind: "pixel", licence: OFL, licenceFile: "OFL.txt", faces: [one("Regular", 400, "VT323-Regular.ttf")] },
  // Outline fonts, A to Z.
  {
    family: "Caveat",
    dir: "caveat",
    kind: "outline",
    licence: OFL,
    licenceFile: "OFL.txt",
    faces: [variable("Regular", 400, "Caveat.ttf", "400 700"), variable("Bold", 700, "Caveat.ttf", "400 700")],
  },
  {
    family: "Lora",
    dir: "lora",
    kind: "outline",
    licence: OFL,
    licenceFile: "OFL.txt",
    faces: [variable("Regular", 400, "Lora.ttf", "400 700"), variable("Bold", 700, "Lora.ttf", "400 700")],
  },
  {
    family: "Oswald",
    dir: "oswald",
    kind: "outline",
    licence: OFL,
    licenceFile: "OFL.txt",
    faces: [
      variable("Light", 300, "Oswald.ttf", "200 700"),
      variable("Regular", 400, "Oswald.ttf", "200 700"),
      variable("Bold", 700, "Oswald.ttf", "200 700"),
    ],
  },
  {
    family: "Pacifico",
    dir: "pacifico",
    kind: "outline",
    licence: OFL,
    licenceFile: "OFL.txt",
    faces: [one("Regular", 400, "Pacifico-Regular.ttf")],
  },
  {
    family: "Playfair Display",
    dir: "playfair-display",
    kind: "outline",
    licence: OFL,
    licenceFile: "OFL.txt",
    faces: [variable("Regular", 400, "PlayfairDisplay.ttf", "400 900"), variable("Bold", 700, "PlayfairDisplay.ttf", "400 900")],
  },
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
    group: font.kind,
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
 * What to tell the stitcher about a bundled pixel font at a size: it is cleanest at certain sizes, so a size that is not one gets
 * the nearest below and above. Null when the font has no such sizes, the size already is one, or none is near.
 */
export function pixelSizeHint(font: BundledFont | undefined, size: number): { clean: number[] } | null {
  const sizes = font?.crispSizes;
  if (!sizes || sizes.length === 0 || sizes.includes(size)) return null;
  const below = Math.max(0, ...sizes.filter((s) => s < size));
  const above = Math.min(Infinity, ...sizes.filter((s) => s > size));
  const clean = [below, above].filter((s) => Number.isFinite(s) && s >= 7);
  return clean.length > 0 ? { clean } : null;
}
