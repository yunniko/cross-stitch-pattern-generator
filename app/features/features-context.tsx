"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { featuresExpired } from "@/lib/features/refresh";
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

/**
 * The states the page was given, asked for again once they are `refreshSeconds` old: on a timer while the page is in
 * view, and at once when it comes back into view after that time. A failed ask keeps the states held and tries at the
 * next turn; a reply that changes nothing changes nothing on screen.
 */
export function FeaturesProvider({
  states: initial,
  refreshSeconds,
  children,
}: {
  states: FeatureStates;
  /** Leave out to keep the states the page was given. */
  refreshSeconds?: number;
  children: ReactNode;
}) {
  const [states, setStates] = useState(initial);
  const fetchedAt = useRef(0);

  useEffect(() => {
    if (!refreshSeconds) return;
    fetchedAt.current = Date.now();
    let cancelled = false;
    async function ask() {
      fetchedAt.current = Date.now();
      try {
        const response = await fetch("/api/features", { cache: "no-store" });
        if (!response.ok) return;
        const { states: next } = (await response.json()) as { states: FeatureStates };
        if (!cancelled) setStates((held) => (JSON.stringify(held) === JSON.stringify(next) ? held : next));
      } catch {
        // Offline or the server busy: keep what is held.
      }
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void ask();
    }, refreshSeconds * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && featuresExpired(fetchedAt.current, Date.now(), refreshSeconds)) void ask();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshSeconds]);

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
