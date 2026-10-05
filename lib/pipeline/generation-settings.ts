import { THREAD_BRAND_IDS } from "../threads/thread-brands";
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
};

/** The values of the settings that are drawn from their declarations, by id. */
export type ExtraSettings = Record<string, boolean | number | string>;

const PALETTE_MODES = ["full", ...THREAD_BRAND_IDS];
const isByteTriple = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((c) => Number.isInteger(c) && c >= 0 && c <= 255);

/** A set of colours to make the chart from (G-087): its mode, and a code each in a brand or an RGB each otherwise. */
function paletteSetRefusal(set: unknown, body: Record<string, unknown>): string | null {
  if (typeof set !== "object" || set === null) return "paletteSet must be an object.";
  const s = set as Record<string, unknown>;
  if (typeof s.mode !== "string" || !PALETTE_MODES.includes(s.mode)) return `paletteSet.mode must be one of: ${PALETTE_MODES.join(", ")}.`;
  if (body.paletteMode !== undefined && body.paletteMode !== s.mode) return "paletteSet.mode must be the paletteMode.";
  const colors = s.colors;
  if (!Array.isArray(colors) || colors.length < 1 || colors.length > MAX_COLORS) {
    return `paletteSet.colors must hold between 1 and ${MAX_COLORS} colours.`;
  }
  const valid = colors.every((c) => {
    if (typeof c !== "object" || c === null) return false;
    const e = c as Record<string, unknown>;
    if (s.mode === "full") return isByteTriple(e.rgb);
    return typeof e.code === "string" && e.code.length >= 1 && e.code.length <= 16;
  });
  return valid
    ? null
    : "paletteSet.colors must each be a thread code in a brand or an RGB of whole numbers from 0 to 255 in the full colour mode.";
}

/**
 * Every setting, **in the order they are checked**: a request wrong in two ways is told about the first of them, and that
 * order is part of what the processor's tests pin.
 */
const DECLARED = [
  { id: "longerSideStitches", kind: "integer", min: MIN_STITCHES, max: MAX_STITCHES, required: true },
  { id: "colorCount", kind: "integer", min: MIN_COLORS, max: MAX_COLORS, required: true },
  // Called the quantizer inside the pipeline: "original" is the algorithm the project shipped with, "latest" its fix (D20).
  { id: "generationMode", kind: "choice", values: ["original", "latest"], rustName: "quantizer" },
  { id: "paletteMode", kind: "choice", values: PALETTE_MODES },
  { id: "edgeMode", kind: "choice", values: ["standard", "crisp", "crisp-plus"] },
  {
    id: "ditherMode",
    kind: "choice",
    values: DITHER_MODES,
    // Refused here rather than inside a worker: the pipeline refuses the combination too (D199), and a failure there
    // would tell the reader their photo was at fault.
    alsoRefuse: (b) =>
      isDithered(b.ditherMode as DitherMode | undefined) && b.edgeMode !== undefined && b.edgeMode !== "standard"
        ? "ditherMode cannot be combined with a Crisp edgeMode: Crisp preserves hard boundaries, which dithering deliberately blends."
        : null,
  },
  // A plain flag, checked so a stray string cannot reach the pipeline as a truthy value (G-061).
  { id: "vivid", kind: "flag" },
  // The line tracing (G-084): two flags here, and its sensitivity below.
  { id: "backstitchLines", kind: "flag" },
  { id: "backstitchPhotos", kind: "flag" },
  { id: "paletteSet", kind: "shape", refusal: paletteSetRefusal },
  // The texture strokes (G-085): a flag, and how many.
  { id: "textureStrokes", kind: "flag" },
  { id: "textureDensity", kind: "unit" },
  { id: "backstitchSensitivity", kind: "unit" },
  // Whole numbers in range, or nothing: a slider cannot produce anything else (G-074).
  {
    id: "photoAdjust",
    kind: "shape",
    refusal: (value) =>
      isValidPhotoAdjust(value)
        ? null
        : "photoAdjust must be an object whose brightness, contrast, saturation and temperature are whole numbers between -100 and 100.",
  },
  // Ranges, not a list of words: a texture is numbers.
  {
    id: "ditherTexture",
    kind: "shape",
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
