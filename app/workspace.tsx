"use client";

import { type DragEvent, type MouseEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { downloadPatternLoadReport, reportPatternLoadFailure } from "@/lib/editor/error-report";
import { mergeColors, renamePattern, resizeCanvas, type CanvasResizeDelta } from "@/lib/editor/pattern-edit";
import { applyQuickMirrorWithSelection, effectiveSymmetryAxes, fillSymmetric, NO_SYMMETRY, type QuickMirror, type SymmetryAxes } from "@/lib/editor/symmetry";
import { oxsImportNotice } from "@/lib/editor/oxs";
import { loadPatternFromFile } from "@/lib/editor/pattern-import";
import { openPixelArtFile } from "@/lib/editor/pixel-art-file";
import { DEFAULT_PIXEL_ART_NAME } from "@/lib/editor/pixel-art-import";
import { STANDARD_AIDA_COUNTS } from "@/lib/export/finished-size";
import { getProjectStore } from "@/lib/editor/project-store";
import { useProjectAutosave } from "@/lib/editor/use-project-autosave";
import { useUndoHistory } from "@/lib/editor/use-undo-history";
import { isReleasedEnhancementMode } from "@/lib/pipeline/enhance";
import type { StitchPattern } from "@/lib/types";
import { ChartPane } from "./components/chart-pane";
import { ColorsDock } from "./components/colors-dock";
import { ConfirmNewChart } from "./components/confirm-new-chart";
import { ContextBar } from "./components/context-bar";
import { ExportControls } from "./components/export-controls";
import { ImageWindow } from "./components/image-window";
import { Inspector, type InspectorTab } from "./components/inspector";
import { isViewOnlyMode } from "./editor-types";
import { createBlankPattern, isPhotoFree } from "@/lib/editor/blank-pattern";
import { SelectionBar, WorkspaceNotices } from "./components/panels";
import { PhotoPane } from "./components/photo-pane";
import { StatusBar } from "./components/status-bar";
import { ToolRail } from "./components/tool-rail";
import { PillButton } from "./components/ui";
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

const DEFAULT_NAME = "cross-stitch-pattern";

/**
 * The editor shell (G-012; restructured to direction 1b in G-045): the pattern's undo history plus the state several
 * panes share, wired to the hooks in app/hooks and the components in app/components (D108). Every edit goes through
 * `history.set` as one undo step.
 *
 * The frame is 1b's: a tool rail, a context bar over the chart well with a status bar beneath it, and one inspector on
 * the right showing a single pane at a time.
 */
export default function Workspace() {
  const history = useUndoHistory<StitchPattern | null>(null);
  const pattern = history.state;
  const { options, update: updateOption } = useWorkspaceOptions();
  const source = useSourceImage();
  // The enhanced preview replaces the plain photo only before the first Generate; afterwards the grid views take over.
  const enhancementMode = isReleasedEnhancementMode(options.enhancementMode) ? options.enhancementMode : "off";
  const photoPreview = useEnhancePreview(source.pixelBuffer, source.meta?.dataUrl ?? null, enhancementMode, pattern === null);

  const [viewMode, setViewMode] = useState<ViewMode>("color");
  const [activeTool, setActiveTool] = useState<Tool>("brush");
  const [activeColorIndex, setActiveColorIndex] = useState<number | null>(null);
  /**
   * Isolate and the threads lit for it (G-045 M4). Isolate is a way of looking at the chart rather than a tool, so it
   * stays on while you paint, and lighting a thread is independent of choosing one to paint with.
   */
  const [isolate, setIsolate] = useState(false);
  const [litColorIndices, setLitColorIndices] = useState<ReadonlySet<number>>(new Set());
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("photo");
  // Symmetry axes live outside the undo history: a toggle is not an undo step, and undo or redo leaves them as they
  // are (G-037). Diagonals exist only on a square canvas, so a resize, undo, redo or open that makes the canvas
  // non-square turns them off for good, adjusted during render like other derived state.
  const [symmetry, setSymmetry] = useState<SymmetryAxes>(NO_SYMMETRY);
  if (pattern && pattern.width !== pattern.height && (symmetry.diagonal || symmetry.antidiagonal)) {
    setSymmetry({ ...symmetry, diagonal: false, antidiagonal: false });
  }
  const liveSymmetry = pattern ? effectiveSymmetryAxes(symmetry, pattern.width, pattern.height) : NO_SYMMETRY;
  // The empty-grid panel (G-040): a new key on every request remounts it with fresh fields.
  // The rail renders both file inputs; the workspace holds their refs so the first-run cards click the very same
  // elements rather than carrying a second pair (and the specs keep finding them where they always were).
  const openInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pixelArtInputRef = useRef<HTMLInputElement>(null);
  /** The start screen, reached from New while a chart is open. Getting there costs nothing; the confirm comes when a
   *  card is actually chosen, which is what replaces the one autosaved chart. */
  const [startingNew, setStartingNew] = useState(false);
  const [pendingStart, setPendingStart] = useState<null | (() => void)>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openNotice, setOpenNotice] = useState<string | null>(null);
  // A color editor's live draft (G-033): shown only while it was derived from the current pattern, so any real edit,
  // undo or new document drops it without an effect.
  const [colorPreview, setColorPreview] = useState<{ base: StitchPattern; next: StitchPattern } | null>(null);
  // Bumped whenever the palette is replaced wholesale (a new document or a generation), so open editors close.
  const [documentId, setDocumentId] = useState(0);
  const [nameDraft, setNameDraft] = useState(pattern?.name ?? DEFAULT_NAME);
  const [lastCommittedName, setLastCommittedName] = useState(pattern?.name);

  // Re-sync the name draft only when the committed name changes (undo, regenerate, another file), not on every
  // keystroke; adjusting state during render avoids an extra effect pass.
  if (pattern?.name !== lastCommittedName) {
    setLastCommittedName(pattern?.name);
    setNameDraft(pattern?.name ?? DEFAULT_NAME);
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const navigatorCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // The tool hooks need the renderer and the renderer needs the selection they own; they read it through this ref,
  // only inside event handlers, after the effect below has assigned it.
  const rendererRef = useRef<ChartRenderer | null>(null);

  // The hook skips zoom levels that would render the same cell size, so it needs to know what a level renders as.
  const cellSizeAt = useCallback((zoom: number) => computeCellSize(pattern, zoom), [pattern]);
  const panZoom = usePanZoom(scrollerRef, frameRef, pattern !== null, cellSizeAt);
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
    isolate,
    litColorIndices,
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
    setLitColorIndices(new Set());
    select.clear();
  }

  /** Lands a restored or opened pattern in every piece of state that depends on it, including its embedded photo. */
  async function loadPatternIntoWorkspace(loaded: StitchPattern, fallbackName: string, savedSymmetry: SymmetryAxes = NO_SYMMETRY) {
    const withName = { ...loaded, name: loaded.name ?? fallbackName };
    history.reset(withName);
    resetDocumentView();
    setSymmetry(savedSymmetry);
    setInspectorTab("threads");
    setStartingNew(false);
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
      // A finished chart is about its threads, so the inspector follows the work rather than staying on the settings.
      setInspectorTab("threads");
      // The first generate is the undo baseline; a regenerate is an ordinary undoable step (G-012).
      if (isFirst) {
        // A first Generate starts a new document with every symmetry toggle off (G-037).
        setSymmetry(NO_SYMMETRY);
        history.reset(next);
      } else history.set(next);
    },
  });

  /**
   * Reaching the start screen costs nothing; choosing a card is what replaces the one autosaved chart, so that is
   * where the confirm sits (Atelier, B - Confirm new chart). With no chart open there is nothing to lose: act at once.
   */
  function startNewChart(action: () => void) {
    if (!pattern) {
      action();
      return;
    }
    setPendingStart(() => action); // a function in state needs the updater form, or React would call it
  }

  function discardForNewChart() {
    void getProjectStore().save(null);
    history.reset(null);
    resetDocumentView();
    select.clear();
    setLitColorIndices(new Set());
    setActiveColorIndex(null);
    generation.setError(null);
    setOpenError(null);
    setOpenNotice(null);
  }

  function handleImageFile(file: File) {
    generation.setError(null);
    setOpenNotice(null);
    void source.loadFile(file, {
      // A new photo is a new document: fresh history, shown as is until Generate.
      onLoaded: () => {
        history.reset(null);
        resetDocumentView();
        setInspectorTab("photo");
        setStartingNew(false);
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
      cancelSelection: select.cancel,
      hasSelection: select.selection !== null,
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
    // A merge renumbers palette indices, so lit indices could now point at other colors.
    if (litColorIndices.size > 0) setLitColorIndices(new Set());
  }

  /** A quick mirror (G-037): any floating selection is merged and the mirror applied, committed as one undo step. */
  function applyMirror(kind: QuickMirror) {
    if (!pattern || (kind === "upper-left-half-corner" && pattern.width !== pattern.height)) return;
    history.set(applyQuickMirrorWithSelection(pattern, select.selection, kind));
    select.release();
  }

  /**
   * Lights or unlights one thread for Isolate. Turning the first one on turns Isolate on, so the eye does something
   * visible; putting the last one out turns it off again, so the control never claims to be isolating nothing (D158).
   */
  function toggleLit(index: number) {
    setLitColorIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        if (next.size === 0) setIsolate(false);
      } else {
        next.add(index);
        setIsolate(true);
      }
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
    setStartingNew(false);
    setInspectorTab("threads");
    await source.adoptPatternPhoto(blank, blank.name ?? "cross-stitch-pattern");
  }

  /**
   * Starts a chart from pixel art (G-049): one pixel per stitch, no photo, so Generate stays unavailable exactly as it
   * does for a blank chart. A refused file changes nothing — the message goes to the same place a failed Open does,
   * and whatever was open is still open.
   */
  async function importPixelArt(file: File) {
    const { error, pattern: imported } = await openPixelArtFile(file);
    if (error !== null) {
      setOpenError(error);
      setStartingNew(true);
      return;
    }
    generation.setError(null);
    setOpenError(null);
    setOpenNotice(null);
    history.reset(imported);
    resetDocumentView();
    setStartingNew(false);
    setInspectorTab("threads");
    await source.adoptPatternPhoto(imported, imported.name ?? DEFAULT_PIXEL_ART_NAME);
  }

  function applyResize(delta: CanvasResizeDelta) {
    if (!pattern) return;
    history.set(resizeCanvas(pattern, delta)); // throws on an invalid size; the pane shows the message
  }

  const photoFree = isPhotoFree(pattern);

  // The one definition of "the start screen is up": the Image window draws it on this, and New goes inert on it,
  // because New is what opens it. Computed here so the two cannot drift apart.
  const startScreenVisible = startingNew || (pattern === null && source.meta === null);

  return (
    <div className="flex h-screen bg-app font-sans text-ink">
      {/* 1b draws no visible title, but the document still needs one heading: for assistive technology, and as the witness that the app booted. */}
      <h1 className="sr-only">Cross-Stitch Pattern Generator</h1>
      <ToolRail
        activeTool={activeTool}
        disabled={!pattern || startingNew}
        onSelect={switchTool}
        squareCanvas={pattern !== null && pattern.width === pattern.height}
        onMirror={applyMirror}
        onNewChart={() => setStartingNew(true)}
        newChartDisabled={startScreenVisible}
      />

      {/*
        Both inputs stay mounted and keep their names. They used to live behind the rail's menu; with that gone they
        belong to the workspace, which owns their refs -- a control that exists only inside a transient screen cannot
        be reached by assistive technology, by a script, or by anything addressing it by name.
      */}
      <label className="hidden" title="Import pixel art as a chart">
        <span id="pixel-art-input-label">Pixel art</span>
        <input
          ref={pixelArtInputRef}
          id="pixel-art-input"
          type="file"
          accept="image/png,image/gif,image/webp,image/bmp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importPixelArt(file);
          }}
        />
      </label>
      <label className="hidden" title="Choose a photo to generate a chart from">
        <span id="image-input-label">Image</span>
        <input
          ref={imageInputRef}
          id="image-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleImageFile(file);
          }}
          disabled={source.isLoading || generation.isProcessing}
        />
      </label>
      <input
        ref={openInputRef}
        type="file"
        aria-label="Open pattern file"
        accept=".json,.zip,.cspzip,.oxs,application/json,application/zip"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleOpenPattern(file);
        }}
        className="hidden"
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/*
          The start screen owns the bar while it is up (Owner, 2026-09-23). Select's own bar has no way back, and
          the tool rail is disabled over the start screen, so leaving it here stranded a reader with a selection in
          hand: the "Back to your chart" button lives in the bar it replaced.
        */}
        {activeTool === "select" && pattern && !startingNew ? (
          <SelectionBar
            hasSelection={select.selection !== null}
            hasClipboard={select.clipboard !== null}
            selection={select.selection}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.undo}
            onRedo={history.redo}
            onCopy={select.copy}
            onPaste={select.paste}
            onDuplicate={select.duplicate}
            onFill={() => activeColorIndex !== null && select.fill(activeColorIndex)}
            canFill={activeColorIndex !== null}
            onFlipHorizontal={select.flipHorizontal}
            onFlipVertical={select.flipVertical}
            onRotateClockwise={select.rotateClockwise}
            onRotateAnticlockwise={select.rotateAnticlockwise}
            onCrop={select.crop}
            onCancel={select.cancel}
            onDeselect={select.merge}
          />
        ) : (
          <ContextBar
            pattern={pattern}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.undo}
            onRedo={history.redo}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            canvasColor={options.canvasColor}
            onCanvasColorChange={(hex) => updateOption("canvasColor", hex)}
            sourceFileName={source.fileName}
            isLoadingImage={source.isLoading}
            hasSourcePhoto={source.hasPhoto}
            isolate={isolate}
            onIsolateChange={setIsolate}
            litCount={litColorIndices.size}
            symmetry={liveSymmetry}
            squareCanvas={pattern !== null && pattern.width === pattern.height}
            onToggleSymmetry={(axis) => setSymmetry((current) => ({ ...current, [axis]: !current[axis] }))}
            activeColorIndex={activeColorIndex}
            startingNew={startingNew}
            onBackToChart={() => setStartingNew(false)}
          />
        )}
        <WorkspaceNotices
          restoreFailure={restore.failure}
          onDownloadRestoreReport={() => restore.failure && downloadPatternLoadReport({ content: restore.failure.payload })}
          onDismissRestoreFailure={restore.dismissFailure}
          openError={openError}
          openNotice={openNotice}
          exportError={exports.exportError}
          a4Layout={paginatesAsA4(exports.exportKind) ? exports.a4LayoutPreview : null}
        />
        {pendingStart !== null && pattern && (
          <ConfirmNewChart
            pattern={pattern}
            onExportEditable={exports.exportEditableNow}
            onKeepEditing={() => setPendingStart(null)}
            onStartNew={() => {
              const action = pendingStart;
              setPendingStart(null);
              discardForNewChart();
              action();
            }}
          />
        )}

        <ImageWindow
          scrollerRef={scrollerRef}
          frameRef={frameRef}
          canvasRef={canvasRef}
          pattern={pattern}
          cellSize={cellSize}
          sourceMeta={source.meta}
          startScreen={startScreenVisible}
          viewMode={viewMode}
          activeTool={activeTool}
          activeColorIndex={activeColorIndex}
          startingNew={startingNew}
          onChoosePhoto={() => startNewChart(() => imageInputRef.current?.click())}
          onCreateBlank={(width, height) => startNewChart(() => void createBlankChart(width, height))}
          onImportPixelArt={() => startNewChart(() => pixelArtInputRef.current?.click())}
          options={options}
          onAidaCountChange={(count) => updateOption("aidaCount", count)}
          onOpenPatternFile={() => startNewChart(() => openInputRef.current?.click())}
          isLoadingImage={source.isLoading}
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

        <StatusBar
          pattern={startingNew ? null : pattern}
          aidaCount={options.aidaCount}
          sizeUnit={options.sizeUnit}
          autosaveStatus={autosaveStatus}
          hasPattern={pattern !== null && !startingNew}
          zoomLevel={panZoom.zoomLevel}
          onZoomIn={() => panZoom.zoomBy(ZOOM_STEP)}
          onZoomOut={() => panZoom.zoomBy(1 / ZOOM_STEP)}
          onResetZoom={panZoom.resetZoom}
        />
      </main>

      <Inspector
        // 1b's first run shows the Photo pane and no exports. The start screen therefore forces that pane rather
        // than leaving sixteen thread rows and the exports disabled behind it, and the Photo tab locks with the
        // other two -- two tabs reading dead beside one reading live is the inconsistency, not the disabling.
        tab={startingNew ? "photo" : inspectorTab}
        onTabChange={setInspectorTab}
        disabled={{ chart: pattern === null || startingNew, threads: pattern === null || startingNew }}
        photo={
          photoFree && !startingNew ? (
            <p className="p-4 text-[13px] text-muted">This chart was started from an empty canvas, so it has no photo settings.</p>
          ) : (
            <PhotoPane
              options={options}
              onChange={updateOption}
              isProcessing={generation.isProcessing}
              progress={generation.progress}
              queueMessage={generation.queueMessage}
              hasPattern={pattern !== null && !startingNew}
              hasPhoto={!startingNew && source.hasPhoto}
              sourceSize={source.meta ? { width: source.meta.naturalWidth, height: source.meta.naturalHeight } : null}
              isLoadingImage={!startingNew && source.isLoading}
              onCancel={generation.cancel}
              error={generation.error}
            />
          )
        }
        chart={
          <ChartPane
            pattern={pattern}
            options={options}
            onChange={updateOption}
            name={nameDraft}
            onNameChange={setNameDraft}
            onNameCommit={() => pattern && history.set(renamePattern(pattern, nameDraft))}
            onResize={applyResize}
          />
        }
        threads={
          <ColorsDock
            pattern={pattern}
            dimmed={select.selection !== null}
            activeColorIndex={activeColorIndex}
            onActiveColorChange={setActiveColorIndex}
            litColorIndices={litColorIndices}
            onToggleLit={toggleLit}
            aidaCount={options.aidaCount}
            onChange={history.set}
            onPreviewChange={setColorPreview}
            documentId={documentId}
            onMergeColors={handleMergeColors}
          />
        }
        footer={
          // Nothing to export or generate while the start screen is up, and 1b draws no footer there.
          startingNew ? null : inspectorTab === "threads" ? (
            <ExportControls
              hasPattern={pattern !== null && !startingNew}
              exportKind={exports.exportKind}
              onExportKindChange={exports.setExportKind}
              onExport={exports.exportSelected}
              onExportAll={exports.exportAll}
              isExporting={exports.isExporting}
              isExportingAll={exports.isExportingAll}
              exportProgressText={exports.exportProgressText}
            />
          ) : // 1b draws Generate only once a photo is loaded ("B . Before generate"); the first run has no footer.
          inspectorTab === "photo" && !photoFree && source.hasPhoto ? (
            <PillButton
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => void generation.generate()}
              disabled={!source.hasPhoto || generation.isProcessing || source.isLoading}
            >
              {pattern ? "Regenerate" : "Generate pattern"}
            </PillButton>
          ) : null
        }
      />

      {/*
        The navigator is gone from the interface (Owner, 2026-09-18), but three specs read this canvas as their way of
        seeing which stitches got painted -- one pixel per stitch, true colours, independent of zoom and scroll. It is
        kept off-screen rather than hidden, because `display:none` would stop the renderer painting it at all, while a
        backing store set directly by the renderer is unaffected by being positioned away. Since G-045 M5 the specs
        address it by `data-testid`, so neither this element's role nor its text is load-bearing.
      */}
      <aside className="pointer-events-none fixed top-0 left-0 h-px w-px overflow-hidden">
        Navigator
        <canvas ref={navigatorCanvasRef} data-testid="navigator-raster" />
      </aside>
    </div>
  );
}
