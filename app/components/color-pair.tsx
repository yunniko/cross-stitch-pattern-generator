"use client";

import { rgbToHex } from "@/lib/color/color";
import { EMPTY_CELL, type PaletteColor } from "@/lib/types";

/**
 * The foreground and background a chart is drawn with (G-064), as an image editor shows them: two squares, one over
 * the other, in fixed places. Clicking the one behind makes it the foreground; neither square moves, only which is
 * drawn on top. A left press on the chart paints with the front one, a right press with the one behind.
 */

const EMPTY_SWATCH = "bg-[repeating-conic-gradient(rgba(232,236,239,.22)_0_25%,transparent_0_50%)] bg-[length:6px_6px]";

export interface ColorPairProps {
  pattern: { palette: PaletteColor[] } | null;
  /** The two squares as they sit, whichever is active. */
  slots: { a: number | null; b: number | null; active: "a" | "b" };
  onActivate: (slot: "a" | "b") => void;
  onSwap: () => void;
}

function swatchColor(pattern: ColorPairProps["pattern"], index: number | null): { label: string; style?: string; empty: boolean } {
  if (index === null) return { label: "No thread chosen", empty: false };
  if (index === EMPTY_CELL) return { label: "Empty (no stitch)", empty: true };
  const color = pattern?.palette[index];
  return { label: color?.name ?? "No thread chosen", style: color ? rgbToHex(color.rgb) : undefined, empty: false };
}

export function ColorPair({ pattern, slots, onActivate, onSwap }: ColorPairProps) {
  const front = slots.active;
  const back = front === "a" ? "b" : "a";
  const square = (slot: "a" | "b") => {
    const shown = swatchColor(pattern, slots[slot]);
    const isFront = slot === front;
    return (
      <button
        key={slot}
        type="button"
        aria-label={`${isFront ? "Foreground" : "Background"} colour: ${shown.label}`}
        aria-pressed={isFront}
        title={isFront ? `Foreground — ${shown.label}` : `Background — ${shown.label}. Click to draw with it.`}
        onClick={() => onActivate(slot)}
        data-testid={`color-slot-${slot}`}
        data-role={isFront ? "foreground" : "background"}
        // Fixed places: slot a is the upper-left square and slot b the lower-right one, whichever is active. Only
        // the z-index and the ring move, which is what "they do not change place" means.
        className={[
          "absolute h-[17px] w-[17px] rounded-[3px] shadow-[inset_0_0_0_1px_rgba(232,236,239,.3)]",
          slot === "a" ? "left-0 top-0" : "left-[9px] top-[9px]",
          isFront ? "z-20 ring-1 ring-[var(--at-accent)]" : "z-10",
          shown.empty ? EMPTY_SWATCH : "",
        ].join(" ")}
        style={shown.style ? { backgroundColor: shown.style } : undefined}
      />
    );
  };

  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <div className="relative h-[26px] w-[26px] shrink-0" role="group" aria-label="Drawing colours">
        {/* The one behind is painted first so the active one sits over it. */}
        {square(back)}
        {square(front)}
      </div>
      <div className="flex flex-col leading-tight">
        <span className="max-w-[10rem] truncate text-[13px]">{swatchColor(pattern, slots[front]).label}</span>
        <button
          type="button"
          onClick={onSwap}
          title="Swap the two colours — X"
          className="max-w-[10rem] truncate text-left text-[11px] text-muted transition-colors hover:text-ink"
        >
          {swatchColor(pattern, slots[back]).label}
        </button>
      </div>
    </div>
  );
}
