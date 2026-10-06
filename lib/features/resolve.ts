import { type FeatureState, type FeatureStates } from "./features";

/**
 * How a person's feature states are resolved (G-102 M2, D307): their own states win over their tier's set, which wins over
 * the set for guests or for accounts, which wins over the site's; a feature none of them names is on. An "on" set for the person or the tier is a real entry: it lifts a lock the
 * site has put on. The result holds only what differs from on.
 */
export interface FeatureLayers {
  site: FeatureStates;
  /** The set given to every guest, or to every signed-in account, whichever the person is. */
  audience?: FeatureStates;
  /** The set of the person's tier, if they have one. */
  tier?: FeatureStates;
  /** The person's own states, if they are signed in. */
  person?: FeatureStates;
}

export function resolveFeatures(layers: FeatureLayers, known: (id: string) => boolean = () => true): FeatureStates {
  const merged: Record<string, FeatureState> = {};
  for (const layer of [layers.site, layers.audience ?? {}, layers.tier ?? {}, layers.person ?? {}]) {
    for (const [id, state] of Object.entries(layer)) {
      // A row for a feature that no longer exists is ignored, never an error.
      if (!known(id)) continue;
      merged[id] = state;
    }
  }
  for (const id of Object.keys(merged)) if (merged[id] === "on") delete merged[id];
  return merged;
}
