"use client";

import { useState, useTransition } from "react";
import { PillButton } from "@/app/components/ui";
import { setSiteSettingAction } from "@/lib/admin/setting-actions";

/** The admin's form for the site's settings (G-126 M2, D374): one row a setting; "Use default" removes the stored value. */

export interface SettingRow {
  id: string;
  label: string;
  note: string;
  unit: string;
  min: number;
  max: number;
  defaultValue: number;
  /** The stored value; null when the setting takes its default. */
  own: number | null;
  /** "2026-10-08 by a@example.com", when a value is stored. */
  updated: string | null;
}

const FIELD = "w-24 rounded-md border border-control-line bg-control px-3 py-1.5 text-sm text-ink outline-none focus:border-accent";

export function SettingsEditor({ rows }: { rows: SettingRow[] }) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4" data-testid="settings-editor">
      {problem && (
        <p role="alert" className="m-0 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {problem}
        </p>
      )}
      {rows.map((row) => (
        <SettingForm key={`${row.id}:${String(row.own)}`} row={row} onProblem={setProblem} />
      ))}
    </div>
  );
}

function SettingForm({ row, onProblem }: { row: SettingRow; onProblem: (problem: string | null) => void }) {
  const [text, setText] = useState(String(row.own ?? row.defaultValue));
  const [pending, startTransition] = useTransition();
  const effective = row.own ?? row.defaultValue;
  const save = (input: string) => {
    onProblem(null);
    startTransition(async () => {
      const result = await setSiteSettingAction(row.id, input);
      if (result.error) onProblem(result.error);
    });
  };
  return (
    <section
      className="flex max-w-3xl flex-col gap-2 rounded-lg border border-line bg-surface p-3.5"
      data-testid="setting"
      data-setting={row.id}
    >
      <h2 className="m-0 text-base font-medium text-ink">{row.label}</h2>
      <p className="m-0 text-[13px] text-muted">{row.note}</p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save(text.trim());
        }}
      >
        <input
          aria-label={`${row.label}, in ${row.unit}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className={FIELD}
          inputMode="numeric"
          maxLength={6}
        />
        <span className="text-sm text-muted">{row.unit}</span>
        <PillButton type="submit" size="sm" disabled={pending || text.trim() === String(effective)}>
          Set
        </PillButton>
        {row.own !== null && (
          <PillButton type="button" size="sm" disabled={pending} onClick={() => save("default")}>
            Use default
          </PillButton>
        )}
      </form>
      <p className="m-0 text-[12px] text-muted" data-testid="setting-effective" data-value={effective}>
        {row.own === null
          ? `Default: ${row.defaultValue} ${row.unit}.`
          : `Set to ${row.own} ${row.unit}${row.updated ? ` on ${row.updated}` : ""}; the default is ${row.defaultValue}.`}{" "}
        Between {row.min} and {row.max} {row.unit}.
      </p>
    </section>
  );
}
