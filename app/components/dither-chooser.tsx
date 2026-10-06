"use client";

import { DITHER_LABELS, ditherFeature } from "@/lib/pipeline/dither-labels";
import { useGatedOptions } from "../features/features-context";
import {
  DIFFUSION_DITHER_MODES,
  builtDitherPicture,
  DRAWN_DITHER_MODES,
  isLinesMode,
  LINE_DITHER_MODES,
  ORDERED_DITHER_MODES,
  type DitherMode,
} from "@/lib/pipeline/dither";

/**
 * The choice of dither pattern, as pictures to press (G-095 M4; it was a list). Each picture is the pattern itself over
 * the same small dark-to-light ramp, so the patterns can be told apart before one is chosen; the larger preview under
 * the chooser then shows the chosen one larger.
 *
 * The line screens are one picture: their direction is a setting under the chooser, not four pictures in it (G-059).
 */

/** One entry stands for the four line screens. */
export const LINES_CHOICE = "lines";
export type DitherChoice = DitherMode | typeof LINES_CHOICE;

// Three groups, as the measurement separates them (`docs/reviews/2026-09-21-dithering-comparison.md`): a screen clusters
// its stitches and costs a stitcher least, a scattered matrix spreads them and fits the photo closer, and the two kernels
// adapt to the photo instead of repeating a tile; the drawn marks are a family of their own. The group is each picture's
// longer name.
const SCREEN_MODES = ORDERED_DITHER_MODES.filter((mode) => mode.startsWith("clustered-") || mode.startsWith("ring-"));
const SCATTERED_MODES = ORDERED_DITHER_MODES.filter((mode) => mode.startsWith("bayer-") || mode.startsWith("blue-noise-"));

const CHOICES: ReadonlyArray<{
  value: DitherChoice;
  choice: DitherChoice;
  label: string;
  group: string;
  draws: DitherMode;
  disabled?: boolean;
  title?: string;
}> = [
  { value: "off", choice: "off", label: DITHER_LABELS.off, group: "No dithering: each stitch takes its nearest thread", draws: "off" },
  ...SCREEN_MODES.map((mode) => ({
    value: mode,
    choice: mode,
    label: DITHER_LABELS[mode],
    group: "Screens — fewest single stitches",
    draws: mode,
  })),
  { value: LINES_CHOICE, choice: LINES_CHOICE, label: "Lines", group: "Screens — fewest single stitches", draws: LINE_DITHER_MODES[2] },
  ...SCATTERED_MODES.map((mode) => ({
    value: mode,
    choice: mode,
    label: DITHER_LABELS[mode],
    group: "Scattered — closer to the photo",
    draws: mode,
  })),
  ...DIFFUSION_DITHER_MODES.map((mode) => ({
    value: mode,
    choice: mode,
    label: DITHER_LABELS[mode],
    group: "Error diffusion — closest, never worse",
    draws: mode,
  })),
  ...DRAWN_DITHER_MODES.map((mode) => ({
    value: mode,
    choice: mode,
    label: DITHER_LABELS[mode],
    group: "Drawn — marks, not a pattern",
    draws: mode,
  })),
];

/** A pattern over the ramp, top dark to bottom light: a picture built into the app by the Rust that makes charts (G-100). */
function TilePicture({ mode }: { mode: DitherMode }) {
  // eslint-disable-next-line @next/next/no-img-element -- a 24-pixel picture shown pixelated; nothing to optimise.
  return (
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
  /** A pattern was pressed; pressing Lines gives the first line screen, and the direction is chosen under the chooser. */
  onChange: (mode: DitherMode) => void;
}

export function DitherChooser({ value, onChange }: DitherChooserProps) {
  // Under the feature switches (G-102): each pattern is a feature; the four line screens are one.
  const choices = useGatedOptions(CHOICES, (choice) => ditherFeature(choice === LINES_CHOICE ? LINE_DITHER_MODES[0] : choice));
  const chosen: DitherChoice = isLinesMode(value) ? LINES_CHOICE : value;
  return (
    <div role="radiogroup" aria-label="Dither" className="grid grid-cols-5 gap-1">
      {choices.map(({ choice, label, group, draws, disabled, title }) => {
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
            data-feature-locked={disabled ? ditherFeature(draws) : undefined}
            title={title ?? `${label}. ${group}`}
            onClick={() => onChange(choice === LINES_CHOICE ? LINE_DITHER_MODES[0] : choice)}
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
