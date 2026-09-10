"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { hexToRgb, rgbToHex } from "@/lib/color";
import { decodeSourceImage, loadImageAsPixelBuffer } from "@/lib/load-image";
import { cancelPatternJob, runPatternJob } from "@/lib/pattern-client";
import { addColor, compactUnusedColors, editColorRgb, fillCluster, mergeColors, paintStitch, renameColor, renamePattern } from "@/lib/pattern-edit";
import { deserializePattern, serializePattern } from "@/lib/pattern-serialize";
import { downloadCanvasAsPng, drawChart, renderPatternToCanvas, renderStitchPreviewToCanvas, type RenderMode } from "@/lib/render";
import { generateA4Export, downloadBlob } from "@/lib/a4-export";
import { calculateA4Layout, type OverlapCells } from "@/lib/a4-layout";
import { useUndoHistory } from "@/lib/use-undo-history";
import {
  MAX_COLORS,
  MAX_STITCHES,
  MIN_COLORS,
  MIN_STITCHES,
  SIZE_PRESETS,
  type PixelBuffer,
  type SizePresetId,
  type StitchPattern,
} from "@/lib/types";
import { DEFAULT_AIDA_COUNT, STANDARD_AIDA_COUNTS, formatFinishedDimension, type SizeUnit } from "@/lib/finished-size";
import type { GenerationMode } from "@/lib/pattern.worker";

// The Image window's target on-screen width for its live-editable (color/bw)
// canvas -- cell size is derived from this so a small pattern isn't a
// postage stamp and a huge one doesn't overflow the window. One shared
// constant (not one per old page/editor split) so switching render modes
// doesn't jump size.
const IMAGE_WINDOW_TARGET_WIDTH_PX = 720;
const IMAGE_WINDOW_MAX_CELL_SIZE = 28;
const IMAGE_WINDOW_MIN_CELL_SIZE = 4;

type ViewMode = RenderMode | "realistic";

interface SourceImageMeta {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
}

function cellIndexFromEvent(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  cellSize: number,
  width: number,
  height: number
): number | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor(((e.clientX - rect.left) * scaleX) / cellSize);
  const y = Math.floor(((e.clientY - rect.top) * scaleY) / cellSize);
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  return y * width + x;
}

