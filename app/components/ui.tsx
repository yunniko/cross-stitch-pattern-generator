import type { ButtonHTMLAttributes, ReactNode } from "react";

// Shared control styling, so a fix (dark-mode hover, D81) lands on every
// instance at once instead of on 20 copies of the same class string.

type PillVariant = "outline" | "primary";
type PillSize = "xs" | "sm" | "md" | "lg";

const PILL_BASE = "rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const PILL_VARIANTS: Record<PillVariant, string> = {
  outline: "border border-zinc-300 hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]",
  primary: "bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc]",
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
  return <button type={type} className={[PILL_BASE, PILL_VARIANTS[variant], PILL_SIZES[size], className].filter(Boolean).join(" ")} {...props} />;
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** A row of mutually exclusive buttons; the selected one is filled. */
export function SegmentedControl<T extends string>({ options, value, onChange, className }: SegmentedControlProps<T>) {
  return (
    <div className={["flex items-center overflow-hidden rounded border border-zinc-300 dark:border-zinc-700", className].filter(Boolean).join(" ")}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`px-2 py-0.5 text-sm transition-colors ${
            option.value === value ? "bg-foreground text-background" : "hover:bg-black/[.04] dark:hover:bg-white/[.08]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Full-width message strip under the top bar. */
export function NoticeBar({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  const toneClass =
    tone === "error"
      ? "border-red-300 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
      : "border-zinc-300 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900";
  return <p className={`border-b px-4 py-1 text-xs ${toneClass}`}>{children}</p>;
}

/** The white strip used for the options, selection and resize panels. */
export function PanelBar({ children, gap = "gap-4" }: { children: ReactNode; gap?: string }) {
  return <div className={`flex flex-wrap items-center ${gap} border-b border-zinc-300 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900`}>{children}</div>;
}
