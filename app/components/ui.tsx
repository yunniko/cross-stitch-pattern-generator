import type { ButtonHTMLAttributes, ReactNode } from "react";

// Shared control styling, so a fix lands on every instance at once instead of on 20 copies of the same class string
// (D81). Restyled to Atelier in G-045 M1: the shapes come from direction 1b, which uses small radii rather than pills,
// and every colour is a token from globals.css.

type PillVariant = "outline" | "primary" | "raised";
type PillSize = "xs" | "sm" | "md" | "lg";

/**
 * One disabled look per control shape, so a group of controls never shows two of them -- a row where three read dead
 * and one reads clickable is worse than all four being wrong together (Owner, 2026-09-18). 1b fades a disabled *icon*
 * to 40%, because an icon has no text to dim, and drops a disabled *label* to --at-faint. See D164.
 *
 * Both must also stop answering the pointer. A hover that still lights is the loudest "clickable" signal a control
 * has, so every hover on a control that can be disabled is written `enabled:hover:` -- the rule then cannot apply to
 * a disabled control at all, rather than being overridden back out by a matching `disabled:hover:`.
 */
export const DISABLED_ICON = "disabled:cursor-not-allowed disabled:opacity-40";
export const DISABLED_TEXT = "disabled:cursor-not-allowed disabled:text-faint";

const PILL_BASE = `rounded-md font-medium transition-colors ${DISABLED_TEXT}`;
const PILL_VARIANTS: Record<PillVariant, string> = {
  outline: "border border-line text-ink enabled:hover:bg-raised",
  // A filled button cannot say "disabled" with text colour alone -- the accent keeps shouting -- so the fill goes too.
  primary: "bg-accent text-on-accent enabled:hover:bg-accent-hover disabled:bg-control",
  // The middle weight 1b gives an action that matters but is not the primary one -- its Export button beside Export all.
  raised: "border border-control-line bg-control text-ink enabled:hover:bg-control-hover",
};
const PILL_SIZES: Record<PillSize, string> = {
  xs: "px-2 py-0.5 text-xs",
  sm: "px-3 py-1 text-sm",
  md: "px-4 py-1.5 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

export interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant;
  size?: PillSize;
}

export function PillButton({ variant = "outline", size = "sm", className, type = "button", ...props }: PillButtonProps) {
  return (
    <button type={type} className={[PILL_BASE, PILL_VARIANTS[variant], PILL_SIZES[size], className].filter(Boolean).join(" ")} {...props} />
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /**
   * 1b uses two shapes for the same idea. "wash" is the full-width row of settings segments, divided by hairlines,
   * where the chosen one is washed in the accent. "chip" is the compact switch in the context bar, where the chosen
   * one is a solid accent chip floating inside a bordered track.
   */
  tone?: "wash" | "chip";
  /** Stretches each segment to share the width equally, as the settings rows in the inspector do. */
  fill?: boolean;
}

/** A row of mutually exclusive buttons; the selected one is marked. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  tone = "wash",
  fill = false,
}: SegmentedControlProps<T>) {
  const isChip = tone === "chip";
  const track = isChip
    ? "flex items-center gap-0.5 rounded-lg border border-line p-0.5"
    : "flex items-center overflow-hidden rounded-lg border border-line";
  return (
    <div className={[track, className].filter(Boolean).join(" ")}>
      {options.map((option, index) => {
        const selected = option.value === value;
        const shape = isChip
          ? `rounded-md px-2.5 py-1 ${selected ? "bg-accent text-on-accent font-medium" : "text-muted enabled:hover:text-ink"}`
          : `px-3 py-1.5 ${index > 0 ? "border-l border-line" : ""} ${selected ? "bg-accent/15 text-ink font-medium" : "text-muted enabled:hover:bg-raised enabled:hover:text-ink"}`;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            disabled={option.disabled}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`text-xs transition-colors ${DISABLED_TEXT} ${fill ? "flex-1" : ""} ${shape}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Full-width message strip. */
export function NoticeBar({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  const toneClass = tone === "error" ? "border-red-900 bg-red-950/60 text-red-300" : "border-line bg-surface text-muted";
  return <p className={`border-b px-4 py-1 text-xs ${toneClass}`}>{children}</p>;
}

/** The chrome strip used for the options, selection and resize panels. */
export function PanelBar({ children, gap = "gap-4" }: { children: ReactNode; gap?: string }) {
  return <div className={`flex flex-wrap items-center ${gap} border-b border-line bg-surface px-4 py-3`}>{children}</div>;
}