export default function Workspace() {
  // --- Source image + processing params (the Processing-params dock) ---
  const [pixelBuffer, setPixelBuffer] = useState<PixelBuffer | null>(null);
  const [sourceImageMeta, setSourceImageMeta] = useState<SourceImageMeta | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  // Bumped on every new file selection; every async continuation (an image
  // decode or a generation result) checks this before applying its result,
  // so a slower, now-superseded selection or job can never clobber state a
  // newer one already established (code-review 2026-09-09, finding 1).
  const sourceRevisionRef = useRef(0);
  const [sizePreset, setSizePreset] = useState<SizePresetId>("medium");
  const [customSize, setCustomSize] = useState(100);
  const [aidaCount, setAidaCount] = useState<number>(DEFAULT_AIDA_COUNT);
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("in");
  const [colorCount, setColorCount] = useState(16);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("latest");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);

  const longerSideStitches = sizePreset === "custom" ? customSize : SIZE_PRESETS[sizePreset];

  // --- The pattern itself: undo/redo-tracked, null until the first
  // generate (or an opened file). Regenerating pushes a new snapshot onto
  // this same stack, so it undoes/redoes like any other edit (G-012). ---
  const history = useUndoHistory<StitchPattern | null>(null);
  const pattern = history.state;

  // --- Image window view mode + brush/legend state (the Colors dock) ---
  const [viewMode, setViewMode] = useState<ViewMode>("color");
  const [realisticPreviewUrl, setRealisticPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRetryToken, setPreviewRetryToken] = useState(0);
  const [activeColorIndex, setActiveColorIndex] = useState<number | null>(null);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [editingDraftHex, setEditingDraftHex] = useState("#000000");
  const [addingColor, setAddingColor] = useState(false);
  const [addColorDraftHex, setAddColorDraftHex] = useState("#808080");
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<{ pattern: StitchPattern; lastCell: number | null } | null>(null);

  // --- Name, open/save, downloads, A4 export ---
  const [nameDraft, setNameDraft] = useState("cross-stitch-pattern");
  const [lastCommittedName, setLastCommittedName] = useState<string | undefined>(undefined);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [a4Mode, setA4Mode] = useState<RenderMode>("color");
  const [a4Overlap, setA4Overlap] = useState<OverlapCells>(5);
  const [isExportingA4, setIsExportingA4] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openEditableInputRef = useRef<HTMLInputElement>(null);

  const a4LayoutPreview = useMemo(
    () => (pattern ? calculateA4Layout(pattern.width, pattern.height, { overlapCells: a4Overlap }) : null),
    [pattern, a4Overlap]
  );

  // Re-syncs the draft only when the committed name actually changes (undo/
  // redo, regenerate, or opening a different file) -- not on every
  // keystroke, since the draft itself is what the input is bound to while
  // typing. Adjusting state during render (React's own recommended pattern
  // for this) rather than in an effect, which would cause an extra,
  // avoidable render pass.
  if (pattern?.name !== lastCommittedName) {
    setLastCommittedName(pattern?.name);
    setNameDraft(pattern?.name ?? "cross-stitch-pattern");
  }

  const cellSize = pattern
    ? Math.max(
        IMAGE_WINDOW_MIN_CELL_SIZE,
        Math.min(IMAGE_WINDOW_MAX_CELL_SIZE, Math.floor(IMAGE_WINDOW_TARGET_WIDTH_PX / Math.max(pattern.width, pattern.height)))
      )
    : IMAGE_WINDOW_MAX_CELL_SIZE;

  // --- Image window: live editable canvas for color/bw ---
  useEffect(() => {
    if (viewMode === "realistic") return;
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return;
    canvas.width = pattern.width * cellSize;
    canvas.height = pattern.height * cellSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawChart(ctx, pattern, viewMode, cellSize);
  }, [pattern, viewMode, cellSize]);

  function redrawWith(p: StitchPattern) {
    if (viewMode === "realistic") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawChart(ctx, p, viewMode, cellSize);
  }

  // --- Image window: async non-interactive realistic preview ---
  useEffect(() => {
    if (viewMode !== "realistic" || !pattern) return;
    let cancelled = false;
    renderStitchPreviewToCanvas(pattern, { cellSize })
      .then((canvas) => {
        if (cancelled) return;
        setPreviewError(null);
        setRealisticPreviewUrl(canvas.toDataURL("image/png"));
      })
      .catch((err) => {
        if (cancelled) return;
        setRealisticPreviewUrl(null);
        setPreviewError(err instanceof Error ? err.message : "Couldn't render this preview.");
      });
    return () => {
      cancelled = true;
    };
  }, [pattern, viewMode, cellSize, previewRetryToken]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const myRevision = ++sourceRevisionRef.current;
    cancelPatternJob(); // any in-flight generation was for a now-superseded image
    setGenError(null);
    setIsLoadingImage(true);
    try {
      const decoded = await loadImageAsPixelBuffer(file);
      if (sourceRevisionRef.current !== myRevision) return; // a newer selection has since started
      setPixelBuffer(decoded.pixelBuffer);
      setSourceImageMeta({
        dataUrl: decoded.originalDataUrl,
        naturalWidth: decoded.naturalWidth,
        naturalHeight: decoded.naturalHeight,
      });
      setSourceFileName(file.name);
      // A brand-new source photo is a new document -- fresh undo history,
      // shown "as is" in the Image window until Generate is pressed.
      history.reset(null);
      setActiveColorIndex(null);
    } catch {
      if (sourceRevisionRef.current !== myRevision) return;
      setGenError("Couldn't read that image. Try a different file (JPEG, PNG, or WebP).");
    } finally {
      if (sourceRevisionRef.current === myRevision) setIsLoadingImage(false);
    }
  }

  async function handleGenerate() {
    if (!pixelBuffer) {
      setGenError("Upload an image first.");
      return;
    }
    if (!Number.isInteger(longerSideStitches) || longerSideStitches < MIN_STITCHES || longerSideStitches > MAX_STITCHES) {
      setGenError(`Pattern size must be a whole number between ${MIN_STITCHES} and ${MAX_STITCHES} stitches.`);
      return;
    }
    if (colorCount < MIN_COLORS || colorCount > MAX_COLORS) {
      setGenError(`Color count must be between ${MIN_COLORS} and ${MAX_COLORS}.`);
      return;
    }
    const myRevision = sourceRevisionRef.current;
    setGenError(null);
    setIsProcessing(true);
    setProgress(0);
    try {
      const result = await runPatternJob({
        imageData: pixelBuffer,
        longerSideStitches,
        colorCount,
        generationMode,
        onProgress: setProgress,
      });
      if (sourceRevisionRef.current !== myRevision) return; // a different image was selected meanwhile
      const naturalLonger = sourceImageMeta ? Math.max(sourceImageMeta.naturalWidth, sourceImageMeta.naturalHeight) : null;
      const nextPattern: StitchPattern = {
        ...result,
        name: pattern?.name ?? sourceFileName?.replace(/\.[^.]+$/, "") ?? "cross-stitch-pattern",
        sourceImage:
          sourceImageMeta && naturalLonger
            ? {
                dataUrl: sourceImageMeta.dataUrl,
                naturalWidth: sourceImageMeta.naturalWidth,
                naturalHeight: sourceImageMeta.naturalHeight,
                cellSizePx: naturalLonger / longerSideStitches,
                offsetX: 0,
                offsetY: 0,
              }
            : undefined,
      };
      if (pattern) {
        // A true regenerate (params changed on an already-generated
        // pattern) is just another undoable step, same stack as any edit
        // (G-012's own acceptance criterion 11).
        history.set(nextPattern);
      } else {
        // The *first* generate establishes the undo baseline -- it isn't
        // itself undoable back into a "no pattern yet, raw photo shown"
        // state, matching every other editor's Ctrl+Z convention (nothing
        // to undo before the document exists).
        history.reset(nextPattern);
      }
    } catch {
      // A different image being selected mid-generation cancels this job
      // (see handleFileChange) -- that's an intentional supersession, not a
      // failure worth surfacing, so only show the error if still relevant.
      if (sourceRevisionRef.current === myRevision) {
        setGenError("Couldn't generate a pattern from that image.");
      }
    } finally {
      setIsProcessing(false);
    }
  }

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activeColorIndex === null || !pattern) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cellIndex = cellIndexFromEvent(e, canvas, cellSize, pattern.width, pattern.height);
    if (cellIndex === null) return;
    const painted = paintStitch(pattern, cellIndex, activeColorIndex);
    strokeRef.current = { pattern: painted, lastCell: cellIndex };
    redrawWith(painted);
    canvas.setPointerCapture(e.pointerId);
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!strokeRef.current || activeColorIndex === null || !pattern) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cellIndex = cellIndexFromEvent(e, canvas, cellSize, pattern.width, pattern.height);
    if (cellIndex === null || cellIndex === strokeRef.current.lastCell) return;
    const painted = paintStitch(strokeRef.current.pattern, cellIndex, activeColorIndex);
    strokeRef.current = { pattern: painted, lastCell: cellIndex };
    redrawWith(painted);
  }

  function handleCanvasPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!strokeRef.current) return;
    history.set(strokeRef.current.pattern);
    strokeRef.current = null;
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
  }

  function handleCanvasDrop(e: React.DragEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!pattern) return;
    const sourceIndexRaw = e.dataTransfer.getData("text/plain");
    if (sourceIndexRaw === "") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cellIndex = cellIndexFromEvent(e, canvas, cellSize, pattern.width, pattern.height);
    if (cellIndex === null) return;
    history.set(fillCluster(pattern, cellIndex, Number(sourceIndexRaw)));
  }

  function handleLegendDrop(targetIndex: number) {
    return (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!pattern) return;
      const sourceIndexRaw = e.dataTransfer.getData("text/plain");
      if (sourceIndexRaw === "") return;
      const sourceIndex = Number(sourceIndexRaw);
      if (sourceIndex === targetIndex) return;
      history.set(mergeColors(pattern, sourceIndex, targetIndex));
      if (activeColorIndex === sourceIndex) setActiveColorIndex(null);
    };
  }

  function openColorEditor(paletteIndex: number) {
    if (!pattern) return;
    setEditingColorIndex(paletteIndex);
    setEditingDraftHex(rgbToHex(pattern.palette[paletteIndex].rgb));
  }

  function commitColorEdit() {
    if (editingColorIndex === null || !pattern) return;
    history.set(editColorRgb(pattern, editingColorIndex, hexToRgb(editingDraftHex)));
    setEditingColorIndex(null);
  }

  function commitAddColor() {
    if (!pattern) return;
    history.set(addColor(pattern, hexToRgb(addColorDraftHex)));
    setAddingColor(false);
  }

  function startRename(paletteIndex: number, currentName: string) {
    setRenameDraft(currentName);
    setRenamingIndex(paletteIndex);
  }

  function commitRename() {
    if (renamingIndex !== null && pattern) {
      history.set(renameColor(pattern, renamingIndex, renameDraft));
    }
    setRenamingIndex(null);
  }

  function baseFileName(): string {
    return pattern?.name ?? "cross-stitch-pattern";
  }

  function commitNameChange() {
    if (!pattern) return;
    history.set(renamePattern(pattern, nameDraft));
  }

  function handleDownloadEditable() {
    if (!pattern) return;
    const json = serializePattern(pattern);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseFileName()}_editable.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleOpenFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOpenError(null);
    file
      .text()
      .then(async (text) => {
        const loaded = deserializePattern(text);
        const fallbackName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]editable$/, "");
        const withName = { ...loaded, name: loaded.name ?? fallbackName };
        history.reset(withName);
        setActiveColorIndex(null);
        cancelPatternJob();
        ++sourceRevisionRef.current;
        if (withName.sourceImage) {
          // Re-decode the embedded photo so Regenerate keeps working after
          // reopening a save, not just the photo-underlay/Move tool (G-012).
          try {
            const decoded = await decodeSourceImage(withName.sourceImage.dataUrl);
            setPixelBuffer(decoded.pixelBuffer);
            setSourceImageMeta({
              dataUrl: decoded.originalDataUrl,
              naturalWidth: decoded.naturalWidth,
              naturalHeight: decoded.naturalHeight,
            });
            setSourceFileName(fallbackName);
          } catch {
            // The grid/palette are still perfectly valid without this --
            // only Regenerate/Move/photo-underlay become unavailable.
            setPixelBuffer(null);
            setSourceImageMeta(null);
          }
        } else {
          setPixelBuffer(null);
          setSourceImageMeta(null);
        }
      })
      .catch((err) => setOpenError(err instanceof Error ? err.message : "Couldn't open that file."));
  }

  function handleDownload(mode: ViewMode) {
    if (!pattern) return;
    setIsDownloading(true);
    setDownloadError(null);
    setTimeout(async () => {
      try {
        const compacted = compactUnusedColors(pattern);
        const canvas =
          mode === "realistic"
            ? await renderStitchPreviewToCanvas(compacted)
            : renderPatternToCanvas(compacted, mode, { aidaCount, sizeUnit });
        const suffix = mode === "realistic" ? "preview" : mode;
        await downloadCanvasAsPng(canvas, `${baseFileName()}_${suffix}.png`);
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : "Couldn't render that download.");
      } finally {
        setIsDownloading(false);
      }
    }, 0);
  }

  function handleExportA4Pages() {
    if (!pattern) return;
    setIsExportingA4(true);
    setTimeout(async () => {
      try {
        const compacted = compactUnusedColors(pattern);
        const result = await generateA4Export(compacted, a4Mode, { overlapCells: a4Overlap, baseName: baseFileName() });
        downloadBlob(result.blob, result.filename);
      } finally {
        setIsExportingA4(false);
      }
    }, 0);
  }

  const hasSourcePhoto = pixelBuffer !== null || sourceImageMeta !== null;

  return (
    <div className="flex h-screen flex-col bg-zinc-100 font-sans text-black dark:bg-zinc-950 dark:text-zinc-50">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-300 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="shrink-0 text-base font-semibold">Cross-Stitch Pattern Generator</h1>
        <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          Name:
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitNameChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            disabled={!pattern}
            className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
            aria-label="Pattern name"
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={history.undo}
            disabled={!history.canUndo}
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={history.redo}
            disabled={!history.canRedo}
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
          >
            Redo
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => openEditableInputRef.current?.click()}
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
          >
            Open editable pattern
          </button>
          <input ref={openEditableInputRef} type="file" accept="application/json" onChange={handleOpenFile} className="hidden" />
          <button
            type="button"
            onClick={handleDownloadEditable}
            disabled={!pattern}
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
          >
            Download editable
          </button>
        </div>
      </header>
      {openError && <p className="border-b border-red-300 bg-red-50 px-4 py-1 text-xs text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">{openError}</p>}

      <div className="flex flex-1 overflow-hidden">
        {/* Tools dock (left) */}
        <aside className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-zinc-300 bg-white py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Tools</span>
          <button
            type="button"
            onClick={() => setActiveColorIndex(null)}
            disabled={!pattern}
            title="Brush is active whenever a color is selected in the Colors dock"
            className={`flex h-10 w-10 items-center justify-center rounded border text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              activeColorIndex !== null
                ? "border-foreground bg-black/[.06] dark:bg-white/[.1]"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            Brush
          </button>
        </aside>

        {/* Center: Image window + Processing-params dock */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-zinc-300 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-sm font-medium">
              {pattern ? `${pattern.width} × ${pattern.height} stitches, ${pattern.palette.length} colors` : "No pattern yet"}
            </span>
            {pattern && (
              <div className="ml-auto flex gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="view-mode" checked={viewMode === "color"} onChange={() => setViewMode("color")} />
                  Color
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="view-mode" checked={viewMode === "bw"} onChange={() => setViewMode("bw")} />
                  Black &amp; white
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="view-mode"
                    checked={viewMode === "realistic"}
                    onChange={() => setViewMode("realistic")}
                  />
                  Realistic preview
                </label>
              </div>
            )}
          </div>

          <div className="flex flex-1 items-center justify-center overflow-auto p-4">
            {!pattern && sourceImageMeta && (
              // eslint-disable-next-line @next/next/no-img-element -- data URL, not a static asset next/image can optimize
              <img
                src={sourceImageMeta.dataUrl}
                alt="Uploaded photo"
                className="max-h-full max-w-full border border-zinc-300 dark:border-zinc-700"
              />
            )}
            {!pattern && !sourceImageMeta && (
              <p className="text-sm text-zinc-500">Upload an image in the Processing params dock below to get started.</p>
            )}
            {pattern && viewMode !== "realistic" && (
              <canvas
                ref={canvasRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleCanvasDrop}
                className={`touch-none border border-zinc-300 dark:border-zinc-700 ${activeColorIndex !== null ? "cursor-crosshair" : ""}`}
              />
            )}
            {pattern && viewMode === "realistic" && realisticPreviewUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- data URL, not a static asset next/image can optimize
              <img
                src={realisticPreviewUrl}
                alt="Cross-stitch pattern preview"
                className="max-h-full max-w-full border border-zinc-300 dark:border-zinc-700"
              />
            )}
            {pattern && viewMode === "realistic" && previewError && (
              <div className="flex items-center gap-3 rounded border border-red-300 p-3 text-sm text-red-600 dark:border-red-800 dark:text-red-400">
                <span>{previewError}</span>
                <button
                  type="button"
                  onClick={() => setPreviewRetryToken((t) => t + 1)}
                  className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Processing-params dock */}
          <div className="flex flex-wrap items-end gap-4 border-t border-zinc-300 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="image-input">
                Image
              </label>
              <input
                id="image-input"
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={isLoadingImage || isProcessing}
                className="text-sm"
              />
              {isLoadingImage && <p className="text-xs text-zinc-500">Reading image…</p>}
              {sourceFileName && <p className="text-xs text-zinc-500">Loaded: {sourceFileName}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Pattern size (longer side)</span>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {(["small", "medium", "large"] as const).map((preset) => (
                  <label key={preset} className="flex items-center gap-1">
                    <input type="radio" name="size-preset" checked={sizePreset === preset} onChange={() => setSizePreset(preset)} />
                    {preset[0].toUpperCase() + preset.slice(1)} ({SIZE_PRESETS[preset]})
                  </label>
                ))}
                <label className="flex items-center gap-1">
                  <input type="radio" name="size-preset" checked={sizePreset === "custom"} onChange={() => setSizePreset("custom")} />
                  Custom
                  <input
                    type="number"
                    min={MIN_STITCHES}
                    max={MAX_STITCHES}
                    value={customSize}
                    onChange={(e) => {
                      setSizePreset("custom");
                      setCustomSize(Number(e.target.value));
                    }}
                    className="w-20 rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
              </div>
              <p className="text-xs text-zinc-500">
                ≈ {formatFinishedDimension(longerSideStitches, aidaCount, sizeUnit)} on the longer side at {aidaCount}-count Aida
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Fabric count</span>
              <div className="flex items-center gap-2 text-sm">
                <select
                  value={aidaCount}
                  onChange={(e) => setAidaCount(Number(e.target.value))}
                  className="rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {STANDARD_AIDA_COUNTS.map((count) => (
                    <option key={count} value={count}>
                      {count}-count
                    </option>
                  ))}
                </select>
                <div className="flex items-center overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
                  {(["in", "cm"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setSizeUnit(unit)}
                      className={`px-2 py-0.5 text-sm transition-colors ${
                        sizeUnit === unit ? "bg-foreground text-background" : "hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="color-count">
                Number of colors ({colorCount})
              </label>
              <input
                id="color-count"
                type="range"
                min={MIN_COLORS}
                max={MAX_COLORS}
                value={colorCount}
                onChange={(e) => setColorCount(Number(e.target.value))}
                className="max-w-[200px]"
              />
              <div className="flex items-center overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
                {(
                  [
                    { mode: "latest", label: "Latest" },
                    { mode: "original", label: "Original" },
                  ] as const
                ).map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setGenerationMode(mode)}
                    className={`px-2 py-0.5 text-sm transition-colors ${
                      generationMode === mode ? "bg-foreground text-background" : "hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!hasSourcePhoto || isProcessing || isLoadingImage}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {isProcessing ? `${pattern ? "Regenerating" : "Generating"}… ${Math.round(progress * 100)}%` : pattern ? "Regenerate" : "Generate pattern"}
            </button>
            {genError && <p className="text-sm text-red-600 dark:text-red-400">{genError}</p>}
          </div>
        </main>

        {/* Colors dock (right) */}
        <aside className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto border-l border-zinc-300 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Colors</span>
            <button
              type="button"
              onClick={() => {
                setAddColorDraftHex("#808080");
                setAddingColor(true);
              }}
              disabled={!pattern}
              className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
            >
              + Add
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Drag a color onto another to merge them. Drag a color onto the picture to fill that region. Click a color to
            select it (Brush), then click or drag across the picture to paint. Double-click a name to rename it.
          </p>

          {pattern &&
            [...pattern.palette]
              .sort((a, b) => b.count - a.count)
              .map((color) => (
                <div
                  key={color.index}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", String(color.index))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleLegendDrop(color.index)}
                  onClick={() => setActiveColorIndex(activeColorIndex === color.index ? null : color.index)}
                  className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm transition-colors ${
                    activeColorIndex === color.index
                      ? "border-foreground bg-black/[.04] dark:bg-white/[.08]"
                      : "border-transparent hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openColorEditor(color.index);
                    }}
                    style={{ backgroundColor: rgbToHex(color.rgb) }}
                    className="h-5 w-5 shrink-0 rounded border border-zinc-400 dark:border-zinc-600"
                    aria-label={`Edit ${color.name}`}
                  />
                  <span className="w-4 shrink-0 text-center">{color.symbol}</span>
                  {renamingIndex === color.index ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setRenamingIndex(null);
                      }}
                      className="w-0 min-w-0 flex-1 rounded border border-zinc-400 bg-transparent px-1 dark:border-zinc-600"
                    />
                  ) : (
                    <span
                      className="flex-1 truncate"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startRename(color.index, color.name);
                      }}
                      title="Double-click to rename"
                    >
                      {color.name}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-zinc-500">{color.count} sts</span>
                </div>
              ))}

          {editingColorIndex !== null && (
            <div className="flex flex-col gap-2 rounded border border-zinc-300 p-3 dark:border-zinc-700">
              <HexColorPicker color={editingDraftHex} onChange={setEditingDraftHex} />
              <div className="flex gap-2">
                <button type="button" onClick={commitColorEdit} className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background">
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => setEditingColorIndex(null)}
                  className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium dark:border-zinc-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {addingColor && (
            <div className="flex flex-col gap-2 rounded border border-zinc-300 p-3 dark:border-zinc-700">
              <HexColorPicker color={addColorDraftHex} onChange={setAddColorDraftHex} />
              <div className="flex gap-2">
                <button type="button" onClick={commitAddColor} className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background">
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setAddingColor(false)}
                  className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium dark:border-zinc-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Export dock (bottom) */}
      <footer className="flex flex-wrap items-center gap-3 border-t border-zinc-300 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => handleDownload("color")}
          disabled={!pattern || isDownloading}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
        >
          {isDownloading ? "Preparing…" : "Download color PNG"}
        </button>
        <button
          type="button"
          onClick={() => handleDownload("bw")}
          disabled={!pattern || isDownloading}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
        >
          {isDownloading ? "Preparing…" : "Download black & white PNG"}
        </button>
        <button
          type="button"
          onClick={() => handleDownload("realistic")}
          disabled={!pattern || isDownloading}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
        >
          {isDownloading ? "Preparing…" : "Download realistic preview PNG"}
        </button>
        {downloadError && <p className="text-sm text-red-600 dark:text-red-400">{downloadError}</p>}

        <div className="ml-auto flex flex-wrap items-center gap-3 rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">
          <span className="text-sm font-medium">Export as A4 pages</span>
          <div className="flex items-center overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
            {(["color", "bw"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setA4Mode(mode)}
                className={`px-2 py-0.5 text-sm transition-colors ${
                  a4Mode === mode ? "bg-foreground text-background" : "hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                }`}
              >
                {mode === "color" ? "Color" : "B&W"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm">
            Overlap:
            <select
              value={a4Overlap}
              onChange={(e) => setA4Overlap(Number(e.target.value) as OverlapCells)}
              className="rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value={0}>0</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </label>
          {a4LayoutPreview && (
            <span className="text-xs text-zinc-500">
              {a4LayoutPreview.columns} × {a4LayoutPreview.rows} pages — {a4LayoutPreview.pages.length + 1} total (incl. legend)
            </span>
          )}
          <button
            type="button"
            onClick={handleExportA4Pages}
            disabled={!pattern || isExportingA4}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
          >
            {isExportingA4 ? "Preparing…" : "Export ZIP"}
          </button>
        </div>
      </footer>
    </div>
  );
}
