"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  EVERYTHING_ON,
  featureShown,
  featureState,
  featureUsable,
  lockedNote,
  type FeatureState,
  type FeatureStates,
} from "@/lib/features/features";

/**
 * The feature states of the person using the editor (G-102), handed down once so that every place a registry is read can
 * ask what state a feature is in. With no provider, everything is on.
 */
const FeaturesContext = createContext<FeatureStates>(EVERYTHING_ON);

export function FeaturesProvider({ states, children }: { states: FeatureStates; children: ReactNode }) {
  return <FeaturesContext.Provider value={states}>{children}</FeaturesContext.Provider>;
}

export function useFeatures(): FeatureStates {
  return useContext(FeaturesContext);
}

/** The state of one feature, with the two questions most places ask: is it shown, may it be used. */
export function useFeature(id: string | null): { state: FeatureState; shown: boolean; usable: boolean } {
  const states = useContext(FeaturesContext);
  if (id === null) return { state: "on", shown: true, usable: true };
  return { state: featureState(states, id), shown: featureShown(states, id), usable: featureUsable(states, id) };
}

/**
 * A row of options (a segmented control, a list of radios) under feature switches, one feature per option or none:
 * hidden options are left out, locked ones are kept, disabled, with the note.
 */
export function useGatedOptions<T extends { value: unknown; label: ReactNode; title?: string; disabled?: boolean }>(
  options: readonly T[],
  featureOf: (value: T["value"]) => string | null
): Array<T & { disabled?: boolean; title?: string }> {
  const states = useContext(FeaturesContext);
  const gated: Array<T & { disabled?: boolean; title?: string }> = [];
  for (const option of options) {
    const feature = featureOf(option.value);
    const state = feature === null ? "on" : featureState(states, feature);
    if (state === "hidden") continue;
    gated.push(
      state === "locked"
        ? { ...option, disabled: true, title: lockedNote(typeof option.label === "string" ? option.label : "This") }
        : option
    );
  }
  return gated;
}
