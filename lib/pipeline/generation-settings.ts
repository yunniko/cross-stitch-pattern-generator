import type { FeatureDeclaration } from "../features/features";
import { requestSystemKeys, threadSystemsRefusal } from "../thread-systems/thread-system";
import { threadIdentity } from "../threads/thread-brands";
import { MAX_COLORS, MAX_STITCHES, MIN_COLORS, MIN_STITCHES } from "../types";
import { DITHER_MODES, isDithered, type DitherMode } from "./dither";
import { isValidDitherTexture } from "./dither-hand-drawn";
import { isValidPhotoAdjust } from "./photo-adjust";

/**
 * The settings of a generation, declared once (G-099, D293).
 *
 * A setting is a value the editor sends with a photo and the pipeline reads. Each is declared here with what it may be,
 * and the three places that used to list the settings by hand read this list instead:
 *
 * - the request the editor sends (`pickGenerationSettings`, in `pattern-server.ts`);
 * - the processor's check of that request before any worker is given it (`generationSettingsRefusal`);
 * - the options handed to the Rust pipeline (`rustGenerationOptions`, in `processor/rust-jobs.ts`).
 *
 * On the Rust side each family of algorithm reads its own settings (`rust/cs-core/src/settings.rs`) and a setting nobody
 * reads is refused by name, so a setting declared here and forgotten there fails loudly, and `tests/unit/
 * generation-settings.spec.ts` sends every one of these to the binary to prove it.
 *
 * **To add a setting:** declare it here, and read it in the Rust module that uses it. Nothing else lists settings.
 */

type Check =
  /** A whole number in a range. */
  | { kind: "integer"; min: number; max: number }
  /** One of a list of words. */
  | { kind: "choice"; values: readonly string[] }
  | { kind: "flag" }
  /** A number from 0 to 1. */
  | { kind: "unit" }
  /** Anything else: a check of its own, which says what is wrong or returns null. */
  | { kind: "shape"; refusal: (value: unknown, body: Record<string, unknown>) => string | null };

export type GenerationSetting = Check & {
  /** Its name in the request, in the stored settings where it is stored, and in the Rust options unless `rustName` says otherwise. */
  id: string;
  /** It must be present; every other setting may be left out, and the pipeline then takes its own default. */
  required?: boolean;
  /** Its name in the options handed to Rust, when that differs. */
  rustName?: string;
  /** A combination with another setting that is refused, checked once this one has passed its own check. */
  alsoRefuse?: (body: Record<string, unknown>) => string | null;
  /**
   * How it is offered when no control was written for it (D294): its label, a hint, and the value it starts at. A setting
   * declared with this is drawn from the declaration (`app/components/declared-settings.tsx`), kept with the browser's
   * settings in one bag by id, and sent with every Generate. Only a flag, a number from 0 to 1 or a choice can be drawn.
   */
  control?: { label: string; hint?: string; default: boolean | number | string };
  /**
   * The feature switch it is under (G-102). Left out, the setting is a feature of its own, `generation.<id>`, named by its
   * control's label or its id; `null` is core (the size, the colour count); a string names the setting it belongs to.
   */
  feature?: FeatureDeclaration;
};

/** The values of the settings that are drawn from their declarations, by id. */
export type ExtraSettings = Record<string, boolean | number | string>;

/**
 * A palette mode is "full" or a system the request carries (G-132, D400): the server puts in the systems a request names,
 * so a mode it did not put in is one this person cannot use, or one that does not exist.
 */
function paletteModeRefusal(what: string, mode: unknown, body: Record<string, unknown>): string | null {
  const modes = ["full", ...requestSystemKeys(body)];
  return typeof mode === "string" && modes.includes(mode) ? null : `${what} must be one of: ${modes.join(", ")}.`;
}
const isByteTriple = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((c) => Number.isInteger(c) && c >= 0 && c <= 255);

/**
 * A set of colours to make the chart from (G-087): its mode, and each colour by its RGB with its name and its thread of any
 * system, typed or listed (G-131, D397); or, as before, by a listed thread's code in the set's brand.
 */
