import { useState, type DragEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import type { StitchPattern } from "@/lib/types";
import { isSelectTool, isViewOnlyMode, type Tool, type ViewMode } from "../editor-types";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import type { SourceImageMeta } from "../hooks/use-source-image";
import { FirstRun } from "./first-run";
import { PillButton } from "./ui";

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  color: "Color",
  bw: "Black & white",
  realistic: "Realistic preview",
  photo: "Grid + photo",
  "photo-only": "Original photo",
};

export interface ImageWindowProps {
  /** First run: the three ways into a chart, offered where the chart will be. */
  onChoosePhoto: () => void;
  onCreateBlank: (width: number, height: number) => void;
  onImportPixelArt: () => void;
  options: WorkspaceOptions;
  onAidaCountChange: (count: number) => void;
  onOpenPatternFile: () => void;
  isLoadingImage: boolean;
  /** New was pressed with a chart open: the start screen covers it until a card is chosen or Back is pressed. */
  startingNew: boolean;
  /** The first-run screen is showing -- `startingNew`, or simply nothing loaded yet. Decided in workspace.tsx. */
  startScreen: boolean;
  scrollerRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** The cursor's own canvas, over the chart's (G-065). */
  hoverCanvasRef: RefObject<HTMLCanvasElement | null>;
  pattern: StitchPattern | null;
  cellSize: number;
  sourceMeta: SourceImageMeta | null;
  viewMode: ViewMode;
  activeTool: Tool;
  activeColorIndex: number | null;
  previewError: string | null;
  onRetryPreview: () => void;
  /** The four sliders (G-074): the photo they make is drawn here, in the browser, not fetched. */
  adjustActive: boolean;
  /** A frame for this photo has been painted; until then the photo itself is what is up. */
  adjustReady: boolean;
  adjustSize: { width: number; height: number } | null;
  adjustCanvasRef: (canvas: HTMLCanvasElement | null) => void;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  /** The cursor leaving the chart, which takes its outline with it. */
  onPointerLeave: (e: PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (e: MouseEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}

function cursorFor(activeTool: Tool, activeColorIndex: number | null, viewMode: ViewMode): string {
  if (activeTool === "pan") return "cursor-grab active:cursor-grabbing";
  if (activeTool === "zoom") return "cursor-zoom-in";
  if (isViewOnlyMode(viewMode)) return "";
  return isSelectTool(activeTool) || activeTool === "fill" || activeColorIndex !== null ? "cursor-crosshair" : "";
}

/**
 * The well the chart floats in (G-045 M2, direction 1b): a dark ruled ground, the chart centred on it under a soft
 * shadow. The structure inside is unchanged and load-bearing -- the scroller is the sized, scrolling container the
 * renderer measures, and the frame is the chart-sized box it measures against (D135). The `overflow-auto` class is
 * part of that contract too: the suite selects the scroller by it.
 */
export function ImageWindow({
  scrollerRef,
  frameRef,
  canvasRef,
  hoverCanvasRef,
  pattern,
  cellSize,
  sourceMeta,
  viewMode,
  activeTool,
  activeColorIndex,
  onChoosePhoto,
  onCreateBlank,
  onImportPixelArt,
  options,
  onAidaCountChange,
  onOpenPatternFile,
  isLoadingImage,
  startingNew,
  startScreen,
  previewError,
  onRetryPreview,
  adjustActive,
  adjustReady,
  adjustSize,
  adjustCanvasRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onDoubleClick,
  onDrop,
}: ImageWindowProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  // The sliders draw here; until the first frame is painted the photo itself is still what is up, so the well
  // never goes blank while a preview is being prepared.
  const showAdjusted = adjustActive && adjustReady && adjustSize !== null && !showOriginal;
  const comparable = adjustActive && (adjustReady || showOriginal);

  return (
    <div
      ref={scrollerRef}
      // Grid centering, not flex: flex's unsafe centering makes overflow past the top/left edge unreachable by scrolling
      // once zoomed content outgrows the container.
      className="at-well grid flex-1 place-items-center overflow-auto p-6"
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
              className="max-h-full max-w-full rounded border border-line shadow-[0_20px_50px_rgba(0,0,0,.5)]"
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element -- data URL, not a static asset next/image can optimize */
            <img
              src={sourceMeta.dataUrl}
              alt="Uploaded photo"
              className="max-h-full max-w-full rounded border border-line shadow-[0_20px_50px_rgba(0,0,0,.5)]"
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
          className={`relative box-content touch-none overflow-hidden border border-line shadow-[0_20px_50px_rgba(0,0,0,.5)] ${cursorFor(activeTool, activeColorIndex, viewMode)}`}
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
      )}
      {pattern && viewMode === "realistic" && previewError && (
        <div className="flex items-center gap-3 rounded border border-red-900 p-3 text-sm text-red-300">
          <span>{previewError}</span>
          <button
            type="button"
            onClick={onRetryPreview}
            className="rounded-full border border-red-900 px-3 py-1 text-xs font-medium hover:bg-red-950"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
