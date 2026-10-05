import { useState, type DragEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import type { StitchPattern } from "@/lib/types";
import { isViewOnlyMode, type Tool, type ViewMode } from "../editor-types";
import { toolDefinition } from "../tools/registry";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import type { SourceImageMeta } from "../hooks/use-source-image";
import { useCanvasCloth } from "../hooks/use-canvas-cloth";
import { FirstRun } from "./first-run";
import { RULER_THICKNESS, Rulers } from "./rulers";
import { useAutoDismiss } from "../hooks/use-auto-dismiss";
import { DismissButton, PillButton } from "./ui";

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  color: "Color",
  bw: "Black & white",
  realistic: "Realistic preview",
  photo: "Grid + photo",
  "photo-only": "Original photo",
};

/**
 * The viewer's inputs, in the groups it uses them in (G-091 M2). They were 37 flat props; the groups are the seams: what is
 * drawn, where it is drawn, what the pointer does, and the three states the well can be in besides a chart.
 */
export interface ImageWindowProps {
  /** The elements the renderer and the tools measure and draw on. */
  refs: {
    scroller: RefObject<HTMLDivElement | null>;
    frame: RefObject<HTMLDivElement | null>;
    canvas: RefObject<HTMLCanvasElement | null>;
    /** The cursor's own canvas, over the chart's (G-065). */
    hoverCanvas: RefObject<HTMLCanvasElement | null>;
  };
  /** What is shown and what is in hand. */
  chart: {
    pattern: StitchPattern | null;
    cellSize: number;
    sourceMeta: SourceImageMeta | null;
    viewMode: ViewMode;
    activeTool: Tool;
    activeColorIndex: number | null;
    /** The tool in hand draws its own outline over the chart, so the pointer itself is hidden there (G-078). */
    cursorHidden: boolean;
  };
  /** The start screen: the ways into a chart, offered where the chart will be. */
  start: {
    /** It is showing: New was pressed, or nothing is loaded yet. Decided in workspace.tsx. */
    visible: boolean;
    /** New was pressed with a chart open: the start screen covers it until a card is chosen or Back is pressed. */
    startingNew: boolean;
    isLoadingImage: boolean;
    onChoosePhoto: () => void;
    onCreateBlank: (width: number, height: number) => void;
    onImportPixelArt: () => void;
    onOpenPatternFile: () => void;
    onAidaCountChange: (count: number) => void;
  };
  /** The Stitched view's failure to draw, and the ways out of it. */
  preview: { previewError: string | null; retryPreview: () => void; dismissPreviewError: () => void };
  /** The four sliders (G-074): the photo they make is drawn here, in the browser, not fetched. */
  adjust: {
    active: boolean;
    /** A frame for this photo has been painted; until then the photo itself is what is up. */
    ready: boolean;
    size: { width: number; height: number } | null;
    attach: (canvas: HTMLCanvasElement | null) => void;
  };
  /** What the pointer does on the chart. */
  pointer: {
    onDown: (e: PointerEvent<HTMLDivElement>) => void;
    onMove: (e: PointerEvent<HTMLDivElement>) => void;
    onUp: (e: PointerEvent<HTMLDivElement>) => void;
    /** The cursor leaving the chart, which takes its outline with it. */
    onLeave: (e: PointerEvent<HTMLDivElement>) => void;
    onDoubleClick: (e: MouseEvent<HTMLDivElement>) => void;
    onDrop: (e: DragEvent<HTMLDivElement>) => void;
  };
  options: WorkspaceOptions;
  /** The Crop tool's frame, drawn over the chart (G-089); null when the tool is not open. It makes room around the chart for growing it. */
  cropOverlay?: ReactNode;
}

