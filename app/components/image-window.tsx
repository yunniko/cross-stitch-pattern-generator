import { useState, type DragEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import type { StitchPattern } from "@/lib/types";
import type { Tool, ViewMode } from "../editor-types";
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

/** The strip above the Image window: pattern size, view modes, canvas color and zoom. */
export function ViewBar({ pattern, viewMode, onViewModeChange, canvasColor, onCanvasColorChange, zoomLevel, onZoomIn, onZoomOut, onResetZoom }: ViewBarProps) {
  const noPhotoTitle = pattern?.sourceImage ? undefined : "No source photo is associated with this pattern";
  const modes: Array<{ mode: ViewMode; label: string; needsPhoto: boolean }> = [
    { mode: "color", label: "Color", needsPhoto: false },
    { mode: "bw", label: "Black & white", needsPhoto: false },
    { mode: "realistic", label: "Realistic preview", needsPhoto: false },
    { mode: "photo", label: "Grid + photo", needsPhoto: true },
    { mode: "photo-only", label: "Original photo", needsPhoto: true },
  ];

  return (
    <div className="flex items-center gap-3 border-b border-zinc-300 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-sm font-medium">{pattern ? `${pattern.width} × ${pattern.height} stitches, ${pattern.palette.length} colors` : "No pattern yet"}</span>
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
  canvasRef: RefObject<HTMLCanvasElement | null>;
  pattern: StitchPattern | null;
  sourceMeta: SourceImageMeta | null;
  viewMode: ViewMode;
  activeTool: Tool;
  activeColorIndex: number | null;
  canvasColor: string;
  realisticPreviewUrl: string | null;
  previewError: string | null;
  onRetryPreview: () => void;
  /** True when a non-Off photo enhancement applies to the photo shown before Generate. */
  enhancementActive: boolean;
  enhancedPreviewUrl: string | null;
  isPreparingEnhancedPreview: boolean;
  enhancedPreviewError: string | null;
  onPointerDown: (e: PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLCanvasElement>) => void;
  onDoubleClick: (e: MouseEvent<HTMLCanvasElement>) => void;
  onDrop: (e: DragEvent<HTMLCanvasElement>) => void;
}

function cursorFor(activeTool: Tool, activeColorIndex: number | null): string {
  if (activeTool === "pan") return "cursor-grab active:cursor-grabbing";
  if (activeTool === "zoom") return "cursor-zoom-in";
  return activeTool === "select" || activeTool === "fill" || activeColorIndex !== null ? "cursor-crosshair" : "";
}

/** The scrollable Image window: the uploaded photo before generation, then the editable canvas, the realistic preview or the original photo. */
export function ImageWindow({
  scrollerRef,
  canvasRef,
  pattern,
  sourceMeta,
  viewMode,
  activeTool,
  activeColorIndex,
  canvasColor,
  realisticPreviewUrl,
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
      {pattern && viewMode === "photo-only" && pattern.sourceImage && (
        // eslint-disable-next-line @next/next/no-img-element -- data URL, not a static asset next/image can optimize
        <img src={pattern.sourceImage.dataUrl} alt="Original uploaded photo" className="max-h-full max-w-full border border-zinc-300 dark:border-zinc-700" />
      )}
      {pattern && viewMode !== "realistic" && viewMode !== "photo-only" && (
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className={`touch-none border border-zinc-300 dark:border-zinc-700 ${cursorFor(activeTool, activeColorIndex)}`}
        />
      )}
      {pattern && viewMode === "realistic" && realisticPreviewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- data URL, not a static asset next/image can optimize
        <img
          src={realisticPreviewUrl}
          alt="Cross-stitch pattern preview"
          // The canvas color as a backdrop behind the transparent PNG; display only, the download stays transparent.
          style={{ backgroundColor: canvasColor }}
          className="border border-zinc-300 dark:border-zinc-700"
        />
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
