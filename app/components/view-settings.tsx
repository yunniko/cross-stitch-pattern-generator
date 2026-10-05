"use client";

import { useRef, useState } from "react";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import type { StitchPattern } from "@/lib/types";
import { DISMISS_RETARGET_ATTRIBUTE, useDismissOnOutsidePointer } from "../hooks/use-dismiss-on-outside-pointer";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { CanvasColorField } from "./canvas-color-field";
import { CanvasPicker } from "./canvas-picker";
import { TexturePicker } from "./texture-picker";

/**
 * How the cloth and the stitches are drawn (G-095): the canvas colour, the cloth of the Stitched view and the stitch
 * texture. They change what is seen and never the chart, so they sit with the view, reachable in every workspace, and
 * not among the document's settings where they were.
 *
 * It stays open while the view controls are used, since choosing the Stitched view and then a texture is one errand; a
 * press anywhere else, or Escape, puts it away, and that press still does what it was aimed at.
 *
 * (The stitch texture is also what the exported realistic preview is drawn with; the Export workspace says so there.)
 */
export interface ViewSettingsProps {
  pattern: StitchPattern | null;
  options: WorkspaceOptions;
  onChange: UpdateWorkspaceOption;
}

/** Marks what may be pressed without putting the view settings away: their own button, and the view controls. */
export const KEEPS_VIEW_SETTINGS = { [DISMISS_RETARGET_ATTRIBUTE]: "" };

export function ViewSettings({ pattern, options, onChange }: ViewSettingsProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissOnOutsidePointer(panelRef, open, {
    onOutsidePointer: () => setOpen(false),
    // Escape closes the colour picker inside first, when that is open, and this on the next press.
    onEscape: () => {
      if (!panelRef.current?.querySelector('[role="dialog"]')) setOpen(false);
    },
  });

  return (
    <div className="relative shrink-0 font-sans">
      <button
        type="button"
        {...KEEPS_VIEW_SETTINGS}
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="The canvas colour, the cloth under the Stitched view and the stitch texture"
        className={`rounded-md border px-2.5 py-0.5 text-xs whitespace-nowrap transition-colors ${
          open ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:bg-raised hover:text-ink"
        }`}
      >
        Canvas &amp; stitch texture
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Canvas and stitch texture"
          // Above the view controls, which stay in reach while this is open.
          className="absolute right-0 bottom-full z-40 mb-[92px] flex w-[340px] flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-ink shadow-[0_30px_70px_color-mix(in_srgb,var(--at-shadow)_60%,transparent)]"
        >
          <div
            className="flex items-center justify-between text-[13px]"
            title="Shown behind empty stitches in Color/B&W view and behind the realistic preview. It goes into an exported preview only with Canvas in exported preview ticked."
          >
            Canvas color
            <CanvasColorField value={options.canvasColor} onChange={(hex) => onChange("canvasColor", hex)} />
          </div>
          <div
            className="flex flex-col gap-1.5"
            title="The cloth under the Stitched view, over the whole viewer, tinted by the canvas colour. Off shows the colour alone."
          >
            <span className="text-[13px]">Canvas texture</span>
            <CanvasPicker
              value={options.canvasTexture}
              onChange={(texture) => onChange("canvasTexture", texture)}
              canvasColor={options.canvasColor}
            />
          </div>
          <div className="flex flex-col gap-1.5" title="The stitch texture of the Stitched view and of the exported realistic preview">
            <span className="text-[13px]">Stitch texture</span>
            <TexturePicker
              pattern={pattern}
              value={options.stitchTexture}
              onChange={(texture) => onChange("stitchTexture", texture)}
              canvasColor={options.canvasColor}
            />
          </div>
        </div>
      )}
    </div>
  );
}
