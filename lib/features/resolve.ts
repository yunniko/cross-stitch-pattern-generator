import { type FeatureState, type FeatureStates } from "./features";

/**
 * How a person's settings are resolved (G-102 M2, D307): their own win over their tier's, which win over those for guests
 * or for accounts, which win over the site's. One order for feature states and for limits (G-108 M1, D353): a value of any
 * kind goes through `resolveLayers`.
 */
export interface Layers<T> {
  site: Readonly<Record<string, T>>;
  /** What every guest, or every signed-in account, is given, whichever the person is. */
  audience?: Readonly<Record<string, T>>;
  /** What the person's tier gives, if they have one. */
  tier?: Readonly<Record<string, T>>;
  /** The person's own, if they are signed in. */
  person?: Readonly<Record<string, T>>;
}

/** The layers merged, the person's last so it wins. An id `known` refuses is ignored, never an error. */
export function resolveLayers<T>(layers: Layers<T>, known: (id: string) => boolean = () => true): Record<string, T> {
  const merged: Record<string, T> = {};
  for (const layer of [layers.site, layers.audience ?? {}, layers.tier ?? {}, layers.person ?? {}]) {
    for (const [id, value] of Object.entries(layer)) {
      if (!known(id)) continue;
      merged[id] = value;
    }
  }
  return merged;
}

export type FeatureLayers = Layers<FeatureState>;

/**
 * The feature states: a feature none of the layers names is on. An "on" from the person or the tier is a real entry: it
 * lifts a lock the site has put on. The result holds only what differs from on.
 */
export function resolveFeatures(layers: FeatureLayers, known: (id: string) => boolean = () => true): FeatureStates {
  const merged = resolveLayers(layers, known);
  for (const id of Object.keys(merged)) if (merged[id] === "on") delete merged[id];
  return merged;
}
