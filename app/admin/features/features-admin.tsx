"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PillButton } from "@/app/components/ui";
import {
  attachSetToTierAction,
  createFeatureSetAction,
  createTierAction,
  deleteFeatureSetAction,
  setFeatureSetEntriesAction,
  setAudienceSetAction,
  setSiteFeaturesAction,
} from "@/lib/admin/feature-actions";
import type { ActionResult } from "@/lib/admin/feature-actions";
import type { FeatureState } from "@/lib/features/features";
import { FeatureStatesEditor } from "./feature-states-editor";
import { LimitsEditor, type LimitLayerRow } from "./limits-editor";

export interface FeaturesAdminProps {
  site: Record<string, FeatureState>;
  sets: Array<{ id: string; name: string; entries: Record<string, FeatureState>; tiers: string[]; audiences: string[] }>;
  /** The set for "guests" and for "accounts", by audience. */
  audiences: Record<string, string>;
  tiers: Array<{ id: string; name: string; featureSetId: string | null; people: number }>;
  changes: Array<{ id: string; scope: string; change: string; by: string; at: string }>;
  /** The limits each layer gives (G-108 M1): the site, guests, accounts and each tier. */
  limits: LimitLayerRow[];
}

const FIELD = "rounded-md border border-control-line bg-control px-3 py-1.5 text-sm text-ink outline-none focus:border-accent";
const H1 = "m-0 text-lg font-semibold text-ink";
const H2 = "m-0 text-base font-medium text-ink";

