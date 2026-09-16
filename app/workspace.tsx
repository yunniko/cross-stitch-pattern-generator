"use client";

import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from "react";
import { downloadPatternLoadReport, reportPatternLoadFailure } from "@/lib/editor/error-report";
import { mergeColors, renamePattern, resizeCanvas, type CanvasResizeDelta } from "@/lib/editor/pattern-edit";
import { applyQuickMirrorWithSelection, effectiveSymmetryAxes, fillSymmetric, NO_SYMMETRY, type QuickMirror, type SymmetryAxes } from "@/lib/editor/symmetry";
import { oxsImportNotice } from "@/lib/editor/oxs";
import { loadPatternFromFile } from "@/lib/editor/pattern-import";
import { STANDARD_AIDA_COUNTS } from "@/lib/export/finished-size";
import { getProjectStore } from "@/lib/editor/project-store";
import { useProjectAutosave } from "@/lib/editor/use-project-autosave";
import { useUndoHistory } from "@/lib/editor/use-undo-history";
import { isReleasedEnhancementMode } from "@/lib/pipeline/enhance";
import type { StitchPattern } from "@/lib/types";
import { ColorsDock } from "./components/colors-dock";
import { ImageWindow, ViewBar } from "./components/image-window";
import { isViewOnlyMode } from "./editor-types";
import { createBlankPattern, isPhotoFree } from "@/lib/editor/blank-pattern";
import { NewChartPanel, OptionsPanel, ResizePanel, SelectionBar, WorkspaceNotices } from "./components/panels";
import { ProcessingParams } from "./components/processing-params";
import { ToolsDock } from "./components/tools-dock";
import { TopBar } from "./components/top-bar";
import type { Tool, ViewMode } from "./editor-types";
import { cellIndexFromEvent, computeCellSize } from "./editor-geometry";
import { useBrushTool, useMoveTool, useSelectTool } from "./hooks/use-canvas-tools";
import { useChartRenderer, type ChartRenderer } from "./hooks/use-chart-renderer";
import { paginatesAsA4, useExports } from "./hooks/use-exports";
import { useGeneration } from "./hooks/use-generation";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts";
import { usePanZoom, ZOOM_STEP } from "./hooks/use-pan-zoom";
import { useEnhancePreview } from "./hooks/use-enhance-preview";
import { useProjectRestore } from "./hooks/use-project-restore";
import { useSourceImage } from "./hooks/use-source-image";
import { useWorkspaceOptions } from "./hooks/use-workspace-options";

/**
 * The editor shell (G-012): the pattern's undo history plus the state several docks share, wired to the hooks in
 * app/hooks and the components in app/components (D108). Every edit goes through `history.set` as one undo step.
 */
