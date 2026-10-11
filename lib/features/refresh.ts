import type { FeatureStates } from "./features";

/**
 * How long the browser keeps a person's feature states before it asks for them again (G-102): set on the server by
 * `FEATURES_REFRESH_SECONDS`, 300 when unset or not a number, held between 5 seconds and a day. An admin's change then
 * reaches an open editor within this time, without a reload.
 */
export const DEFAULT_FEATURES_REFRESH_SECONDS = 300;
export const MIN_FEATURES_REFRESH_SECONDS = 5;
export const MAX_FEATURES_REFRESH_SECONDS = 86_400;

export function featuresRefreshSeconds(raw: string | undefined): number {
  const seconds = Number(raw);
  if (raw === undefined || raw.trim() === "" || !Number.isFinite(seconds)) return DEFAULT_FEATURES_REFRESH_SECONDS;
  return Math.min(MAX_FEATURES_REFRESH_SECONDS, Math.max(MIN_FEATURES_REFRESH_SECONDS, Math.round(seconds)));
}

/** True when the states held are older than the time they may be kept. */
export function featuresExpired(fetchedAt: number, now: number, refreshSeconds: number): boolean {
  return now - fetchedAt >= refreshSeconds * 1000;
}

/** What `GET /api/features` answers: the asker's feature states, fresh. */
export interface FeaturesAnswer {
  states: FeatureStates;
}