export function FeaturesAdmin({ site, sets, tiers, changes, audiences, limits }: FeaturesAdminProps) {
  const [section, setSection] = useState<"site" | "audiences" | "sets" | "tiers" | "limits" | "changes">("site");
  const [chosenSet, setChosenSet] = useState<string | null>(sets[0]?.id ?? null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = sets.find((candidate) => candidate.id === chosenSet) ?? null;

  function run(action: () => Promise<ActionResult>, then?: (result: ActionResult) => void) {
    setProblem(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setProblem(result.error);
      else then?.(result);
    });
  }

  const tab = (id: typeof section, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={section === id}
      onClick={() => setSection(id)}
      className={`border-b-2 px-3 py-2 text-sm ${section === id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className={H1}>Features</h1>
      <p className="m-0 text-[13px] text-muted">
        Every feature of the editor, in its group. <strong className="font-medium text-ink">On</strong> is offered and usable,{" "}
        <strong className="font-medium text-ink">Locked</strong> is shown greyed with a note and refused,{" "}
        <strong className="font-medium text-ink">Hidden</strong> is absent. A person&apos;s own state wins over their tier&apos;s set, which
        wins over the set for guests or for signed-in accounts, which wins over the site. A new feature appears here by being declared where
        it lives.
      </p>
      <div role="tablist" aria-label="Features admin" className="flex border-b border-line">
        {tab("site", "The site")}
        {tab("audiences", "Guests and accounts")}
        {tab("sets", `Feature sets (${sets.length})`)}
        {tab("tiers", `Tiers (${tiers.length})`)}
        {tab("limits", "Limits")}
        {tab("changes", "Changes")}
      </div>
      <ol
        aria-label="Which state wins"
        className="m-0 flex list-none flex-wrap items-center gap-2 p-0 text-xs"
        data-testid="feature-ladder"
      >
        {["A person's own", "Their tier's set", "The set for guests or accounts", "The site"].map((step, i, steps) => (
          <li key={step} className="flex items-center gap-2">
            <span className="rounded-md border border-line px-2 py-0.5 text-ink">{step}</span>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="text-faint">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
      {problem && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {problem}
        </p>
      )}

      {section === "site" && (
        <FeatureStatesEditor testId="site-features" states={site} choices={["on", "locked", "hidden"]} onChange={setSiteFeaturesAction} />
      )}

      {section === "sets" && (
        <div className="flex flex-col gap-4">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement;
              const name = input.value;
              run(
                () => createFeatureSetAction(name),
                (result) => {
                  if (result.id) setChosenSet(result.id);
                  input.value = "";
                }
              );
            }}
          >
            <input name="name" aria-label="New set's name" placeholder="A name for a new set" className={FIELD} maxLength={60} required />
            <PillButton type="submit" size="sm" disabled={pending}>
              Make a set
            </PillButton>
          </form>
          {sets.length > 0 && (
            <div role="tablist" aria-label="Feature sets" className="flex flex-wrap gap-1.5">
              {sets.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  role="tab"
                  aria-selected={candidate.id === chosenSet}
                  onClick={() => setChosenSet(candidate.id)}
                  className={`rounded-md border px-2.5 py-1 text-[13px] ${
                    candidate.id === chosenSet ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:text-ink"
                  }`}
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          )}
          {set ? (
            <div className="flex flex-col gap-3" data-testid="feature-set" data-set={set.name}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={H2}>{set.name}</h2>
                <span className="text-[12px] text-muted">
                  {[...set.audiences.map((audience) => (audience === "guests" ? "guests" : "accounts")), ...set.tiers].length === 0
                    ? "Nobody is given it"
                    : `Given to: ${[...set.audiences.map((audience) => (audience === "guests" ? "guests" : "signed-in accounts")), ...set.tiers.map((tier) => `tier ${tier}`)].join(", ")}`}
                </span>
                <PillButton
                  size="xs"
                  variant="outline"
                  disabled={pending || set.tiers.length > 0 || set.audiences.length > 0}
                  onClick={() => run(() => deleteFeatureSetAction(set.id))}
                >
                  Delete the set
                </PillButton>
              </div>
              <p className="m-0 text-[12px] text-muted">
                A feature set to &ldquo;As the site&rdquo; has no entry here: a person on the tier gets what the site says for it.
              </p>
              <FeatureStatesEditor
                key={set.id}
                testId="set-features"
                states={set.entries}
                site={site}
                choices={["site", "on", "locked", "hidden"]}
                onChange={(entries) => setFeatureSetEntriesAction(set.id, entries)}
              />
            </div>
          ) : (
            <p className="m-0 text-[13px] text-muted">No feature set yet. A set is what a tier gives the people on it.</p>
          )}
        </div>
      )}

      {section === "audiences" && (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[13px] text-muted">
            A feature set for everyone who is not signed in, and one for everyone who is. Each sits between the site and a tier: a
            person&apos;s own state wins over their tier&apos;s set, which wins over these, which win over the site. Make the sets under
            Feature sets.
          </p>
          <table className="w-full max-w-xl text-left text-sm">
            <tbody>
              {(
                [
                  ["guests", "Guests (not signed in)"],
                  ["accounts", "Signed-in accounts"],
                ] as const
              ).map(([audience, label]) => (
                <tr key={audience} className="border-b border-line last:border-0" data-testid="audience-row" data-audience={audience}>
                  <td className="px-3 py-2 text-ink">{label}</td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Feature set for ${label}`}
                      value={audiences[audience] ?? ""}
                      disabled={pending}
                      onChange={(event) => run(() => setAudienceSetAction(audience, event.target.value || null))}
                      className={FIELD}
                    >
                      <option value="">No set: the site&apos;s states</option>
                      {sets.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section === "tiers" && (
        <div className="flex flex-col gap-4">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement;
              const name = input.value;
              run(
                () => createTierAction(name),
                () => {
                  input.value = "";
                }
              );
            }}
          >
            <input name="name" aria-label="New tier's name" placeholder="A name for a new tier" className={FIELD} maxLength={60} required />
            <PillButton type="submit" size="sm" disabled={pending}>
              Make a tier
            </PillButton>
          </form>
          <p className="m-0 text-[12px] text-muted">
            A tier is what a subscription is to; nothing is sold yet. Each tier gives its people one feature set, or none.
          </p>
          {tiers.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">No tier yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[13px] text-muted">
                  <th className="px-3 py-2 font-medium">Tier</th>
                  <th className="px-3 py-2 font-medium">People</th>
                  <th className="px-3 py-2 font-medium">Feature set</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tier.id} className="border-b border-line last:border-0" data-testid="tier-row" data-tier={tier.name}>
                    <td className="px-3 py-2 text-ink">{tier.name}</td>
                    <td className="px-3 py-2 text-muted">{tier.people}</td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`Feature set of ${tier.name}`}
                        value={tier.featureSetId ?? ""}
                        disabled={pending}
                        onChange={(event) => run(() => attachSetToTierAction(tier.id, event.target.value || null))}
                        className={FIELD}
                      >
                        <option value="">No set: the site&apos;s states</option>
                        {sets.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {section === "limits" && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[13px] text-muted">
            How much the server lets a person have. A person&apos;s own value wins over their tier&apos;s, which wins over the value for
            signed-in accounts, which wins over the site&apos;s; a person&apos;s own is set on their page under Users.
          </p>
          <LimitsEditor testId="limits" rows={limits} />
        </div>
      )}

      {section === "changes" && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[12px] text-muted">
            The latest thirty feature changes, newest first. Every admin change, roles and logins too, is in the{" "}
            <Link href="/admin/changes" className="text-accent hover:underline">
              Change log
            </Link>
            .
          </p>
          {changes.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">No change yet.</p>
          ) : (
            <ul
              className="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line p-0"
              data-testid="feature-changes"
            >
              {changes.map((change) => (
                <li key={change.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5 text-[13px]">
                  <span className="font-mono text-[11px] text-faint">{change.at.replace("T", " ").slice(0, 16)}</span>
                  <span className="text-[11px] tracking-wide text-muted uppercase">{change.scope}</span>
                  <span className="text-ink">{change.change}</span>
                  <span className="text-[12px] text-muted">by {change.by}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
