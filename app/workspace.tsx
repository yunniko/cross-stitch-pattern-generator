"use client";

import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from "react";
import { downloadPatternLoadReport, reportPatternLoadFailure } from "@/lib/editor/error-report";
import { fillCluster, mergeColors, renamePattern, resizeCanvas, type CanvasResizeDelta } from "@/lib/editor/pattern-edit";
import { loadPatternFromFile } from "@/lib/editor/pattern-import";
import { getProjectStore } from "@/lib/editor/project-store";
import { useProjectAutosave } from "@/lib/editor/use-project-autosave";
import { useUndoHistory } from "@/lib/editor/use-undo-history";
import { isReleasedEnhancementMode } from "@/lib/pipeline/enhance";
import type { StitchPattern } from "@/lib/types";
import { ColorsDock } from "./components/colors-dock";
import { ImageWindow, ViewBar } from "./components/image-window";
import { OptionsPanel, ResizePanel, SelectionBar, WorkspaceNotices } from "./components/panels";
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
  const [showOptionsPanel, setShowOptionsPanel] = useState(false);
  // null while closed; a new key on every "Resize canvas…" click remounts the panel with fresh fields.
  const [resizePanelKey, setResizePanelKey] = useState<number | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigatorCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // The tool hooks need the renderer and the renderer needs the selection they own; they read it through this ref,
  // only inside event handlers, after the effect below has assigned it.
  const rendererRef = useRef<ChartRenderer | null>(null);

  const panZoom = usePanZoom(scrollerRef, pattern !== null);
  const cellSize = computeCellSize(pattern, panZoom.zoomLevel);
  const toolInputs = { canvasRef, rendererRef, pattern, cellSize, commit: history.set };
  const select = useSelectTool(toolInputs);
  const brush = useBrushTool({ ...toolInputs, activeColorIndex });
  const move = useMoveTool(toolInputs);
  const renderer = useChartRenderer({
    canvasRef,
    navigatorCanvasRef,
    pattern,
    viewMode,
    cellSize,
    activeTool,
    selection: select.selection,
    isSelectDragging: select.isDragging,
    highlightedColorIndices,
    canvasColor: options.canvasColor,
  });
  useEffect(() => {
    rendererRef.current = renderer;
  });

  function resetDocumentView() {
    setActiveColorIndex(null);
    panZoom.resetZoom();
    setHighlightedColorIndices(new Set());
    select.clear();
    setResizePanelKey(null);
  }

  /** Lands a restored or opened pattern in every piece of state that depends on it, including its embedded photo. */
  async function loadPatternIntoWorkspace(loaded: StitchPattern, fallbackName: string) {
    const withName = { ...loaded, name: loaded.name ?? fallbackName };
    history.reset(withName);
    resetDocumentView();
    await source.adoptPatternPhoto(withName, fallbackName);
  }

  const restore = useProjectRestore((restored) => void loadPatternIntoWorkspace(restored, restored.name ?? "cross-stitch-pattern"));
  const autosaveStatus = useProjectAutosave(pattern, restore.restored, getProjectStore());
  const exports = useExports(pattern, options);
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
      // The first generate is the undo baseline; a regenerate is an ordinary undoable step (G-012).
      if (isFirst) history.reset(next);
      else history.set(next);
    },
  });

  function handleImageFile(file: File) {
    generation.setError(null);
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
    loadPatternFromFile(file)
      .then((loaded) => loadPatternIntoWorkspace(loaded, file.name.replace(/\.[^.]+$/, "").replace(/[-_]editable$/, "")))
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

  function handleCanvasPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return;
    if (activeTool === "pan") panZoom.beginPan(e, canvas);
    else if (activeTool === "zoom") panZoom.zoomBy(e.shiftKey || e.altKey ? 1 / ZOOM_STEP : ZOOM_STEP);
    else if (activeTool === "move") move.onPointerDown(e, canvas);
    else if (activeTool === "select") select.onPointerDown(e, canvas);
    else if (activeTool === "fill") brush.fillAt(e, canvas);
    else if (activeTool === "brush") brush.onPointerDown(e, canvas);
  }

  function handleCanvasPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (panZoom.movePan(e) || move.onPointerMove(e) || select.onPointerMove(e)) return;
    brush.onPointerMove(e);
  }

  function handleCanvasPointerUp(e: PointerEvent<HTMLCanvasElement>) {
    if (panZoom.endPan(e, canvasRef.current) || move.onPointerUp(e) || select.onPointerUp(e)) return;
    brush.onPointerUp(e);
  }

  function handleCanvasDoubleClick(e: MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (canvas && activeTool === "brush") brush.onDoubleClick(e, canvas);
  }

  /** Dropping a legend color onto the picture fills that cell's 4-connected region with it. */
  function handleCanvasDrop(e: DragEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    const canvas = canvasRef.current;
    if (!pattern || raw === "" || !canvas) return;
    const cellIndex = cellIndexFromEvent(e, canvas, cellSize, pattern.width, pattern.height);
    if (cellIndex !== null) history.set(fillCluster(pattern, cellIndex, Number(raw)));
  }

  function handleMergeColors(sourceIndex: number, targetIndex: number) {
    if (!pattern || sourceIndex === targetIndex) return;
    history.set(mergeColors(pattern, sourceIndex, targetIndex));
    if (activeColorIndex === sourceIndex) setActiveColorIndex(null);
    // A merge renumbers palette indices, so highlighted indices could now point at other colors.
    if (highlightedColorIndices.size > 0) setHighlightedColorIndices(new Set());
  }

  function toggleHighlight(index: number) {
    setHighlightedColorIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
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
        onToggleOptions={() => setShowOptionsPanel((shown) => !shown)}
        onOpenResize={() => setResizePanelKey((key) => (key ?? 0) + 1)}
        exportKind={exports.exportKind}
        onExportKindChange={exports.setExportKind}
        onExport={exports.exportSelected}
        onExportAll={exports.exportAll}
        isExporting={exports.isExporting}
        isExportingAll={exports.isExportingAll}
      />
      <WorkspaceNotices
        restoreFailure={restore.failure}
        onDownloadRestoreReport={() => restore.failure && downloadPatternLoadReport({ content: restore.failure.payload })}
        onDismissRestoreFailure={restore.dismissFailure}
        openError={openError}
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
      {resizePanelKey !== null && pattern && <ResizePanel key={resizePanelKey} pattern={pattern} onApply={applyResize} onCancel={() => setResizePanelKey(null)} />}

      <div className="flex flex-1 overflow-hidden">
        <ToolsDock activeTool={activeTool} disabled={!pattern} onSelect={switchTool} />
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
            canvasRef={canvasRef}
            pattern={pattern}
            sourceMeta={source.meta}
            viewMode={viewMode}
            activeTool={activeTool}
            activeColorIndex={activeColorIndex}
            canvasColor={options.canvasColor}
            realisticPreviewUrl={renderer.realisticPreviewUrl}
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
          onMergeColors={handleMergeColors}
        />
      </div>
    </div>
  );
}
