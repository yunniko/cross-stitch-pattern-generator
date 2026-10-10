"use client";

import { FeatureStatesEditor } from "@/app/admin/features/feature-states-editor";
import { setUserFeaturesAction } from "@/lib/admin/feature-actions";
import type { Feature, FeatureState } from "@/lib/features/features";

export function UserFeatures({
  userId,
  states,
  site,
  systems,
}: {
  userId: string;
  states: Record<string, FeatureState>;
  site: Record<string, FeatureState>;
  systems: readonly Feature[];
}) {
  return (
    <FeatureStatesEditor
      testId="user-features"
      states={states}
      site={site}
      choices={["site", "on", "locked", "hidden"]}
      extra={systems}
      onChange={(entries) => setUserFeaturesAction(userId, entries)}
    />
  );
}
