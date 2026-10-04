/**
 * Tool options as data (G-093): what an option is, apart from how it is drawn, and where its value is kept.
 *
 * A tool declares its options; the editor draws whatever the tool in hand declares and keeps the values. The four options that
 * existed before this (brush size, brush shape, outline or filled, stitch type) keep their own named places among the saved
 * settings, so nothing stored in a browser changes; an option a new tool brings is kept in one bag, by its id, with no edit to
 * the settings store.
 */

export type OptionValue = string | number;

export interface ToolOptionSpec<V extends OptionValue = OptionValue> {
  /** Its name among the saved settings: unique across all tools. */
  id: string;
  /** Every value it can take, in the order they are offered. */
  values: readonly V[];
  defaultValue: V;
}

/** The options that have a named place of their own in the saved settings, from before options were data. */
export const NAMED_OPTION_IDS = ["brushSize", "brushShape", "shapeFill", "stitchKind"] as const;
type NamedOptionId = (typeof NAMED_OPTION_IDS)[number];

export type ToolOptionBag = Record<string, OptionValue>;

/** The saved settings, as far as options are concerned. */
export type OptionStore = Record<NamedOptionId, OptionValue> & { toolOptions: ToolOptionBag };

const isNamed = (id: string): id is NamedOptionId => (NAMED_OPTION_IDS as readonly string[]).includes(id);

/** An option's value: the stored one when it is one the option offers, else its default. */
export function readToolOption<V extends OptionValue>(store: OptionStore, spec: ToolOptionSpec<V>): V {
  const stored = isNamed(spec.id) ? store[spec.id] : store.toolOptions[spec.id];
  return (spec.values as readonly OptionValue[]).includes(stored) ? (stored as V) : spec.defaultValue;
}

/** Where a new value goes: the setting to write and what to write there. A value the option does not offer is refused by name. */
export function writeToolOption<V extends OptionValue>(
  store: OptionStore,
  spec: ToolOptionSpec<V>,
  value: V
): { key: NamedOptionId; value: OptionValue } | { key: "toolOptions"; value: ToolOptionBag } {
  if (!(spec.values as readonly OptionValue[]).includes(value)) {
    throw new Error(`"${String(value)}" is not a value of the tool option "${spec.id}".`);
  }
  if (isNamed(spec.id)) return { key: spec.id, value };
  return { key: "toolOptions", value: { ...store.toolOptions, [spec.id]: value } };
}

/** The bag as read back from the browser: text and numbers by name, anything else dropped. */
export function parseToolOptionBag(stored: unknown): ToolOptionBag {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
  const bag: ToolOptionBag = {};
  for (const [id, value] of Object.entries(stored)) {
    if (id.length <= 60 && (typeof value === "string" || (typeof value === "number" && Number.isFinite(value)))) bag[id] = value;
  }
  return bag;
}
