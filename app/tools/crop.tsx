import { CropBar } from "../components/crop-bar";
import { CropOverlay } from "../components/crop-overlay";
import { CropIcon } from "./icons";
import { act } from "./shared";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";
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

  /** Another tool is chosen: the frame goes without changing anything. */
  const close = useCallback(() => {
    setOpen(false);
    setHeld({ width: 0, height: 0, insets: NO_CROP });
  }, []);

  /** Another chart arrived: the frame starts again over it, and the tool stays as it was (in hand or not). */
  const clearFrame = useCallback(() => setHeld({ width: 0, height: 0, insets: NO_CROP }), []);

  const apply = useCallback(() => {
    if (!pattern || !open || isNoCrop(insets) || cropError(pattern.width, pattern.height, insets)) return;
    commit(resizeCanvas(pattern, insetsToDelta(insets)));
  }, [commit, insets, open, pattern]);

  return { open, insets, size, error, changed: !isNoCrop(insets), setInsets, setEdge, reset, begin, close, clearFrame, apply };
}

export type CropTool = ReturnType<typeof useCropTool>;

/**
 * Crop (G-089): the frame over the chart and the four numbers in its bar are one value. It stays open, frame kept, behind the
 * tools that only move the view, and waits out a looking-only view.
 */
export const cropModule = {
  definitions: [
    {
      id: "crop",
      label: "Crop",
      title:
        "Cut the chart down, or grow it, with a frame (C). Drag an edge or a corner, or type how many stitches each edge moves in; a negative number adds empty stitches. Apply with Enter.",
      key: "c",
      group: 1,
      Icon: CropIcon,
    },
  ],
  commands: [
    {
      id: "crop.apply",
      name: "Apply the crop frame",
      group: "Crop",
      when: "A crop frame that differs from the chart and is valid",
      keys: ["Enter"],
    },
    {
      id: "crop.reset",
      name: "Put the crop frame back over the whole chart",
      group: "Crop",
      when: "A crop frame that differs from the chart",
      keys: ["Escape"],
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    const crop = useCropTool(api.pattern, api.commit);
    const shown = crop.open && api.pattern !== null && !api.startingNew && !api.viewOnly;
    return {
      commands: {
        "crop.apply": act(shown && crop.changed && crop.error === null, crop.apply),
        "crop.reset": act(shown && crop.changed, crop.reset),
      },
      onToolChange: (_previous, next) => {
        if (next.id === "crop") crop.begin();
        else if (!next.navigation) crop.close();
      },
      // The frame starts again over the new chart; the tool stays in hand if it was.
      onDocumentReplaced: crop.clearFrame,
      bar:
        shown && crop.size && api.pattern ? (
          <CropBar
            width={api.pattern.width}
            height={api.pattern.height}
            insets={crop.insets}
            size={crop.size}
            error={crop.error}
            changed={crop.changed}
            aidaCount={api.options.aidaCount}
            sizeUnit={api.options.sizeUnit}
            canUndo={api.history.canUndo}
            canRedo={api.history.canRedo}
            onUndo={api.history.undo}
            onRedo={api.history.redo}
            onEdgeChange={crop.setEdge}
            onApply={crop.apply}
            onCancel={crop.reset}
          />
        ) : undefined,
      overlay:
        shown && api.pattern ? (
          <CropOverlay
            width={api.pattern.width}
            height={api.pattern.height}
            cellSize={api.cellSize}
            insets={crop.insets}
            invalid={crop.error !== null}
            onChange={crop.setInsets}
          />
        ) : undefined,
    };
  },
} as const satisfies ToolModule;
