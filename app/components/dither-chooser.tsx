"use client";

import { useGatedOptions } from "../features/features-context";
import { DITHER_CHOICES, DITHER_PATTERNS } from "@/lib/pipeline/dither-patterns";
import { builtDitherPicture, ditherChoiceOf, ditherFeature, ditherGroupLabel, isDithered, type DitherMode } from "@/lib/pipeline/dither";

/**
 * The choice of dither pattern, as pictures to press (G-095 M4; it was a list). Each picture is the pattern itself over
 * the same small dark-to-light ramp, so the patterns can be told apart before one is chosen; the larger preview under
 * the chooser then shows the chosen one larger.
 *
 * Drawn from the patterns' declarations (G-100, D328): one picture per pattern, in the order Rust lists them, except that
 * patterns sharing a choice (the four line screens, G-059) are one picture, whose variant is chosen under the chooser.
 * The group is each picture's longer name.
 */

interface Choice {
  /** The pattern's id, or the shared choice's. */
  choice: string;
  label: string;
  group: string;
  /** What pressing it chooses: Off, the pattern, or a shared choice's first variant. */
  value: DitherMode;
  /** Whose picture it shows. */
  draws: DitherMode;
  disabled?: boolean;
  title?: string;
}

function choices(): Choice[] {
  const offered: Choice[] = [
    {
      choice: "off",
      label: "Off",
      group: "No dithering: each stitch takes its nearest thread",
      value: "off",
      draws: "off",
    },
  ];
  for (const pattern of DITHER_PATTERNS) {
    const shared = pattern.variant === null ? undefined : DITHER_CHOICES.find((c) => c.id === pattern.variant!.choice);
    if (shared && offered.some((o) => o.choice === shared.id)) continue;
    offered.push({
      choice: shared?.id ?? pattern.id,
      label: shared?.label ?? pattern.label,
      group: ditherGroupLabel(pattern.group),
      value: pattern.id,
      draws: shared?.picturedBy ?? pattern.id,
    });
  }
  return offered;
}

const CHOICES = choices();

/** A pattern over the ramp, top dark to bottom light: a picture built into the app by the Rust that makes charts (G-100). */
function TilePicture({ mode }: { mode: DitherMode }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 24-pixel picture shown pixelated; nothing to optimise.
    <img
      src={builtDitherPicture(mode, "tile")}
      alt=""
      width={24}
      height={24}
      aria-hidden="true"
      className="h-12 w-12 rounded [image-rendering:pixelated]"
    />
  );
}

export interface DitherChooserProps {
  value: DitherMode;
  /** A pattern was pressed; pressing a shared choice gives its first variant, and the variant is chosen under the chooser. */
  onChange: (mode: DitherMode) => void;
}

export function DitherChooser({ value, onChange }: DitherChooserProps) {
  // Under the feature switches (G-102): each choice is a feature; a shared choice is one.
  const gated = useGatedOptions(CHOICES, (value) => ditherFeature(value));
  const chosen = isDithered(value) ? ditherChoiceOf(value) : "off";
  return (
    <div role="radiogroup" aria-label="Dither" className="grid grid-cols-5 gap-1">
      {gated.map(({ choice, label, group, value: mode, draws, disabled, title }) => {
        const selected = choice === chosen;
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            data-mode={choice}
            disabled={disabled}
            data-feature-locked={disabled ? ditherFeature(mode) : undefined}
            title={title ?? `${label}. ${group}`}
            onClick={() => onChange(mode)}
            className={`flex flex-col items-center gap-1 rounded-md border px-0.5 pt-1.5 pb-1 transition-colors disabled:opacity-45 ${
              selected ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:bg-raised hover:text-ink"
            }`}
          >
            <TilePicture mode={draws} />
            <span className="text-center text-[10px] leading-[12px]">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