/** The Stitched view's failure to draw: what went wrong, a way to try again, and a way to close it (G-079). */
function PreviewError({ message, onRetry, onDismiss }: { message: string; onRetry: () => void; onDismiss: () => void }) {
  useAutoDismiss(true, onDismiss);
  return (
    <div className="flex items-center gap-3 rounded border border-danger-edge p-3 text-sm text-danger">
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-danger-edge px-3 py-1 text-xs font-medium hover:bg-danger-deep"
      >
        Retry
      </button>
      <DismissButton onClick={onDismiss} />
    </div>
  );
}

function cursorFor(activeTool: Tool, activeColorIndex: number | null, viewMode: ViewMode, cursorHidden: boolean): string {
  if (cursorHidden) return "cursor-none";
  const { cursor } = toolDefinition(activeTool);
  if (cursor === "grab") return "cursor-grab active:cursor-grabbing";
  if (cursor === "zoom") return "cursor-zoom-in";
  if (isViewOnlyMode(viewMode)) return "";
  return cursor === "cross" || activeColorIndex !== null ? "cursor-crosshair" : "";
}

/**
 * The well the chart floats in (G-045 M2, direction 1b): a dark ruled ground, the chart centred on it under a soft
 * shadow. The structure inside is unchanged and load-bearing -- the scroller is the sized, scrolling container the
 * renderer measures, and the frame is the chart-sized box it measures against (D135). The `overflow-auto` class is
 * part of that contract too: the suite selects the scroller by it.
 */
