"use client";

import { useOptimistic, useState, useTransition } from "react";
import { SegmentedControl } from "@/app/components/ui";
import { FEATURES } from "@/app/features/registry";
import { groupFeatures, type Feature, type FeatureState } from "@/lib/features/features";
import type { ActionResult, StateChoice } from "@/lib/admin/feature-actions";

/**
 * The feature list with a state per group and per feature (G-102 M3), for the site, for a person and for a set. Each
 * press is sent at once and the row shows the new state while it travels; a refused change puts the old one back and
 * says why.
 *
 * `choices` says which states this editor offers: the site has three; a person and a set have a fourth, "As the site",
 * which is no row at all.
 */
export interface FeatureStatesEditorProps {
  /** The rows there are: a feature not here is "site" where that is a choice, else on. */
  states: Record<string, StateChoice>;
  choices: readonly StateChoice[];
  /** The site's resolved states, shown beside a person's or a set's own so the admin sees what "As the site" means. */
  site?: Record<string, FeatureState>;
  onChange: (entries: Array<{ featureId: string; state: StateChoice }>) => Promise<ActionResult>;
  testId?: string;
}

const LABEL: Record<StateChoice, string> = { on: "On", locked: "Locked", hidden: "Hidden", site: "As the site" };
const TITLE: Record<StateChoice, string> = {
  on: "Offered and usable",
  locked: "Shown greyed with a note saying it is not available; refused if asked for",
  hidden: "Absent, as if it did not exist; refused if asked for",
  site: "No state of its own: whatever the site says",
};

export function FeatureStatesEditor({ states, choices, site, onChange, testId }: FeatureStatesEditorProps) {
  const fallback: StateChoice = choices.includes("site") ? "site" : "on";
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(states, (current, entries: Array<{ featureId: string; state: StateChoice }>) => {
    const next = { ...current };
    for (const { featureId, state } of entries) next[featureId] = state;
    return next;
  });
  const [problem, setProblem] = useState<string | null>(null);
  const stateOf = (feature: Feature): StateChoice => shown[feature.id] ?? fallback;

  function apply(entries: Array<{ featureId: string; state: StateChoice }>) {
    setProblem(null);
    startTransition(async () => {
      show(entries);
      const result = await onChange(entries);
      if (result.error) setProblem(result.error);
    });
  }

  const options = choices.map((choice) => ({ value: choice, label: LABEL[choice], title: TITLE[choice] }));

  return (
    <div className="flex flex-col gap-5" data-testid={testId} data-pending={pending || undefined}>
      {problem && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {problem}
        </p>
      )}
      {groupFeatures(FEATURES).map(({ group, features }) => {
        const groupStates = new Set(features.map(stateOf));
        const groupValue = groupStates.size === 1 ? [...groupStates][0] : ("mixed" as const);
        return (
          <section
            key={group}
            className="flex flex-col gap-1.5 rounded-lg border border-line"
            data-testid="feature-group"
            data-group={group}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-raised px-3 py-2">
              <h2 className="m-0 text-[13px] font-medium text-ink">{group}</h2>
              <div role="group" aria-label={`${group}: every feature`} className="flex items-center gap-2">
                {groupValue === "mixed" && <span className="text-[11px] text-muted">Mixed</span>}
                <SegmentedControl
                  tone="chip"
                  options={options}
                  value={groupValue === "mixed" ? ("" as StateChoice) : groupValue}
                  onChange={(state) => apply(features.map((feature) => ({ featureId: feature.id, state })))}
                />
              </div>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {features.map((feature) => (
                <li
                  key={feature.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-1.5 text-[13px]"
                  data-testid="feature-row"
                  data-feature={feature.id}
                  data-state={stateOf(feature)}
                >
                  <span className="flex flex-col">
                    <span className="text-ink">{feature.label}</span>
                    <span className="font-mono text-[11px] text-faint">
                      {feature.id}
                      {site &&
                        stateOf(feature) === "site" &&
                        site[feature.id] &&
                        site[feature.id] !== "on" &&
                        ` · the site says ${site[feature.id]}`}
                    </span>
                  </span>
                  <div role="group" aria-label={feature.label}>
                    <SegmentedControl
                      tone="chip"
                      options={options}
                      value={stateOf(feature)}
                      onChange={(state) => apply([{ featureId: feature.id, state }])}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