function paletteSetRefusal(set: unknown, body: Record<string, unknown>): string | null {
  if (typeof set !== "object" || set === null) return "paletteSet must be an object.";
  const s = set as Record<string, unknown>;
  const modeRefusal = paletteModeRefusal("paletteSet.mode", s.mode, body);
  if (modeRefusal) return modeRefusal;
  if (body.paletteMode !== undefined && body.paletteMode !== s.mode) return "paletteSet.mode must be the paletteMode.";
  const colors = s.colors;
  if (!Array.isArray(colors) || colors.length < 1 || colors.length > MAX_COLORS) {
    return `paletteSet.colors must hold between 1 and ${MAX_COLORS} colours.`;
  }
  const valid = colors.every((c) => {
    if (typeof c !== "object" || c === null) return false;
    const e = c as Record<string, unknown>;
    if (e.name !== undefined && (typeof e.name !== "string" || e.name.length > 60)) return false;
    if (e.system !== undefined || e.number !== undefined) {
      return (
        isByteTriple(e.rgb) && typeof e.system === "string" && typeof e.number === "string" && threadIdentity(e.system, e.number) !== null
      );
    }
    if (isByteTriple(e.rgb)) return true;
    return s.mode !== "full" && typeof e.code === "string" && e.code.length >= 1 && e.code.length <= 16;
  });
  return valid
    ? null
    : "paletteSet.colors must each be an RGB of whole numbers from 0 to 255, with a name and a thread system and number if any, or a thread code of the set's brand.";
}

/**
 * Every setting, **in the order they are checked**: a request wrong in two ways is told about the first of them, and that
 * order is part of what the processor's tests pin.
 */
const DECLARED = [
  // The thread systems the request names, put in by the web server from its table and never the browser's (G-132, D400).
  // Checked before the size: a malformed list is the server's fault, not the reader's photo.
  { id: "threadSystems", kind: "shape", refusal: threadSystemsRefusal, feature: null },
  { id: "longerSideStitches", kind: "integer", min: MIN_STITCHES, max: MAX_STITCHES, required: true, feature: null },
  { id: "colorCount", kind: "integer", min: MIN_COLORS, max: MAX_COLORS, required: true, feature: null },
  // Called the quantizer inside the pipeline: "original" is the algorithm the project shipped with, "latest" its fix (D20).
  {
    id: "generationMode",
    kind: "choice",
    values: ["original", "latest"],
    rustName: "quantizer",
    feature: { label: "Choice of algorithm" },
  },
  // The systems are features of their own (`brand.<id>`), so the mode itself is core.
  {
    id: "paletteMode",
    kind: "shape",
    refusal: (value, body) => paletteModeRefusal("paletteMode", value, body),
    feature: null,
  },
  { id: "edgeMode", kind: "choice", values: ["standard", "crisp", "crisp-plus"], feature: { label: "Crisp edges" } },
  {
    id: "ditherMode",
    kind: "choice",
    values: DITHER_MODES,
    // Each pattern is a feature of its own (`dither.<mode>`); the choice as a whole is this one.
    feature: { label: "Dithering" },
    // Refused here rather than inside a worker: the pipeline refuses the combination too (D199), and a failure there
    // would tell the reader their photo was at fault.
    alsoRefuse: (b) =>
      isDithered(b.ditherMode as DitherMode | undefined) && b.edgeMode !== undefined && b.edgeMode !== "standard"
        ? "ditherMode cannot be combined with a Crisp edgeMode: Crisp preserves hard boundaries, which dithering deliberately blends."
        : null,
  },
  // A plain flag, checked so a stray string cannot reach the pipeline as a truthy value (G-061).
  { id: "vivid", kind: "flag", feature: { label: "Vivid colour detail" } },
  // The line tracing (G-084): two flags here, and its sensitivity below.
  { id: "backstitchLines", kind: "flag", feature: { label: "Backstitch from lines" } },
  { id: "backstitchPhotos", kind: "flag", feature: "generation.backstitchLines" },
  { id: "paletteSet", kind: "shape", refusal: paletteSetRefusal, feature: { label: "Set up palette" } },
  // The texture strokes (G-085): a flag, and how many.
  { id: "textureStrokes", kind: "flag", feature: { label: "Texture strokes" } },
  { id: "textureDensity", kind: "unit", feature: "generation.textureStrokes" },
  { id: "backstitchSensitivity", kind: "unit", feature: "generation.backstitchLines" },
  // Whole numbers in range, or nothing: a slider cannot produce anything else (G-074).
  {
    id: "photoAdjust",
    kind: "shape",
    feature: { label: "Photo adjustment" },
    refusal: (value) =>
      isValidPhotoAdjust(value)
        ? null
        : "photoAdjust must be an object whose brightness, contrast, saturation and temperature are whole numbers between -100 and 100.",
  },
  // Ranges, not a list of words: a texture is numbers.
  {
    id: "ditherTexture",
    kind: "shape",
    feature: "dither.hand-drawn",
    refusal: (value) => (isValidDitherTexture(value) ? null : "ditherTexture must be an object whose values are all inside their ranges."),
  },
] as const satisfies readonly GenerationSetting[];

