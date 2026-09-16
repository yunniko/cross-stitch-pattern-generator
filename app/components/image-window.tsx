import { useMemo, useState, type DragEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { filledStitchCount, formatColorCount, formatStitchCount, type StitchPattern } from "@/lib/types";
import { isViewOnlyMode, type Tool, type ViewMode } from "../editor-types";
import type { SourceImageMeta } from "../hooks/use-source-image";
import { PillButton } from "./ui";

export interface ViewBarProps {
  pattern: StitchPattern | null;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  canvasColor: string;
  onCanvasColorChange: (hex: string) => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

const ZOOM_BUTTON = "rounded border border-zinc-300 px-2 py-0.5 hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]";

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  color: "Color",
  bw: "Black & white",
  realistic: "Realistic preview",
  photo: "Grid + photo",
  "photo-only": "Original photo",
};

/** The strip above the Image window: pattern size, view modes, canvas color and zoom. */
export function ViewBar({ pattern, viewMode, onViewModeChange, canvasColor, onCanvasColorChange, zoomLevel, onZoomIn, onZoomOut, onResetZoom }: ViewBarProps) {
  const noPhotoTitle = pattern?.sourceImage ? undefined : "No source photo is associated with this pattern";
  // Counted once per pattern, not on every zoom or tool change (G-036 M4).
  const stitchCount = useMemo(() => (pattern ? filledStitchCount(pattern) : 0), [pattern]);
  const modes: Array<{ mode: ViewMode; label: string; needsPhoto: boolean }> = [
    { mode: "color", label: VIEW_MODE_LABELS.color, needsPhoto: false },
    { mode: "bw", label: VIEW_MODE_LABELS.bw, needsPhoto: false },
    { mode: "realistic", label: VIEW_MODE_LABELS.realistic, needsPhoto: false },
    { mode: "photo", label: VIEW_MODE_LABELS.photo, needsPhoto: true },
    { mode: "photo-only", label: VIEW_MODE_LABELS["photo-only"], needsPhoto: true },
  ];

  return (
    <div className="flex items-center gap-3 border-b border-zinc-300 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-sm font-medium">{pattern ? `${pattern.width} × ${pattern.height}, ${formatStitchCount(stitchCount)}, ${formatColorCount(pattern.palette.length)}` : "No pattern yet"}</span>
      {pattern && (
        <div className="ml-auto flex items-center gap-3 text-sm">
          {modes.map(({ mode, label, needsPhoto }) => {
            const unavailable = needsPhoto && !pattern.sourceImage;
            return (
              <label key={mode} className={`flex items-center gap-1.5 ${unavailable ? "opacity-50" : ""}`} title={needsPhoto ? noPhotoTitle : undefined}>
                <input type="radio" name="view-mode" checked={viewMode === mode} disabled={unavailable} onChange={() => onViewModeChange(mode)} />
                {label}
              </label>
            );
          })}
          <label
            className="ml-2 flex items-center gap-1.5 border-l border-zinc-300 pl-3 dark:border-zinc-700"
            title="Shown behind empty stitches in Color/B&W view and behind the realistic preview -- display only, never affects any export"
          >
            Canvas color
            <input
              type="color"
              value={canvasColor}
              onChange={(e) => onCanvasColorChange(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-zinc-300 bg-transparent p-0 dark:border-zinc-700"
            />
          </label>
          <div className="ml-2 flex items-center gap-1 border-l border-zinc-300 pl-3 dark:border-zinc-700">
            <button type="button" onClick={onZoomOut} className={`${ZOOM_BUTTON} text-sm`} aria-label="Zoom out">
              −
            </button>
            <button type="button" onClick={onResetZoom} className={`${ZOOM_BUTTON} min-w-[3.5rem] text-center text-xs`} aria-label="Reset zoom to 100%" title="Reset zoom to 100%">
              {Math.round(zoomLevel * 100)}%
            </button>
            <button type="button" onClick={onZoomIn} className={`${ZOOM_BUTTON} text-sm`} aria-label="Zoom in">
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export interface ImageWindowProps {
  scrollerRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  pattern: StitchPattern | null;
  cellSize: number;
  sourceMeta: SourceImageMeta | null;
  viewMode: ViewMode;
  activeTool: Tool;
  activeColorIndex: number | null;
  previewError: string | null;
  onRetryPreview: () => void;
  /** True when a non-Off photo enhancement applies to the photo shown before Generate. */
  enhancementActive: boolean;
  enhancedPreviewUrl: string | null;
  isPreparingEnhancedPreview: boolean;
  enhancedPreviewError: string | null;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (e: MouseEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}

function cursorFor(activeTool: Tool, activeColorIndex: number | null, viewMode: ViewMode): string {
  if (activeTool === "pan") return "cursor-grab active:cursor-grabbing";
  if (activeTool === "zoom") return "cursor-zoom-in";
  if (isViewOnlyMode(viewMode)) return "";
  return activeTool === "select" || activeTool === "fill" || activeColorIndex !== null ? "cursor-crosshair" : "";
}

/**
 * The scrollable Image window: the uploaded photo before generation, then the chart. A frame at the chart's full size
 * is the layout and input surface every view mode shares, so zoom, scroll and pan carry across modes; inside it one
 * canvas holds only the painted part of the chart, placed and drawn by the chart renderer (D135).
 */
export function ImageWindow({
  scrollerRef,
  frameRef,
  canvasRef,
  pattern,
  cellSize,
  sourceMeta,
  viewMode,
  activeTool,
  activeColorIndex,
  previewError,
  onRetryPreview,
  enhancementActive,
  enhancedPreviewUrl,
  isPreparingEnhancedPreview,
  enhancedPreviewError,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onDrop,
}: ImageWindowProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const showEnhanced = enhancementActive && enhancedPreviewUrl !== null && !showOriginal;

  return (
    <div
      ref={scrollerRef}
      // Grid centering, not flex: flex's unsafe centering makes overflow past the top/left edge unreachable by scrolling
      // once zoomed content outgrows the container.
      className="grid flex-1 place-items-center overflow-auto p-4"
    >
      {!pattern && sourceMeta && (
        <figure className="flex max-h-full max-w-full flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not a static asset next/image can optimize */}
          <img
            src={showEnhanced ? enhancedPreviewUrl! : sourceMeta.dataUrl}
            alt={showEnhanced ? "Enhanced photo preview" : "Uploaded photo"}
            className="max-h-full max-w-full border border-zinc-300 dark:border-zinc-700"
          />
          {enhancementActive && (
            <figcaption className="flex items-center gap-2 text-xs text-zinc-500">
              {isPreparingEnhancedPreview && <span>Preparing enhanced preview…</span>}
              {enhancedPreviewError && <span className="text-red-600 dark:text-red-400">{enhancedPreviewError}</span>}
              {enhancedPreviewUrl && (
                <PillButton size="xs" aria-pressed={showOriginal} onClick={() => setShowOriginal((shown) => !shown)}>
                  Compare with original
                </PillButton>
              )}
            </figcaption>
          )}
        </figure>
      )}
      {!pattern && !sourceMeta && <p className="text-sm text-zinc-500">Upload an image in the Processing params dock below to get started.</p>}
      {pattern && (
        <div
          ref={frameRef}
          role="img"
          aria-label={`Pattern, ${VIEW_MODE_LABELS[viewMode]} view`}
          data-testid="chart-frame"
          data-view-mode={viewMode}
          data-cell-size={cellSize}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          // Content-box sizing: the chart is exactly width × cellSize inside the 1 px border, as the old canvas was.
          style={{ width: pattern.width * cellSize, height: pattern.height * cellSize }}
          className={`relative box-content touch-none overflow-hidden border border-zinc-300 dark:border-zinc-700 ${cursorFor(activeTool, activeColorIndex, viewMode)}`}
        >
          <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute top-0 left-0" />
        </div>
      )}
      {pattern && viewMode === "realistic" && previewError && (
        <div className="flex items-center gap-3 rounded border border-red-300 p-3 text-sm text-red-600 dark:border-red-800 dark:text-red-400">
          <span>{previewError}</span>
          <button
            type="button"
            onClick={onRetryPreview}
            className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
