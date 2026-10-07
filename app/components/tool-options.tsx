"use client";

import { Fragment } from "react";
import type { OptionValue } from "@/lib/editor/tool-options";
import type { ToolOption } from "../tools/options";
import { SegmentedControl } from "./ui";

/**
 * The options of the tool in hand (G-093): drawn from what the tool declares, with nothing here that knows a tool or an
 * option by name. Options with one heading are drawn together; the heading names the group for a screen reader but is
 * not written on the bar (Owner, 2026-10-07, G-118: the bar shows controls, not their names).
 */
export interface ToolOptionsProps {
  options: readonly ToolOption[];
  valueOf: (option: ToolOption) => OptionValue;
  onChange: (option: ToolOption, value: OptionValue) => void;
}

function Control({ option, value, onChange }: { option: ToolOption; value: OptionValue; onChange: (value: OptionValue) => void }) {
  const shown = (candidate: OptionValue) => option.choices?.find((choice) => choice.value === candidate);
  if (option.control === "select") {
    return (
      <select
        aria-label={option.label}
        title={option.title}
        value={String(value)}
        // The list holds text; the value handed on is the option's own, a number where the option's values are numbers.
        onChange={(e) => onChange(option.values.find((candidate) => String(candidate) === e.target.value) ?? option.defaultValue)}
        className="rounded-md border border-line bg-sunken px-1.5 py-1 text-xs text-ink"
      >
        {option.values.map((candidate) => (
          <option key={String(candidate)} value={String(candidate)}>
            {shown(candidate)?.label ?? String(candidate)}
          </option>
        ))}
      </select>
    );
  }
  if (option.control === "segments") {
    return (
      // The row of buttons carries the option's name, as the list it may replace did.
      <div role="group" aria-label={option.label} title={option.title}>
        <SegmentedControl
          tone="chip"
          options={option.values.map((candidate) => ({
            value: String(candidate),
            label: shown(candidate)?.label ?? String(candidate),
            title: shown(candidate)?.title,
          }))}
          value={String(value)}
          onChange={(picked) => onChange(option.values.find((candidate) => String(candidate) === picked) ?? option.defaultValue)}
        />
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-label={option.label} className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
      {option.values.map((candidate) => {
        const title = shown(candidate)?.title ?? String(candidate);
        return (
          <button
            key={String(candidate)}
            type="button"
            role="radio"
            aria-checked={value === candidate}
            aria-label={shown(candidate)?.name ?? title}
            title={title}
            onClick={() => onChange(candidate)}
            className={`flex h-6 w-7 items-center justify-center rounded-md transition-colors ${
              value === candidate ? "bg-accent text-on-accent" : "text-muted hover:text-ink"
            }`}
          >
            {shown(candidate)?.label ?? String(candidate)}
          </button>
        );
      })}
    </div>
  );
}

export function ToolOptions({ options, valueOf, onChange }: ToolOptionsProps) {
  const groups: Array<{ name: string; separated: boolean; options: ToolOption[] }> = [];
  for (const option of options) {
    const group = groups.find((candidate) => candidate.name === option.group);
    if (group) group.options.push(option);
    else groups.push({ name: option.group, separated: option.separated === true, options: [option] });
  }
  return (
    <>
      {groups.map((group) => (
        <Fragment key={group.name}>
          {group.separated && <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />}
          <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={group.name}>
            {group.options.map((option) => (
              <Control key={option.id} option={option} value={valueOf(option)} onChange={(value) => onChange(option, value)} />
            ))}
          </div>
        </Fragment>
      ))}
    </>
  );
}