export default function Workspace() {
  const history = useUndoHistory<StitchPattern | null>(null);
  const pattern = history.state;
  const { options, update: updateOption } = useWorkspaceOptions();
  const source = useSourceImage();
  // The enhanced preview replaces the plain photo only before the first Generate; afterwards the grid views take over.
  const enhancementMode = isReleasedEnhancementMode(options.enhancementMode) ? options.enhancementMode : "off";
  const photoPreview = useEnhancePreview(source.pixelBuffer, enhancementMode, pattern === null);

  const [viewMode, setViewMode] = useState<ViewMode>("color");
  const [activeTool, setActiveTool] = useState<Tool>("brush");
  const [activeColorIndex, setActiveColorIndex] = useState<number | null>(null);
  const [highlightedColorIndices, setHighlightedColorIndices] = useState<ReadonlySet<number>>(new Set());
  // Symmetry axes live outside the undo history: a toggle is not an undo step, and undo or redo leaves them as they
  // are (G-037). Diagonals exist only on a square canvas, so a resize, undo, redo or open that makes the canvas
  // non-square turns them off for good, adjusted during render like other derived state.
  const [symmetry, setSymmetry] = useState<SymmetryAxes>(NO_SYMMETRY);
  if (pattern && pattern.width !== pattern.height && (symmetry.diagonal || symmetry.antidiagonal)) {
    setSymmetry({ ...symmetry, diagonal: false, antidiagonal: false });
  }
  const liveSymmetry = pattern ? effectiveSymmetryAxes(symmetry, pattern.width, pattern.height) : NO_SYMMETRY;
  const [showOptionsPanel, setShowOptionsPanel] = useState(false);
  // null while closed; a new key on every "Resize canvas…" click remounts the panel with fresh fields.
  const [resizePanelKey, setResizePanelKey] = useState<number | null>(null);
  // Same pattern for "New blank chart…" (G-040).
  const [newChartPanelKey, setNewChartPanelKey] = useState<number | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openNotice, setOpenNotice] = useState<string | null>(null);
  // A color editor's live draft (G-033): shown only while it was derived from the current pattern, so any real edit,
  // undo or new document drops it without an effect.
  const [colorPreview, setColorPreview] = useState<{ base: StitchPattern; next: StitchPattern } | null>(null);
  // Bumped whenever the palette is replaced wholesale (a new document or a generation), so open editors close.
  const [documentId, setDocumentId] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const navigatorCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // The tool hooks need the renderer and the renderer needs the selection they own; they read it through this ref,
  // only inside event handlers, after the effect below has assigned it.
  const rendererRef = useRef<ChartRenderer | null>(null);

  const panZoom = usePanZoom(scrollerRef, frameRef, pattern !== null);
  const cellSize = computeCellSize(pattern, panZoom.zoomLevel);
  const toolInputs = { frameRef, rendererRef, pattern, cellSize, commit: history.set };
  const select = useSelectTool(toolInputs);
  const brush = useBrushTool({ ...toolInputs, activeColorIndex, symmetry: liveSymmetry, replaceSince: history.replaceSince });
  const move = useMoveTool(toolInputs);
  const displayedPattern = colorPreview && colorPreview.base === pattern ? colorPreview.next : pattern;
  const renderer = useChartRenderer({
    canvasRef,
    frameRef,
    scrollerRef,
    navigatorCanvasRef,
    pattern: displayedPattern,
    viewMode,
    cellSize,
    activeTool,
    selection: select.selection,
    isSelectDragging: select.isDragging,
    highlightedColorIndices,
    canvasColor: options.canvasColor,
    symmetryAxes: liveSymmetry,
    // The renderer applies a zoom's anchor itself, between sizing the frame and measuring the view (D124, D135).
    applyZoomAnchor: panZoom.applyZoomAnchor,
  });
  useEffect(() => {
    rendererRef.current = renderer;
  });

  function resetDocumentView() {
    setDocumentId((id) => id + 1);
    setSymmetry(NO_SYMMETRY);
    setActiveColorIndex(null);
    panZoom.resetZoom();
    setHighlightedColorIndices(new Set());
    select.clear();
    setResizePanelKey(null);
  }

  /** Lands a restored or opened pattern in every piece of state that depends on it, including its embedded photo. */
  async function loadPatternIntoWorkspace(loaded: StitchPattern, fallbackName: string, savedSymmetry: SymmetryAxes = NO_SYMMETRY) {
    const withName = { ...loaded, name: loaded.name ?? fallbackName };
    history.reset(withName);
    resetDocumentView();
    setSymmetry(savedSymmetry);
    await source.adoptPatternPhoto(withName, fallbackName);
  }

  const restore = useProjectRestore((restored, savedSymmetry) => void loadPatternIntoWorkspace(restored, restored.name ?? "cross-stitch-pattern", savedSymmetry));
  const autosaveStatus = useProjectAutosave(pattern, restore.restored, getProjectStore(), liveSymmetry);
  const exports = useExports(pattern, options, liveSymmetry);
  const generation = useGeneration({
    options,
    pixelBuffer: source.pixelBuffer,
    sourceMeta: source.meta,
    sourceFileName: source.fileName,
    revisionRef: source.revisionRef,
    currentPattern: pattern,
    onGenerated: (next, isFirst) => {
      // A floating selection belongs to the replaced pattern and may be out of bounds: drop it, don't merge it.
      select.clear();
      setDocumentId((id) => id + 1);
      // The first generate is the undo baseline; a regenerate is an ordinary undoable step (G-012).
      if (isFirst) {
        // A first Generate starts a new document with every symmetry toggle off (G-037).
        setSymmetry(NO_SYMMETRY);
        history.reset(next);
      }
      else history.set(next);
    },
  });

  function handleImageFile(file: File) {
    generation.setError(null);
    setOpenNotice(null);
    void source.loadFile(file, {
      // A new photo is a new document: fresh history, shown as is until Generate.
      onLoaded: () => {
        history.reset(null);
        resetDocumentView();
      },
      onFailed: () => generation.setError("Couldn't read that image. Try a different file (JPEG, PNG, or WebP)."),
    });
  }

  function handleOpenPattern(file: File) {
    setOpenError(null);
    setOpenNotice(null);
    loadPatternFromFile(file)
      .then(async ({ pattern: loaded, oxsReport, symmetry: savedSymmetry }) => {
        await loadPatternIntoWorkspace(loaded, file.name.replace(/\.[^.]+$/, "").replace(/[-_]editable$/, ""), savedSymmetry);
        if (oxsReport) {
          const notice = oxsImportNotice(oxsReport, options.aidaCount, STANDARD_AIDA_COUNTS);
          if (notice.aidaCount !== undefined) updateOption("aidaCount", notice.aidaCount);
          setOpenNotice(notice.text);
        }
      })
      .catch((err) => {
        // Nothing was replaced, so the current pattern is still the "previous version" (Owner request, 2026-09-12).
        reportPatternLoadFailure({ source: "open-file", error: err, content: file, originalFileName: file.name });
        setOpenError(err instanceof Error ? err.message : "Couldn't open that file.");
      });
  }

  function switchTool(tool: Tool) {
    // Leaving Select merges whatever is floating, as pressing outside it would.
    if (activeTool === "select" && tool !== "select") select.merge();
    setActiveTool(tool);
  }

  useKeyboardShortcuts(
    {
      hasPattern: pattern !== null,
      hasSourceImage: pattern?.sourceImage !== undefined,
      activeTool,
      undo: history.undo,
      redo: history.redo,
      switchTool,
      setActiveTool,
      setViewMode,
      mergeSelection: select.merge,
    },
    scrollerRef
  );

  function handleCanvasPointerDown(e: PointerEvent<HTMLDivElement>) {
    const frame = frameRef.current;
    if (!frame || !pattern) return;
    // The realistic preview and the original photo only show the pattern: there, the chart pans and zooms but never edits (D121).
    if (isViewOnlyMode(viewMode) && activeTool !== "pan" && activeTool !== "zoom") return;
    if (activeTool === "pan") panZoom.beginPan(e, frame);
    else if (activeTool === "zoom") panZoom.zoomBy(e.shiftKey || e.altKey ? 1 / ZOOM_STEP : ZOOM_STEP, { clientX: e.clientX, clientY: e.clientY });
    else if (activeTool === "move") move.onPointerDown(e, frame);
    else if (activeTool === "select") select.onPointerDown(e, frame);
    else if (activeTool === "fill") brush.fillAt(e, frame);
    else if (activeTool === "brush") brush.onPointerDown(e, frame);
  }

  function handleCanvasPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (panZoom.movePan(e) || move.onPointerMove(e) || select.onPointerMove(e)) return;
    brush.onPointerMove(e);
  }

  function handleCanvasPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (panZoom.endPan(e, frameRef.current) || move.onPointerUp(e) || select.onPointerUp(e)) return;
    brush.onPointerUp(e);
  }

  function handleCanvasDoubleClick(e: MouseEvent<HTMLDivElement>) {
    const frame = frameRef.current;
    // Switched off in Options, a double-click stays two ordinary clicks (G-041).
    if (frame && activeTool === "brush" && !isViewOnlyMode(viewMode) && options.doubleClickFill) brush.onDoubleClick(e, frame);
  }

  /** Dropping a legend color onto the picture fills that cell's 4-connected region with it. */
  function handleCanvasDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    const frame = frameRef.current;
    if (!pattern || raw === "" || !frame || isViewOnlyMode(viewMode)) return;
    const cellIndex = cellIndexFromEvent(e, frame, cellSize, pattern.width, pattern.height);
    const paletteIndex = Number(raw);
    if (cellIndex !== null && Number.isInteger(paletteIndex)) history.set(fillSymmetric(pattern, cellIndex, liveSymmetry, paletteIndex, 4));
  }

  function handleMergeColors(sourceIndex: number, targetIndex: number) {
    if (!pattern || sourceIndex === targetIndex) return;
    history.set(mergeColors(pattern, sourceIndex, targetIndex));
    select.invalidateClipboard();
    if (activeColorIndex === sourceIndex) setActiveColorIndex(null);
    // A merge renumbers palette indices, so highlighted indices could now point at other colors.
    if (highlightedColorIndices.size > 0) setHighlightedColorIndices(new Set());
  }

  /** A quick mirror (G-037): any floating selection is merged and the mirror applied, committed as one undo step. */
  function applyMirror(kind: QuickMirror) {
    if (!pattern || (kind === "upper-left-half-corner" && pattern.width !== pattern.height)) return;
    history.set(applyQuickMirrorWithSelection(pattern, select.selection, kind));
    select.release();
  }

  function toggleHighlight(index: number) {
    setHighlightedColorIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  /**
   * Starts a chart from an empty canvas (G-040). `adoptPatternPhoto` clears the loaded photo, because the new chart has
   * none, which also cancels any generation or preview still running for the previous photo.
   */
  async function createBlankChart(width: number, height: number) {
    const blank = createBlankPattern(width, height);
    generation.setError(null);
    setOpenError(null);
    setOpenNotice(null);
    history.reset(blank);
    resetDocumentView();
    setNewChartPanelKey(null);
    await source.adoptPatternPhoto(blank, blank.name ?? "cross-stitch-pattern");
  }

  function applyResize(delta: CanvasResizeDelta) {
    if (!pattern) return;
    history.set(resizeCanvas(pattern, delta)); // throws on an invalid size; the panel shows the message
    setResizePanelKey(null);
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-100 font-sans text-black dark:bg-zinc-950 dark:text-zinc-50">
      <TopBar
        patternName={pattern?.name}
        onRename={(name) => pattern && history.set(renamePattern(pattern, name))}
        hasPattern={pattern !== null}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        autosaveStatus={autosaveStatus}
        onOpenPattern={handleOpenPattern}
        onNewBlankChart={() => setNewChartPanelKey((key) => (key ?? 0) + 1)}
        onToggleOptions={() => setShowOptionsPanel((shown) => !shown)}
        onOpenResize={() => setResizePanelKey((key) => (key ?? 0) + 1)}
        exportKind={exports.exportKind}
        onExportKindChange={exports.setExportKind}
        onExport={exports.exportSelected}
        onExportAll={exports.exportAll}
        isExporting={exports.isExporting}
        isExportingAll={exports.isExportingAll}
        exportProgressText={exports.exportProgressText}
      />
      <WorkspaceNotices
        restoreFailure={restore.failure}
        onDownloadRestoreReport={() => restore.failure && downloadPatternLoadReport({ content: restore.failure.payload })}
        onDismissRestoreFailure={restore.dismissFailure}
        openError={openError}
        openNotice={openNotice}
        exportError={exports.exportError}
        a4Layout={paginatesAsA4(exports.exportKind) ? exports.a4LayoutPreview : null}
      />
      {showOptionsPanel && <OptionsPanel options={options} onChange={updateOption} onClose={() => setShowOptionsPanel(false)} />}
      {activeTool === "select" && pattern && (
        <SelectionBar
          hasSelection={select.selection !== null}
          hasClipboard={select.clipboard !== null}
          onCopy={select.copy}
          onPaste={select.paste}
          onFlipHorizontal={select.flipHorizontal}
          onFlipVertical={select.flipVertical}
          onDeselect={select.merge}
        />
      )}
      {newChartPanelKey !== null && (
        <NewChartPanel key={newChartPanelKey} options={options} onCreate={(width, height) => void createBlankChart(width, height)} onCancel={() => setNewChartPanelKey(null)} />
      )}
      {resizePanelKey !== null && pattern && <ResizePanel key={resizePanelKey} pattern={pattern} onApply={applyResize} onCancel={() => setResizePanelKey(null)} />}

      <div className="flex flex-1 overflow-hidden">
        <ToolsDock
          activeTool={activeTool}
          disabled={!pattern}
          onSelect={switchTool}
          symmetry={liveSymmetry}
          squareCanvas={pattern !== null && pattern.width === pattern.height}
          onToggleSymmetry={(axis) => setSymmetry((current) => ({ ...current, [axis]: !current[axis] }))}
          onMirror={applyMirror}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <ViewBar
            pattern={pattern}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            canvasColor={options.canvasColor}
            onCanvasColorChange={(hex) => updateOption("canvasColor", hex)}
            zoomLevel={panZoom.zoomLevel}
            onZoomIn={() => panZoom.zoomBy(ZOOM_STEP)}
            onZoomOut={() => panZoom.zoomBy(1 / ZOOM_STEP)}
            onResetZoom={panZoom.resetZoom}
          />
          <ImageWindow
            scrollerRef={scrollerRef}
            frameRef={frameRef}
            canvasRef={canvasRef}
            pattern={pattern}
            cellSize={cellSize}
            sourceMeta={source.meta}
            viewMode={viewMode}
            activeTool={activeTool}
            activeColorIndex={activeColorIndex}
            previewError={renderer.previewError}
            onRetryPreview={renderer.retryPreview}
            enhancementActive={pattern === null && enhancementMode !== "off"}
            enhancedPreviewUrl={photoPreview.previewUrl}
            isPreparingEnhancedPreview={photoPreview.isPreparing}
            enhancedPreviewError={photoPreview.error}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onDoubleClick={handleCanvasDoubleClick}
            onDrop={handleCanvasDrop}
          />
          <ProcessingParams
            options={options}
            onChange={updateOption}
            onImageFile={handleImageFile}
            isLoadingImage={source.isLoading}
            isProcessing={generation.isProcessing}
            progress={generation.progress}
            sourceFileName={source.fileName}
            hasPattern={pattern !== null}
            hasSourcePhoto={source.hasPhoto}
            photoFree={isPhotoFree(pattern)}
            onGenerate={() => void generation.generate()}
            error={generation.error}
          />
        </main>
        <ColorsDock
          pattern={pattern}
          navigatorCanvasRef={navigatorCanvasRef}
          activeTool={activeTool}
          activeColorIndex={activeColorIndex}
          onActiveColorChange={setActiveColorIndex}
          highlightedColorIndices={highlightedColorIndices}
          onToggleHighlight={toggleHighlight}
          aidaCount={options.aidaCount}
          onChange={history.set}
          onPreviewChange={setColorPreview}
          documentId={documentId}
          onMergeColors={handleMergeColors}
        />
      </div>
    </div>
  );
}
