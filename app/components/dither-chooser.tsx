"use client";

import { useEffect, useRef } from "react";
import {
  DIFFUSION_DITHER_MODES,
  DRAWN_DITHER_MODES,
  ditherRampWindow,
  isLinesMode,
  LINE_DITHER_MODES,
  ORDERED_DITHER_MODES,
  type DitherMode,
} from "@/lib/pipeline/dither";

/**
 * The choice of dither pattern, as pictures to press (G-095 M4; it was a list). Each picture is the pattern itself over
 * the same small dark-to-light ramp, so the patterns can be told apart before one is chosen; the larger preview under
 * the chooser then shows the chosen one as the chart in hand would have it.
 *
 * The line screens are one picture: their direction is a setting under the chooser, not four pictures in it (G-059).
 */

/** One entry stands for the four line screens. */
export const LINES_CHOICE = "lines";
export type DitherChoice = DitherMode | typeof LINES_CHOICE;

export const DITHER_LABELS: Record<DitherMode, string> = {
  off: "Off",
  "bayer-4": "Bayer 4×4",
  "bayer-8": "Bayer 8×8",
  "clustered-8": "Clustered dots",
  "ring-8": "Rings",
  "lines-horizontal": "Lines",
  "lines-vertical": "Lines",
  "lines-diagonal": "Lines",
  "lines-anti-diagonal": "Lines",
  "blue-noise-16": "Blue noise",
  "floyd-steinberg": "Floyd–Steinberg",
  atkinson: "Atkinson",
  "hand-drawn": "Hand-drawn",
};

// Three groups, as the measurement separates them (`docs/reviews/2026-09-21-dithering-comparison.md`): a screen clusters
// its stitches and costs a stitcher least, a scattered matrix spreads them and fits the photo closer, and the two kernels
// adapt to the photo instead of repeating a tile; the drawn marks are a family of their own. The group is each picture's
// longer name.
const SCREEN_MODES = ORDERED_DITHER_MODES.filter((mode) => mode.startsWith("clustered-") || mode.startsWith("ring-"));
const SCATTERED_MODES = ORDERED_DITHER_MODES.filter((mode) => mode.startsWith("bayer-") || mode.startsWith("blue-noise-"));

const CHOICES: ReadonlyArray<{ choice: DitherChoice; label: string; group: string; draws: DitherMode }> = [
  { choice: "off", label: DITHER_LABELS.off, group: "No dithering: each stitch takes its nearest thread", draws: "off" },
  ...SCREEN_MODES.map((mode) => ({ choice: mode, label: DITHER_LABELS[mode], group: "Screens — fewest single stitches", draws: mode })),
  { choice: LINES_CHOICE, label: "Lines", group: "Screens — fewest single stitches", draws: LINE_DITHER_MODES[2] },
  ...SCATTERED_MODES.map((mode) => ({ choice: mode, label: DITHER_LABELS[mode], group: "Scattered — closer to the photo", draws: mode })),
  ...DIFFUSION_DITHER_MODES.map((mode) => ({
    choice: mode,
    label: DITHER_LABELS[mode],
    group: "Error diffusion — closest, never worse",
    draws: mode,
  })),
  ...DRAWN_DITHER_MODES.map((mode) => ({ choice: mode, label: DITHER_LABELS[mode], group: "Drawn — marks, not a pattern", draws: mode })),
];

/** The side of a picture, in stitches; drawn at twice that. */
const TILE = 24;
const DARK = [29, 36, 48] as const;
const LIGHT = [242, 239, 230] as const;

/** A pattern over the ramp, top dark to bottom light; with dithering off, the ramp cut where the nearer thread changes. */
function TilePicture({ mode }: { mode: DitherMode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (!context) return;
    const labels =
      mode === "off"
        ? Uint8Array.from({ length: TILE * TILE }, (_, i) => (Math.floor(i / TILE) >= TILE / 2 ? 1 : 0))
        : ditherRampWindow(TILE, TILE, TILE, TILE, [[...DARK], [...LIGHT]], mode).labels;
    const image = context.createImageData(TILE, TILE);
    for (let i = 0; i < TILE * TILE; i++) {
      const [r, g, b] = labels[i] === 1 ? LIGHT : DARK;
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, [mode]);
  return <canvas ref={ref} width={TILE} height={TILE} aria-hidden="true" className="h-12 w-12 rounded [image-rendering:pixelated]" />;
}

export interface DitherChooserProps {
  value: DitherMode;
  /** A pattern was pressed; pressing Lines gives the first line screen, and the direction is chosen under the chooser. */
  onChange: (mode: DitherMode) => void;
}

export function DitherChooser({ value, onChange }: DitherChooserProps) {
  const chosen: DitherChoice = isLinesMode(value) ? LINES_CHOICE : value;
  return (
    <div role="radiogroup" aria-label="Dither" className="grid grid-cols-5 gap-1">
      {CHOICES.map(({ choice, label, group, draws }) => {
        const selected = choice === chosen;
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            data-mode={choice}
            title={`${label}. ${group}`}
            onClick={() => onChange(choice === LINES_CHOICE ? LINE_DITHER_MODES[0] : choice)}
            className={`flex flex-col items-center gap-1 rounded-md border px-0.5 pt-1.5 pb-1 transition-colors ${
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