export function ImageWindow({ refs, chart, start, preview, adjust, pointer, options, cropOverlay = null }: ImageWindowProps) {
  const { scroller: scrollerRef, frame: frameRef, canvas: canvasRef, hoverCanvas: hoverCanvasRef } = refs;
  const { pattern, cellSize, sourceMeta, viewMode, activeTool, activeColorIndex, cursorHidden } = chart;
  const {
    visible: startScreen,
    startingNew,
    isLoadingImage,
    onChoosePhoto,
    onCreateBlank,
    onImportPixelArt,
    onOpenPatternFile,
    onAidaCountChange,
  } = start;
  const { previewError, retryPreview: onRetryPreview, dismissPreviewError: onDismissPreviewError } = preview;
  const { active: adjustActive, ready: adjustReady, size: adjustSize, attach: adjustCanvasRef } = adjust;
  const { onDown: onPointerDown, onMove: onPointerMove, onUp: onPointerUp, onLeave: onPointerLeave, onDoubleClick, onDrop } = pointer;
  const [showOriginal, setShowOriginal] = useState(false);
  // The sliders draw here; until the first frame is painted the photo itself is still what is up, so the well
  // never goes blank while a preview is being prepared.
  const showAdjusted = adjustActive && adjustReady && adjustSize !== null && !showOriginal;
  const comparable = adjustActive && (adjustReady || showOriginal);
  // The cloth is the Stitched view's alone, and covers the whole well rather than only the chart (G-077).
  const clothShown = pattern !== null && !startingNew && viewMode === "realistic" && options.canvasTexture !== "off";
  useCanvasCloth(scrollerRef, frameRef, { active: clothShown, texture: options.canvasTexture, color: options.canvasColor, cellSize });

  // Rulers take room only while a chart is up (G-078).
  const rulersShown = pattern !== null && !startingNew;
  const ruler = rulersShown ? RULER_THICKNESS : 0;

  return (
    <div
      data-testid="viewer"
      // The well in the middle, a ruler on each side: the rulers are beside the scroller, never over it (D135).
      className="grid min-h-0 min-w-0 flex-1 bg-surface"
      style={{ gridTemplateColumns: `${ruler}px minmax(0, 1fr) ${ruler}px`, gridTemplateRows: `${ruler}px minmax(0, 1fr) ${ruler}px` }}
    >
      <Rulers
        scrollerRef={scrollerRef}
        frameRef={frameRef}
        columns={pattern?.width ?? 0}
        rows={pattern?.height ?? 0}
        cellSize={cellSize}
        active={rulersShown}
      />
      <div
        ref={scrollerRef}
        // While the Crop tool is open there is room around the chart to drag its frame out into (G-089).
        style={{ gridColumn: 2, gridRow: 2, ...(cropOverlay ? { padding: 120 } : {}) }}
        // Grid centering, not flex: flex's unsafe centering makes overflow past the top/left edge unreachable by scrolling
        // once zoomed content outgrows the container.
        className="at-well grid min-h-0 min-w-0 place-items-center overflow-auto p-6"
      >
        {!startingNew && !pattern && sourceMeta && (
          <figure className="flex max-h-full max-w-full flex-col items-center gap-2">
            {showAdjusted ? (
              <canvas
                ref={adjustCanvasRef}
                data-testid="adjusted-photo"
                width={adjustSize!.width}
                height={adjustSize!.height}
                role="img"
                aria-label="Adjusted photo"
                className="max-h-full max-w-full rounded border border-line shadow-[0_20px_50px_color-mix(in_srgb,var(--at-shadow)_50%,transparent)]"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element -- data URL, not a static asset next/image can optimize */
              <img
                src={sourceMeta.dataUrl}
                alt="Uploaded photo"
                className="max-h-full max-w-full rounded border border-line shadow-[0_20px_50px_color-mix(in_srgb,var(--at-shadow)_50%,transparent)]"
              />
            )}
            {comparable && (
              <figcaption className="flex items-center gap-2 text-xs text-muted">
                <PillButton size="xs" aria-pressed={showOriginal} onClick={() => setShowOriginal((shown) => !shown)}>
                  Compare with original
                </PillButton>
              </figcaption>
            )}
          </figure>
        )}
        {startScreen && (
          <FirstRun
            onChoosePhoto={onChoosePhoto}
            onOpenPattern={onOpenPatternFile}
            onCreateBlank={onCreateBlank}
            onImportPixelArt={onImportPixelArt}
            options={options}
            onAidaCountChange={onAidaCountChange}
            busy={isLoadingImage}
          />
        )}
        {/*
        Hidden, never unmounted. The redraw is a layout effect keyed on the pattern and the scene; neither changes
        while the start screen is up, so an unmounted frame would come back with a fresh, unpainted canvas -- and
        without `data-painted-rect`, which six specs read. `hidden` keeps the pixels, the refs and the observers.
      */}
        {pattern && (
          <div className="relative">
            <div
              ref={frameRef}
              hidden={startingNew}
              role="img"
              aria-label={`Pattern, ${VIEW_MODE_LABELS[viewMode]} view`}
              data-testid="chart-frame"
              data-view-mode={viewMode}
              data-cell-size={cellSize}
              onPointerDown={onPointerDown}
              // A right press paints with the background colour (G-064), so the browser's menu would sit on top
              // of the stitch the reader is aiming at. Only the chart claims it; the rest of the page does not.
              onContextMenu={(e) => e.preventDefault()}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerLeave}
              onDoubleClick={onDoubleClick}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              // Content-box sizing: the chart is exactly width × cellSize inside the 1 px border, as the old canvas was.
              style={{ width: pattern.width * cellSize, height: pattern.height * cellSize }}
              className={`relative box-content touch-none overflow-hidden border ${
                clothShown ? "border-transparent" : "border-line shadow-[0_20px_50px_color-mix(in_srgb,var(--at-shadow)_50%,transparent)]"
              } ${cursorFor(activeTool, activeColorIndex, viewMode, cursorHidden)}`}
            >
              <canvas ref={canvasRef} data-testid="chart-canvas" aria-hidden="true" className="pointer-events-none absolute top-0 left-0" />
              {/* The cursor draws here and nowhere else, so moving it never repaints the chart (G-065). */}
              <canvas
                ref={hoverCanvasRef}
                data-testid="brush-outline"
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-0"
              />
            </div>
            {cropOverlay}
          </div>
        )}
        {pattern && viewMode === "realistic" && previewError && (
          <PreviewError key={previewError} message={previewError} onRetry={onRetryPreview} onDismiss={onDismissPreviewError} />
        )}
      </div>
    </div>
  );
}
