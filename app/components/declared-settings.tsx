"use client";

import { DRAWN_SETTINGS, drawnSettingValues, type ExtraSettings } from "@/lib/pipeline/generation-settings";
import { generationSettingFeature } from "../features/registry";
import { FeatureGate } from "./feature-gate";

/**
 * The generation settings no control was written for (G-099, D294): each is drawn from its declaration, by its kind. A
 * setting declared with a `control` in `lib/pipeline/generation-settings.ts` appears here, is kept with the browser's
 * other settings and is sent with the next Generate, with nothing else edited.
 *
 * A setting that deserves a control of its own (a picker, a preview, a hint that depends on the picture) gets one in the
 * photo settings and is declared without `control`. Nothing is declared that way today, so this draws nothing.
 */
export interface DeclaredSettingsProps {
  values: ExtraSettings;
  onChange: (next: ExtraSettings) => void;
  /** The class of the section's heading, the photo settings' own. */
  headingClass: string;
}

export function DeclaredSettings({ values, onChange, headingClass }: DeclaredSettingsProps) {
  if (DRAWN_SETTINGS.length === 0) return null;
  const current = drawnSettingValues(values);
  const set = (id: string, value: boolean | number | string) => onChange({ ...values, [id]: value });

  return (
    <section className="flex flex-col gap-2">
      <span className={headingClass}>More</span>
      {DRAWN_SETTINGS.map((setting) => (
        // Under the feature switches (G-102): a drawn setting is a feature by its declaration, like any other.
        <FeatureGate key={setting.id} id={generationSettingFeature(setting)}>
          {drawn(setting, current[setting.id], set)}
        </FeatureGate>
      ))}
    </section>
  );
}

/** One setting's control, by its kind. */
function drawn(
  setting: (typeof DRAWN_SETTINGS)[number],
  value: boolean | number | string,
  set: (id: string, value: boolean | number | string) => void
) {
  const { label, hint } = setting.control;
  if (setting.kind === "flag") {
    return (
      <label key={setting.id} className="flex items-center justify-between gap-3 text-[13px]" title={hint}>
        {label}
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => set(setting.id, e.target.checked)}
          className="h-4 w-4 shrink-0 accent-[var(--at-accent)]"
        />
      </label>
    );
  }
  if (setting.kind === "unit") {
    const tenths = Math.round((typeof value === "number" ? value : 0) * 10);
    return (
      <div key={setting.id} className="flex flex-col gap-0.5" title={hint}>
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-muted">{label}</span>
          <span className="font-mono text-[11px] text-ink">{tenths}</span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          value={tenths}
          aria-label={label}
          onChange={(e) => set(setting.id, Number(e.target.value) / 10)}
          className="min-w-0 accent-[var(--at-accent)]"
        />
      </div>
    );
  }
  if (setting.kind === "choice") {
    return (
      <label key={setting.id} className="flex items-center justify-between gap-3 text-[13px]" title={hint}>
        {label}
        <select
          value={String(value)}
          onChange={(e) => set(setting.id, e.target.value)}
          className="rounded-md border border-line bg-sunken px-2 py-1 text-xs text-ink"
        >
          {setting.values.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return null;
}
