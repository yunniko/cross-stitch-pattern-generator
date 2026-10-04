import { useCallback, useState } from "react";
import { cropError, cropSize, insetsToDelta, isNoCrop, NO_CROP, withInset, type CropEdge, type CropInsets } from "@/lib/editor/crop-frame";
import { resizeCanvas } from "@/lib/editor/pattern-edit";
import type { StitchPattern } from "@/lib/types";

/**
 * The Crop tool's state (G-089): whether it is open, and the frame, which is the four numbers beside it (`crop-frame.ts`).
 *
 * The frame belongs to the chart it was made over. When that chart's size changes under it (an undo, a redo, another chart) the
 * frame reads as no crop, rather than as numbers that mean something else on a different grid. Apply is `resizeCanvas`, the
 * one place a canvas is resized, committed as one undo step.
 */
export function useCropTool(pattern: StitchPattern | null, commit: (next: StitchPattern) => void) {
  const [open, setOpen] = useState(false);
  const [held, setHeld] = useState<{ width: number; height: number; insets: CropInsets }>({ width: 0, height: 0, insets: NO_CROP });

  const insets = pattern && held.width === pattern.width && held.height === pattern.height ? held.insets : NO_CROP;
  const error = pattern ? cropError(pattern.width, pattern.height, insets) : null;
  const size = pattern ? cropSize(pattern.width, pattern.height, insets) : null;

  const setInsets = useCallback(
    (next: CropInsets) => {
      if (pattern) setHeld({ width: pattern.width, height: pattern.height, insets: next });
    },
    [pattern]
  );

  const setEdge = useCallback((edge: CropEdge, value: number) => setInsets(withInset(insets, edge, value)), [insets, setInsets]);

  /** Back to no crop, the tool still in hand: Escape and Cancel. The chart is not touched. */
  const reset = useCallback(() => setInsets(NO_CROP), [setInsets]);

  /** The tool is chosen. A frame already being set is kept: choosing Crop again, or coming back from Zoom, is not a cancel. */
  const begin = useCallback(() => setOpen(true), []);

  /** Another tool is chosen or another chart arrives: the frame goes without changing anything. */
  const close = useCallback(() => {
    setOpen(false);
    setHeld({ width: 0, height: 0, insets: NO_CROP });
  }, []);

  const apply = useCallback(() => {
    if (!pattern || !open || isNoCrop(insets) || cropError(pattern.width, pattern.height, insets)) return;
    commit(resizeCanvas(pattern, insetsToDelta(insets)));
  }, [commit, insets, open, pattern]);

  return { open, insets, size, error, changed: !isNoCrop(insets), setInsets, setEdge, reset, begin, close, apply };
}

export type CropTool = ReturnType<typeof useCropTool>;
