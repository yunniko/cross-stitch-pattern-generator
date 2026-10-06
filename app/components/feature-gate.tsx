"use client";

import type { ReactNode } from "react";
import { lockedNote } from "@/lib/features/features";
import { useFeature } from "../features/features-context";
import { featureById } from "../features/registry";

/**
 * A control under a feature switch (G-102). Hidden: nothing is drawn. Locked: the control is drawn greyed and inert, with
 * the note saying why, so the person sees what there is without being able to press it. On: the children as they are.
 *
 * For a single button, `featureButtonProps` gives the same as attributes, so a list of buttons can leave the hidden ones
 * out and grey the locked ones in place.
 */
export function FeatureGate({ id, children }: { id: string | null; children: ReactNode }) {
  const { state } = useFeature(id);
  if (state === "hidden") return null;
  if (state === "on") return <>{children}</>;
  const note = lockedNote(featureById(id!).label);
  return (
    <div inert data-feature-locked={id} title={note} aria-disabled="true" className="relative opacity-45 select-none">
      {children}
    </div>
  );
}

/**
 * An action run from a control outside the command table, under the switch of the command it is (G-103, D313): null
 * when hidden, so the control is absent; `locked` is the note when locked, and the control is greyed with it. Made by
 * `gatedAction` in `app/commands/registry.ts` from the command's gate, so the refusal is the command table's own.
 */
export type GatedAction = { run: () => void; locked?: string } | null;

/** For one control: null when it is hidden, else the attributes a locked control carries (none when it is on). */
export function lockedControlProps(
  state: "on" | "locked" | "hidden",
  id: string
): null | { disabled?: true; title?: string; "data-feature-locked"?: string } {
  if (state === "hidden") return null;
  if (state === "on") return {};
  return { disabled: true, title: lockedNote(featureById(id).label), "data-feature-locked": id };
}
