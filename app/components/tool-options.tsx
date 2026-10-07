"use client";

import type { OptionValue } from "@/lib/editor/tool-options";
import type { ToolOption } from "../tools/options";
import { SkinIcon } from "../skin/skin";
import { BarMenu } from "./bar-menu";
import type { FitItem } from "./fit-track";
import { SegmentedControl } from "./ui";

/**
 * The options of the tool in hand (G-093): drawn from what the tool declares, with nothing here that knows a tool or an
 * option by name. Options with one heading are drawn together; the heading names the group for a screen reader but is
 * not written on the bar (Owner, 2026-10-07, G-118: the bar shows controls, not their names).
 *
 * Each group is one piece of the bar's fit (G-118, D340): whole, compact (every row of choices becomes one button showing
 * the current choice and opening the row; a list is compact already), or in More. A tool's options are kept whole
 * longest, and of them the first, the ones the tool is used for.
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

/** How important a tool's own options are on the bar, against the shared ones (D340). */
export const OWN_OPTIONS = 3;

/** One option as a button showing its current choice, opening the whole row under it (G-118). */
function CompactControl({ option, value, onChange }: { option: ToolOption; value: OptionValue; onChange: (value: OptionValue) => void }) {
  if (option.control === "select") return <Control option={option} value={value} onChange={onChange} />;
  const current = option.choices?.find((choice) => choice.value === value);
  const currentName = current?.name ?? (typeof current?.label === "string" ? current.label : String(value));
  return (
    <BarMenu
      label={`${option.label}: ${currentName}`}
      title={option.title ? `${option.title} — ${currentName}` : undefined}
      trigger={
        <>
          <span className="flex items-center">{current?.label ?? String(value)}</span>
          <SkinIcon name="chevron-down" />
        </>
      }
    >
      {(close) => (
        <Control
          option={option}
          value={value}
          onChange={(picked) => {
            onChange(picked);
            close();
          }}
        />
      )}
    </BarMenu>
  );
}

export function toolOptionItems(
  options: readonly ToolOption[],
  valueOf: (option: ToolOption) => OptionValue,
  onChange: (option: ToolOption, value: OptionValue) => void
): FitItem[] {
  const groups: Array<{ name: string; separated: boolean; options: ToolOption[] }> = [];
  for (const option of options) {
    const group = groups.find((candidate) => candidate.name === option.group);
    if (group) group.options.push(option);
    else groups.push({ name: option.group, separated: option.separated === true, options: [option] });
  }
  const compactable = (group: (typeof groups)[number]) => group.options.some((option) => option.control !== "select");
  return groups.map((group, index) => ({
    id: `option-group-${group.name}`,
    importance: OWN_OPTIONS,
    // The first group follows the shared options with a divider, as the whole set did; a later one where it asks for it.
    divided: index === 0 || group.separated,
    name: group.name,
    full: (
      <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={group.name}>
        {group.options.map((option) => (
          <Control key={option.id} option={option} value={valueOf(option)} onChange={(value) => onChange(option, value)} />
        ))}
      </div>
    ),
    compact: compactable(group) ? (
      <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={group.name}>
        {group.options.map((option) => (
          <CompactControl key={option.id} option={option} value={valueOf(option)} onChange={(value) => onChange(option, value)} />
        ))}
      </div>
    ) : undefined,
  }));
}