export const GENERATION_SETTINGS: readonly GenerationSetting[] = DECLARED;

/** The name of every setting, as a type: a request type that names a setting this list does not have fails to compile. */
export type GenerationSettingId = (typeof DECLARED)[number]["id"];
/** The names of the settings drawn from their declarations; the request types do not name these. */
export type DrawnSettingId = Extract<(typeof DECLARED)[number], { control: unknown }>["id"];

/** The settings drawn from their declarations, in the order declared. */
export const DRAWN_SETTINGS = GENERATION_SETTINGS.filter(
  (setting): setting is GenerationSetting & { control: NonNullable<GenerationSetting["control"]> } => setting.control !== undefined
);

/** What is wrong with one setting's value, in the words the processor answers with; null when nothing is. */
function valueRefusal(setting: GenerationSetting, value: unknown, body: Record<string, unknown>): string | null {
  switch (setting.kind) {
    case "integer":
      return Number.isInteger(value) && (value as number) >= setting.min && (value as number) <= setting.max
        ? null
        : `${setting.id} must be a whole number between ${setting.min} and ${setting.max}.`;
    case "choice":
      return typeof value === "string" && setting.values.includes(value)
        ? null
        : `${setting.id} must be one of: ${setting.values.join(", ")}.`;
    case "flag":
      return typeof value === "boolean" ? null : `${setting.id} must be true or false.`;
    case "unit":
      return typeof value === "number" && value >= 0 && value <= 1 ? null : `${setting.id} must be a number between 0 and 1.`;
    case "shape":
      return setting.refusal(value, body);
  }
}

/** The first thing wrong with a request's settings, or null. A setting that is not required and not there is not checked. */
export function generationSettingsRefusal(body: Record<string, unknown>): string | null {
  for (const setting of GENERATION_SETTINGS) {
    const value = body[setting.id];
    if (value === undefined && !setting.required) continue;
    const refusal = valueRefusal(setting, value, body) ?? setting.alsoRefuse?.(body) ?? null;
    if (refusal) return refusal;
  }
  return null;
}

/** The declared settings of `source`, and nothing else it carries. A setting that is not there is left out. */
export function pickGenerationSettings<T extends object>(source: T): Partial<Pick<T, Extract<keyof T, GenerationSettingId>>> {
  const from = source as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const { id } of GENERATION_SETTINGS) if (from[id] !== undefined) picked[id] = from[id];
  return picked as Partial<Pick<T, Extract<keyof T, GenerationSettingId>>>;
}

/** The same settings under the names the Rust pipeline reads them by. */
export function rustGenerationOptions(settings: object): Record<string, unknown> {
  const picked = pickGenerationSettings(settings) as Record<string, unknown>;
  const options: Record<string, unknown> = {};
  for (const setting of GENERATION_SETTINGS) {
    if (picked[setting.id] !== undefined) options[setting.rustName ?? setting.id] = picked[setting.id];
  }
  return options;
}

/**
 * The value of every drawn setting: what is kept for it when that is still a value it allows, else what it starts at. A
 * bag read back from the browser may hold anything, and a setting may have been taken away or changed since.
 */
export function drawnSettingValues(kept: unknown, drawn: Readonly<typeof DRAWN_SETTINGS> = DRAWN_SETTINGS): ExtraSettings {
  const bag = typeof kept === "object" && kept !== null && !Array.isArray(kept) ? (kept as Record<string, unknown>) : {};
  const values: ExtraSettings = {};
  for (const setting of drawn) {
    const stored = bag[setting.id];
    const usable = stored !== undefined && valueRefusal(setting, stored, bag) === null;
    values[setting.id] = usable ? (stored as boolean | number | string) : setting.control.default;
  }
  return values;
}
