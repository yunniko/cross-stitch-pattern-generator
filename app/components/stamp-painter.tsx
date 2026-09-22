"use client";

import { useState } from "react";
import { DITHER_TEXTURE_RANGES, type DitherStamp } from "@/lib/pipeline/dither-hand-drawn";
import { PillButton } from "./ui";

/**
 * The stamp painter (G-056 M2): a grid saying in which step each stitch of a mark fills.
 *
 * A click paints the current step; a click on a stitch that already holds it clears it back to never. What the stamp
 * does not name is not left out of the chart — those stitches fill after everything it does name, nearest the mark's
 * centre first — so a sketch is a shape, not a hole.
 */

const SIZES = [3, 5, 7, 9] as const;
/** More steps than this and a mark is a drawing, not a stamp; four is enough for a shape that grows. */
const STEPS = [1, 2, 3, 4] as const;

const STEP_COLOURS = ["#f2efe6", "#b9c6d6", "#7d90a6", "#4d5f75"];

export interface StampPainterProps {
  stamp: DitherStamp | undefined;
  onChange: (stamp: DitherStamp | undefined) => void;
  /** The marks' spacing, so the painter can say when a stamp is wider than the room a mark has. */
  spacing: number;
}

function emptyStamp(size: number): DitherStamp {
  return { size, order: new Array(size * size).fill(0) };
}

export function StampPainter({ stamp, onChange, spacing }: StampPainterProps) {
  const [step, setStep] = useState<number>(1);
  const current = stamp ?? emptyStamp(5);
  const painted = current.order.some((value) => value > 0);
  // A mark only owns the stitches nearest to it, so a stamp wider than the spacing has its outside clipped.
  const clipped = current.size > spacing;

  const paint = (index: number) => {
    const order = [...current.order];
    order[index] = order[index] === step ? 0 : step;
    onChange(order.some((value) => value > 0) ? { size: current.size, order } : undefined);
  };

  const resize = (size: number) => {
    // Keep what fits: a stamp re-sized from the centre out, so a shape is not lost by trying a bigger grid.
    const order = new Array(size * size).fill(0);
    const from = (current.size - 1) / 2;
    const to = (size - 1) / 2;
    for (let y = 0; y < current.size; y++) {
      for (let x = 0; x < current.size; x++) {
        const nx = x - from + to;
        const ny = y - from + to;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        order[ny * size + nx] = current.order[y * current.size + x];
      }
    }
    onChange(order.some((value) => value > 0) ? { size, order } : undefined);
  };

  return (
    <div className="flex flex-col gap-2" data-testid="stamp-painter">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted">Grid</span>
        {SIZES.filter((size) => size >= DITHER_TEXTURE_RANGES.stampSize[0] && size <= DITHER_TEXTURE_RANGES.stampSize[1]).map((size) => (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={current.size === size}
            aria-label={`${size} by ${size}`}
            onClick={() => resize(size)}
            className={`rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${
              current.size === size ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:bg-raised"
            }`}
          >
            {size}
          </button>
        ))}
      </div>

      <div className="flex items-start gap-3">
        <div
          data-testid="stamp-grid"
          className="grid shrink-0 gap-px rounded-md border border-line bg-line p-px"
          style={{ gridTemplateColumns: `repeat(${current.size}, 18px)` }}
        >
          {current.order.map((value, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Stitch ${(index % current.size) + 1}, ${Math.floor(index / current.size) + 1}${value > 0 ? `, step ${value}` : ""}`}
              aria-pressed={value > 0}
              onClick={() => paint(index)}
              className="h-[18px] w-[18px] bg-sunken font-mono text-[9px] leading-none text-[#12141a]"
              style={value > 0 ? { backgroundColor: STEP_COLOURS[Math.min(value, STEP_COLOURS.length) - 1] } : undefined}
            >
              {value > 0 ? value : ""}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted">Step</span>
            {STEPS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={step === value}
                aria-label={`Step ${value}`}
                onClick={() => setStep(value)}
                className={`h-5 w-5 rounded-md border font-mono text-[10px] leading-none ${step === value ? "border-accent text-ink" : "border-line text-muted hover:bg-raised"}`}
                style={{ backgroundColor: STEP_COLOURS[value - 1], color: "#12141a" }}
              >
                {value}
              </button>
            ))}
          </div>
          {painted && (
            <PillButton onClick={() => onChange(undefined)} title="Clear every stitch of the stamp">
              Clear
            </PillButton>
          )}
          {clipped && (
            <span className="text-[11px] leading-4 text-amber-300" data-testid="stamp-clipped-notice">
              Wider than the {spacing}-stitch spacing: the outside of the grid will be clipped.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
