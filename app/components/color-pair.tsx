"use client";

import { rgbToHex } from "@/lib/color/color";
import { EMPTY_CELL, type PaletteColor } from "@/lib/types";
import { SkinIcon } from "../skin/skin";

/**
 * The foreground and background a chart is drawn with (G-064), as an image editor shows them: two squares, one over
 * the other, in fixed places. Clicking the one behind makes it the foreground; neither square moves, only which is
 * drawn on top. A left press on the chart paints with the front one, a right press with the one behind. The threads'
 * names are not written beside them (Owner, 2026-10-07, G-118): each square names its thread on hover.
 */

const EMPTY_SWATCH =
  "bg-[repeating-conic-gradient(color-mix(in_srgb,var(--at-ink)_22%,transparent)_0_25%,transparent_0_50%)] bg-[length:6px_6px]";

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
          "absolute h-[17px] w-[17px] rounded-[3px] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--at-ink)_30%,transparent)]",
          slot === "a" ? "left-0 top-0" : "left-[9px] top-[9px]",
          isFront ? "z-20 ring-1 ring-[var(--at-accent)]" : "z-10",
          shown.empty ? EMPTY_SWATCH : "",
        ].join(" ")}
        style={shown.style ? { backgroundColor: shown.style } : undefined}
      />
    );
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="relative h-[26px] w-[26px] shrink-0" role="group" aria-label="Drawing colours">
        {/* The one behind is painted first so the active one sits over it. */}
        {square(back)}
        {square(front)}
      </div>
      <button
        type="button"
        onClick={onSwap}
        aria-label="Swap the two colours"
        title="Swap the two colours — X"
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-raised hover:text-ink"
      >
        <SkinIcon name="swap-colours" />
      </button>
    </div>
  );
}
