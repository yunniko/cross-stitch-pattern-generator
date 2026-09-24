import { useCallback, useState } from "react";
import {
  NO_COLORS,
  colorForButton,
  foregroundOf,
  paintableIndex,
  swapped,
  withActive,
  withColor,
  withColorRemoved,
  type ColorSlots,
} from "@/lib/editor/color-slots";
import { useLatest } from "./use-latest";

/**
 * The two colours a chart is drawn with (G-064), and the one rule that keeps them safe to paint with.
 *
 * Extracted from the workspace in G-067 M4. It is a small piece of state, but it carries an invariant that was
 * learned the hard way: a merge renumbers the palette under whatever the squares are holding, and a held index the
 * palette no longer has is a cell no renderer can draw (D217). Keeping the slots, the renumbering and the
 * paint-colour gate in one place means the next person to touch one of them sees the other two.
 */
export interface DrawingColours {
  slots: ColorSlots;
  /** The foreground: what a left press paints with, and what the panes call the active colour. */
  activeColorIndex: number | null;
  setActiveColorIndex: (index: number | null) => void;
  setBackgroundColorIndex: (index: number | null) => void;
  setActiveSlot: (slot: "a" | "b") => void;
  swap: () => void;
  /** A thread was merged away: whatever the squares hold is renumbered to match the palette that remains. */
  forgetColor: (removed: number) => void;
  /**
   * The colour a press paints with, asked for when the gesture starts so the right button paints with the
   * background. A thread the palette no longer has counts as nothing held (D217).
   */
  colorForPointer: (button: number) => number | null;
}

export function useDrawingColours(paletteLength: number): DrawingColours {
  const [slots, setSlots] = useState<ColorSlots>(NO_COLORS);
  // Read inside event handlers, which must see the current pair rather than the one their gesture started with.
  const slotsRef = useLatest(slots);

  const colorForPointer = useCallback(
    (button: number) => paintableIndex(colorForButton(slotsRef.current, button), paletteLength),
    [slotsRef, paletteLength]
  );

  return {
    slots,
    activeColorIndex: foregroundOf(slots),
    setActiveColorIndex: (index) => setSlots((s) => withColor(s, "foreground", index)),
    setBackgroundColorIndex: (index) => setSlots((s) => withColor(s, "background", index)),
    setActiveSlot: (slot) => setSlots((s) => withActive(s, slot)),
    swap: () => setSlots(swapped),
    forgetColor: (removed) => setSlots((s) => withColorRemoved(s, removed)),
    colorForPointer,
  };
}
