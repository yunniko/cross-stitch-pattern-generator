/**
 * Feature switches (G-102): every feature of the editor is one entry in one list, and for a given person it is in one of
 * three states (Owner, 2026-10-06):
 *
 * - **on**: offered and usable;
 * - **locked**: shown in place, greyed, with a note saying why; it takes no press, and the server refuses it;
 * - **hidden**: absent, as if it did not exist; the server refuses it.
 *
 * What the features are is the registry's (`app/features/registry.ts`), derived from the tools, the commands, the export
 * kinds, the generation settings and the rest, so a feature appears in the list by being declared where it lives. This
 * module is the pure part: the states, the resolution of one, and the shape of the list.
 */

export const FEATURE_STATES = ["on", "locked", "hidden"] as const;
export type FeatureState = (typeof FEATURE_STATES)[number];

export function isFeatureState(value: unknown): value is FeatureState {
  return (FEATURE_STATES as readonly unknown[]).includes(value);
}

export interface Feature {
  /** Stable, dotted by its source: `tool.brush`, `export.a4`, `generation.vivid`, `dither.bayer-4`, `brand.dmc`. */
  id: string;
  /** The heading it is listed under: the registry's own grouping. */
  group: string;
  label: string;
}

/** The states that differ from the default, by feature id. A feature not in the map is on. */
export type FeatureStates = Readonly<Record<string, FeatureState>>;

export const EVERYTHING_ON: FeatureStates = Object.freeze({});

/** The state of one feature for the person these states belong to: on unless the states say otherwise. */
export function featureState(states: FeatureStates, id: string): FeatureState {
  return states[id] ?? "on";
}

/** True when the feature may be used: the only state that lets a press through or a request pass. */
export function featureUsable(states: FeatureStates, id: string): boolean {
  return featureState(states, id) === "on";
}

/** True when the feature is shown at all: on or locked. */
export function featureShown(states: FeatureStates, id: string): boolean {
  return featureState(states, id) !== "hidden";
}

/** The note on a locked feature's control, saying why it takes no press. */
export function lockedNote(label: string): string {
  return `${label} is not available to you.`;
}

/** The list in its groups, in the order the features were registered. */
export function groupFeatures(features: readonly Feature[]): Array<{ group: string; features: Feature[] }> {
  const groups: Array<{ group: string; features: Feature[] }> = [];
  for (const feature of features) {
    let entry = groups.find((candidate) => candidate.group === feature.group);
    if (!entry) {
      entry = { group: feature.group, features: [] };
      groups.push(entry);
    }
    entry.features.push(feature);
  }
  return groups;
}

/** One state when every feature of the group has it; "mixed" otherwise, for the admin's group switch. */
export function groupState(states: FeatureStates, features: readonly Feature[]): FeatureState | "mixed" {
  const seen = new Set(features.map((feature) => featureState(states, feature.id)));
  return seen.size === 1 ? [...seen][0] : "mixed";
}

/** The states with every feature of the group set to one state. */
export function withGroupState(states: FeatureStates, features: readonly Feature[], state: FeatureState): FeatureStates {
  const next: Record<string, FeatureState> = { ...states };
  for (const feature of features) {
    if (state === "on") delete next[feature.id];
    else next[feature.id] = state;
  }
  return next;
}

/**
 * How a feature is declared by what it belongs to. Undefined: the thing is a feature of its own, named after itself.
 * `null`: core, never switched (Undo, the zoom, a chart's size). A string: it belongs to that feature (the strokes' density
 * belongs to the strokes). An object: a feature of its own with the label given.
 */
export type FeatureDeclaration = null | string | { label: string; group?: string };

/** The feature id a declared thing belongs to, or null when it is core. */
export function declaredFeatureId(ownId: string, declaration: FeatureDeclaration | undefined): string | null {
  if (declaration === null) return null;
  if (typeof declaration === "string") return declaration;
  return ownId;
}
