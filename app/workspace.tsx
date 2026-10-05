"use client";

import { type DragEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { brushStamp, type StampEdge } from "@/lib/editor/brush-stamp";
import { setCrashContext } from "@/lib/editor/crash-report";
import { useDrawingColours } from "./hooks/use-drawing-colours";
import { useSymmetryAxes } from "./hooks/use-symmetry-axes";
import { downloadPatternLoadReport, reportPatternLoadFailure } from "@/lib/editor/error-report";
import { mergeColors, renamePattern, setFabric } from "@/lib/editor/pattern-edit";
import { useChartFabric } from "./hooks/use-chart-fabric";
import { useEditorView } from "./hooks/use-editor-view";
import { useLitThreads } from "./hooks/use-lit-threads";
import { DEFAULT_CHART_NAME, useNameDraft } from "./hooks/use-name-draft";
import { applyQuickMirrorWithSelection, fillSymmetric, NO_SYMMETRY, type QuickMirror, type SymmetryAxes } from "@/lib/editor/symmetry";
import { oxsImportNotice } from "@/lib/editor/oxs";
import { loadPatternFromFile } from "@/lib/editor/pattern-import";
import { openPixelArtFile } from "@/lib/editor/pixel-art-file";
import { DEFAULT_PIXEL_ART_NAME } from "@/lib/editor/pixel-art-import";
import { STANDARD_AIDA_COUNTS } from "@/lib/export/finished-size";
import { getProjectStore } from "@/lib/editor/project-store";
import { useProjectAutosave } from "./hooks/use-project-autosave";
import { useDocumentHistory } from "./hooks/use-document-history";
import { AccountBadge } from "./components/auth/account-badge";
import type { StitchPattern } from "@/lib/types";
import { ChartPane } from "./components/chart-pane";
import { ColorsDock } from "./components/colors-dock";
import { ConfirmNewChart } from "./components/confirm-new-chart";
import { ContextBar } from "./components/context-bar";
import { ExportControls } from "./components/export-controls";
import { ImageWindow } from "./components/image-window";
import { Inspector } from "./components/inspector";
import { isKeyboardCursorTool, isViewOnlyMode, usesStitchKind } from "./editor-types";
import { createBlankPattern, isPhotoFree } from "@/lib/editor/blank-pattern";
import { WorkspaceNotices } from "./components/panels";
import { PhotoPane } from "./components/photo-pane";
import { TextPane } from "./components/text-pane";
import { letteringSelection, letteringStart } from "@/lib/editor/text-selection";
import type { LetteringBitmap } from "@/lib/editor/text-raster";
import { StatusBar } from "./components/status-bar";
import { ToolRail } from "./components/tool-rail";
import { PillButton } from "./components/ui";
import { cellIndexFromEvent, chartOrigin, computeCellSize } from "./editor-geometry";
import { useChartRenderer, type ChartRenderer } from "./hooks/use-chart-renderer";
import { paginatesAsA4, useExports } from "./hooks/use-exports";
import { longerSideFor, useGeneration } from "./hooks/use-generation";
import { useKeyboardCursor } from "./hooks/use-keyboard-cursor";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts";
import { usePanZoom, ZOOM_STEP } from "./hooks/use-pan-zoom";
import { EMPTY_SET } from "@/lib/editor/palette-set";
import { isNeutralAdjust, NEUTRAL_ADJUST } from "@/lib/pipeline/photo-adjust";
import { usePhotoAdjustPreview } from "./hooks/use-photo-adjust-preview";
import { useProjectRestore } from "./hooks/use-project-restore";
import { useColorPrediction } from "./hooks/use-color-prediction";
import { readToolOption, writeToolOption } from "@/lib/editor/tool-options";
import { useTools } from "./tools/use-tools";
import { useShellCommands } from "./commands/shell-commands";
import { useHeldPan } from "./hooks/use-held-pan";
import { CommandList } from "./components/command-list";
import { replaceDocument, type ReplaceEffects } from "@/lib/editor/document-replace-run";
import type { ColorPrediction } from "@/lib/pipeline/prediction";
import { useSourceImage } from "./hooks/use-source-image";
import { useWorkspaceOptions } from "./hooks/use-workspace-options";

/** Nothing for the cursor to carry; the renderer reads the outline only when there is a stitch to put it on. */
const NO_OUTLINE: readonly StampEdge[] = [];

/**
 * The editor shell (G-012; restructured to direction 1b in G-045): the pattern's undo history plus the state several
 * panes share, wired to the hooks in app/hooks and the components in app/components (D108). Every edit goes through
 * `history.set` as one undo step.
 *
 * The frame is 1b's: a tool rail, a context bar over the chart well with a status bar beneath it, and one inspector on
 * the right showing a single pane at a time.
 */
export interface WorkspaceProps {
  /** Null when signed out (G-075 M2); read once at load, same as every other prop here. */
  account: { name: string | null; email: string } | null;
}

export default function Workspace({ account }: WorkspaceProps) {
  const history = useDocumentHistory();
  const pattern = history.state;
  /** The start screen, reached from New while a chart is open. Getting there costs nothing; the confirm comes when a
   *  card is actually chosen, which is what replaces the one autosaved chart. */
  const [startingNew, setStartingNew] = useState(false);
  const { options: browserOptions, update: updateOption } = useWorkspaceOptions();
  // The options in force: the browser's, with the open chart's own fabric in place of the browser's (D290).
  const { options, fabricNow, updateChartOption } = useChartFabric({
    pattern,
    startingNew,
    browserOptions,
    updateOption,
    commit: history.set,
  });
  const source = useSourceImage();
  // The four sliders (G-074), drawn in the browser from the decoded photo -- no request to the server.
  const adjustPreview = usePhotoAdjustPreview(source.pixelBuffer, options.photoAdjust, pattern === null);

  // What is being looked at: the view, the settings beside it, and the rule that unused photo sliders are given up.
  const view = useEditorView({
    pattern,
    sliders: options.photoAdjust,
    restoreSliders: (adjust) => updateOption("photoAdjust", adjust),
  });
  const { viewMode, inspectorTab, chooseViewMode, chooseInspectorTab } = view;
  // Two colours since G-064: the squares never move, so the pair is two slots and a flag saying which is in
  // front. `activeColorIndex` stays the name for the foreground, which is what a left press paints with.
  const colours = useDrawingColours(pattern?.palette.length ?? 0);
  const { activeColorIndex, setActiveColorIndex, setBackgroundColorIndex } = colours;
  // Isolate and the threads lit for it.
  const lit = useLitThreads();
  // The Text tab's text and thread live here, not in the tab: it leaves the page while another tab is open (G-081).
  const [letteringText, setLetteringText] = useState("");
  const [letteringColor, setLetteringColor] = useState<number | null>(null);
  const symmetryState = useSymmetryAxes(pattern);
  const liveSymmetry = symmetryState.live;
  // The empty-grid panel (G-040): a new key on every request remounts it with fresh fields.
  // The rail renders both file inputs; the workspace holds their refs so the first-run cards click the very same
  // elements rather than carrying a second pair (and the specs keep finding them where they always were).
  const openInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pixelArtInputRef = useRef<HTMLInputElement>(null);
  const [pendingStart, setPendingStart] = useState<null | (() => void)>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openNotice, setOpenNotice] = useState<string | null>(null);
  // A color editor's live draft (G-033): shown only while it was derived from the current pattern, so any real edit,
  // undo or new document drops it without an effect.
  const [colorPreview, setColorPreview] = useState<{ base: StitchPattern; next: StitchPattern } | null>(null);
  // Bumped whenever the palette is replaced wholesale (a new document or a generation), so open editors close.
  const [documentId, setDocumentId] = useState(0);
  const [nameDraft, setNameDraft] = useNameDraft(pattern?.name);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const navigatorCanvasRef = useRef<HTMLCanvasElement>(null);
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // The tool hooks need the renderer and the renderer needs the selection they own; they read it through this ref,
  // only inside event handlers, after the effect below has assigned it.
  const rendererRef = useRef<ChartRenderer | null>(null);
  const commandsButtonRef = useRef<HTMLButtonElement>(null);
  const [commandListOpen, setCommandListOpen] = useState(false);

  // The hook skips zoom levels that would render the same cell size, so it needs to know what a level renders as.
  const cellSizeAt = useCallback((zoom: number) => computeCellSize(pattern, zoom), [pattern]);
  const panZoom = usePanZoom(scrollerRef, frameRef, pattern !== null, cellSizeAt);
  const cellSize = computeCellSize(pattern, panZoom.zoomLevel);
  // One press's footprint, rebuilt only when the brush changes rather than on every render (G-064).
  const stamp = useMemo(() => brushStamp(options.brushSize, options.brushShape), [options.brushSize, options.brushShape]);
  // The tools (G-092): which is in hand, and the routing of the pointer and the keys to it. What each does is in its own
  // module under `app/tools/`; this is everything a tool is allowed to touch.
  const tools = useTools({
    frameRef,
    rendererRef,
    pattern,
    cellSize,
    viewOnly: isViewOnlyMode(viewMode),
    startingNew,
    commit: history.set,
    replaceSince: history.replaceSince,
    history,
    colorForPointer: colours.colorForPointer,
    activeColorIndex,
    stamp,
    symmetry: liveSymmetry,
    options,
    option: (spec) => readToolOption(options, spec),
    view: panZoom,
  });
  const { activeTool, switchTool, hoverOutline } = tools;
  const displayedPattern = colorPreview && colorPreview.base === pattern ? colorPreview.next : pattern;
  const renderer = useChartRenderer({
    canvasRef,
    frameRef,
    scrollerRef,
    navigatorCanvasRef,
    hoverCanvasRef,
    pattern: displayedPattern,
    viewMode,
    cellSize,
    activeTool,
    selection: tools.piece.selection,
    isSelectDragging: tools.piece.isDragging,
    highlightBackstitch: tools.highlightBackstitch,
    isolate: lit.isolate,
    litColorIndices: lit.colors,
    litBackstitchIndices: lit.backstitch,
    canvasColor: options.canvasColor,
    stitchTexture: options.stitchTexture,
    clothBehind: viewMode === "realistic" && options.canvasTexture !== "off",
    symmetryAxes: liveSymmetry,
    photoAdjust: view.shownPhotoAdjust,
    // The renderer applies a zoom's anchor itself, between sizing the frame and measuring the view (D124, D135).
    applyZoomAnchor: panZoom.applyZoomAnchor,
  });
  useEffect(() => {
    rendererRef.current = renderer;
  });

  // Picking up another tool, or resizing the brush, changes the outline under a pointer that has not moved.
  useEffect(() => {
    rendererRef.current?.setHoverOutline(hoverOutline);
  }, [hoverOutline]);
  // The dot leans along the diagonal of the half stitch in hand.
  const dotKind = usesStitchKind(activeTool) ? options.stitchKind : 0;
  useEffect(() => {
    rendererRef.current?.setHoverKind(dotKind);
  }, [dotKind]);

  // The breadcrumb a crash report is built from (G-066): an error boundary renders instead of this tree, so what it
  // can say about the session is only what was written down outside the tree beforehand.
  useEffect(() => {
    setCrashContext({
      viewMode,
      activeTool,
      brush: `${options.brushSize} ${options.brushShape}`,
      zoomPercent: Math.round(panZoom.zoomLevel * 100),
      pattern,
      symmetry: liveSymmetry,
    });
  });

  /**
   * The one place the open chart is replaced (G-091): which things are reset for which way in is the table in
   * `lib/editor/document-replace.ts`; these are the state setters it is carried out with.
   */
  const replaceEffects: ReplaceEffects = {
    resetHistory: history.reset,
    pushHistory: history.set,
    bumpDocument: () => setDocumentId((id) => id + 1),
    clearSelection: () => tools.piece.clear(),
    // Each tool puts down what belonged to the old chart; the Crop tool, if in hand, starts a fresh frame over the new one.
    closeCrop: () => tools.documentReplaced(),
    clearLit: lit.clear,
    clearTextThread: () => setLetteringColor(null),
    clearColourInHand: () => setActiveColorIndex(null),
    resetZoom: () => panZoom.resetZoom(),
    showColorView: () => view.setViewMode("color"),
    setSymmetry: (axes) => symmetryState.reset(axes),
    resetPaletteSet: () => {
      updateOption("paletteSetup", false);
      updateOption("paletteSet", EMPTY_SET);
    },
    restorePaletteSet: ({ active, ...set }) => {
      updateOption("paletteSet", set);
      updateOption("paletteSetup", active);
    },
    setPhotoAdjust: (adjust) => updateOption("photoAdjust", adjust),
    showTab: view.setInspectorTab,
    clearMessages: () => {
      generation.setError(null);
      setOpenError(null);
      setOpenNotice(null);
    },
    leaveStart: () => setStartingNew(false),
    adoptPhoto: (chart, fallbackName) => source.adoptPatternPhoto(chart, fallbackName),
    forgetAutosave: () => void getProjectStore().save(null),
    awaitRecommendedCount: () => {
      colorResetRef.current = { stale: colorPrediction.prediction };
    },
  };

  /** Lands a restored or opened pattern in every piece of state that depends on it, including its embedded photo. */
  function loadPatternIntoWorkspace(loaded: StitchPattern, fallbackName: string, savedSymmetry: SymmetryAxes = NO_SYMMETRY) {
    return replaceDocument("open", { ...loaded, name: loaded.name ?? fallbackName }, replaceEffects, {
      symmetry: savedSymmetry,
      fallbackName,
    });
  }

  const restore = useProjectRestore(
    (restored, savedSymmetry) => void loadPatternIntoWorkspace(restored, restored.name ?? DEFAULT_CHART_NAME, savedSymmetry)
  );
  const autosaveStatus = useProjectAutosave(pattern, restore.restored, getProjectStore(), liveSymmetry);
  const exports = useExports(pattern, options, liveSymmetry);
  // How many colours the picture reasonably needs, which, and how well the set being set up covers it (G-087).
  const colorPrediction = useColorPrediction({
    photoDataUrl: source.meta?.dataUrl ?? null,
    longerSideStitches: longerSideFor(options),
    paletteMode: options.paletteSetup ? options.paletteSet.mode : options.paletteMode,
    photoAdjust: options.photoAdjust,
    setColors: options.paletteSetup && options.paletteSet.colors.length ? options.paletteSet.colors.map((c) => c.rgb) : null,
  });
  // A new picture starts at the colour count its prediction recommends (Owner, 2026-10-02): the first prediction to arrive after the
  // photo was loaded sets it, and the reader's own changes after that stand. `stale` is the prediction showing at load time, which
  // belongs to the previous picture.
  const colorResetRef = useRef<{ stale: ColorPrediction | null } | null>(null);
  const predicted = colorPrediction.prediction;
  useEffect(() => {
    const pending = colorResetRef.current;
    if (!pending || !predicted || predicted === pending.stale) return;
    colorResetRef.current = null;
    // Deferred a microtask: a synchronous setState in an effect body is flagged by react-hooks/set-state-in-effect.
    void Promise.resolve().then(() => updateOption("colorCount", predicted.suggested));
  }, [predicted, updateOption]);
  const generation = useGeneration({
    colorCeiling: options.paletteSetup ? null : (colorPrediction.prediction?.ceiling ?? null),
    options,
    pixelBuffer: source.pixelBuffer,
    sourceMeta: source.meta,
    sourceFileName: source.fileName,
    revisionRef: source.revisionRef,
    currentPattern: pattern,
    // The first generate is the undo baseline with every symmetry toggle off; a regenerate is an ordinary undoable step
    // (G-012, G-037). Either way the piece in hand goes and the inspector follows the work to its threads.
    onGenerated: (next, isFirst) =>
      void replaceDocument(isFirst ? "first-generate" : "regenerate", setFabric(next, fabricNow), replaceEffects),
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
    void replaceDocument("discard", null, replaceEffects);
  }

  function handleImageFile(file: File) {
    generation.setError(null);
    setOpenNotice(null);
    void source.loadFile(file, {
      // A new photo is a new document: fresh history, neutral photo sliders, no chosen colours, shown as is until Generate.
      onLoaded: () => void replaceDocument("photo", null, replaceEffects),
      onFailed: () => generation.setError("Couldn't read that image. Try a different file (JPEG, PNG, or WebP)."),
    });
  }

  function handleOpenPattern(file: File) {
    setOpenError(null);
    setOpenNotice(null);
    loadPatternFromFile(file)
      .then(async ({ pattern: loaded, oxsReport, symmetry: savedSymmetry }) => {
        // An OXS file states its fabric count; the chart opened from it carries that count, in the browser's unit.
        const notice = oxsReport ? oxsImportNotice(oxsReport, browserOptions.aidaCount, STANDARD_AIDA_COUNTS) : null;
        const chart =
          notice?.aidaCount !== undefined ? setFabric(loaded, { count: notice.aidaCount, unit: browserOptions.sizeUnit }) : loaded;
        await loadPatternIntoWorkspace(chart, file.name.replace(/\.[^.]+$/, "").replace(/[-_]editable$/, ""), savedSymmetry);
        if (notice) setOpenNotice(notice.text);
      })
      .catch((err) => {
        // Nothing was replaced, so the current pattern is still the "previous version" (Owner request, 2026-09-12).
        reportPatternLoadFailure({ source: "open-file", error: err, content: file, originalFileName: file.name });
        setOpenError(err instanceof Error ? err.message : "Couldn't open that file.");
      });
  }

  /**
   * The Text tab's Add (G-081): the lettering arrives as a piece in hand, as a Paste does. The Select tool is put in hand so
   * the piece can be moved, turned, filled, applied or cancelled; a piece already in hand is applied first.
   */
  function addLettering(bitmap: LetteringBitmap, paletteIndex: number) {
    const frame = frameRef.current;
    const scroller = scrollerRef.current;
    if (!pattern || !frame || !scroller) return;
    // The stitch at the top left of the part of the chart in view.
    const origin = chartOrigin(frame);
    const view = scroller.getBoundingClientRect();
    const corner = {
      x: Math.max(0, Math.floor((view.left - origin.left) / cellSize)),
      y: Math.max(0, Math.floor((view.top - origin.top) / cellSize)),
    };
    const held = tools.piece.selection;
    const at = letteringStart(held ? { x: held.x, y: held.y } : null, corner, bitmap, pattern);
    tools.takePiece(letteringSelection(bitmap, paletteIndex, at.x, at.y));
  }

  // The arrow keys move the highlighted stitch and Enter is the pen, for the tools that paint or draw (G-080).
  useKeyboardCursor({
    frameRef,
    scrollerRef,
    enabled:
      pattern !== null &&
      !startingNew &&
      !commandListOpen &&
      !isViewOnlyMode(viewMode) &&
      tools.piece.selection === null &&
      isKeyboardCursorTool(activeTool),
    width: pattern?.width ?? 0,
    height: pattern?.height ?? 0,
    cellSize,
  });

  /** Hands the cursor its outline, or takes it away when the tool in hand would paint nothing. */
  function updateHoverOutline(e: PointerEvent<HTMLDivElement> | null) {
    // The screen position, not the stitch: the renderer works out which stitch that is, and works it out again when
    // a scroll or a zoom moves the chart under a pointer that has not moved (G-065).
    renderer.previewHover(e && hoverOutline ? { x: e.clientX, y: e.clientY } : null, hoverOutline ?? NO_OUTLINE);
  }

  function handleCanvasPointerMove(e: PointerEvent<HTMLDivElement>) {
    // Before the tools, and whatever they make of the event: the cursor carries its outline through a gesture too.
    updateHoverOutline(e);
    tools.onPointerMove(e);
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
    tools.piece.invalidateClipboard();
    // A merge renumbers the palette, so a square holding an index above the merged one would otherwise be
    // pointing at a different thread than the reader picked.
    colours.forgetColor(sourceIndex);
    // A merge renumbers palette indices, so lit indices could now point at other colors.
    lit.forget();
  }

  /** A quick mirror (G-037): any floating selection is merged and the mirror applied, committed as one undo step. */
  function applyMirror(kind: QuickMirror) {
    if (!pattern || (kind === "upper-left-half-corner" && pattern.width !== pattern.height)) return;
    history.set(applyQuickMirrorWithSelection(pattern, tools.piece.selection, kind));
    tools.piece.release();
  }

  /**
   * Starts a chart from an empty canvas (G-040). `adoptPatternPhoto` clears the loaded photo, because the new chart has
   * none, which also cancels any generation or preview still running for the previous photo.
   */
  function createBlankChart(width: number, height: number) {
    return replaceDocument("blank", setFabric(createBlankPattern(width, height), fabricNow), replaceEffects);
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
    await replaceDocument("pixel-art", setFabric(imported, fabricNow), replaceEffects, {
      fallbackName: imported.name ?? DEFAULT_PIXEL_ART_NAME,
    });
  }

  const photoFree = isPhotoFree(pattern);

  // The one definition of "the start screen is up": the Image window draws it on this, and New goes inert on it,
  // because New is what opens it. Computed here so the two cannot drift apart.
  const startScreenVisible = startingNew || (pattern === null && source.meta === null);

  // The command table for this render (G-093): what is true of the editor now, and what can be done. Which command each is,
  // and when it can run, is `app/commands/shell-commands.ts`; the keys and the command list read the result.
  const heldPan = useHeldPan(activeTool, switchTool, tools.restoreTool);
  const commands = useShellCommands(
    {
      hasChart: pattern !== null,
      startingNew,
      startScreenVisible,
      squareChart: pattern !== null && pattern.width === pattern.height,
      hasPiece: tools.piece.selection !== null,
      hasPhotoViews: pattern?.sourceImage !== undefined,
      photoShown: !startingNew && !photoFree && source.hasPhoto,
      photoLoading: source.isLoading,
      generating: generation.isProcessing,
      exporting: exports.isExporting || exports.isExportingAll,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      slidersNeutral: isNeutralAdjust(options.photoAdjust),
    },
    {
      newChart: () => setStartingNew(true),
      choosePhoto: () => startNewChart(() => imageInputRef.current?.click()),
      openFile: () => startNewChart(() => openInputRef.current?.click()),
      importPixelArt: () => startNewChart(() => pixelArtInputRef.current?.click()),
      exportSelected: exports.exportSelected,
      exportAll: exports.exportAll,
      exportEditable: exports.exportEditableNow,
      generate: generation.generate,
      cancelGeneration: generation.cancel,
      resetSliders: () => updateOption("photoAdjust", NEUTRAL_ADJUST),
      undo: history.undo,
      redo: history.redo,
      swapColours: colours.swap,
      toggleIsolate: lit.toggleIsolate,
      mirror: applyMirror,
      toggleSymmetry: symmetryState.toggle,
      toggleLock: () => updateOption("lockTransparency", !options.lockTransparency),
      showView: chooseViewMode,
      zoomIn: () => panZoom.zoomBy(ZOOM_STEP),
      zoomOut: () => panZoom.zoomBy(1 / ZOOM_STEP),
      zoomReset: panZoom.resetZoom,
      openCommandList: () => setCommandListOpen(true),
      holdPan: heldPan.hold,
      releasePan: heldPan.release,
      chooseTool: switchTool,
    },
    tools.commands
  );
  // While the list is up the keys are the list's: nothing typed there reaches a tool or a view.
  useKeyboardShortcuts(commands, scrollerRef, commandListOpen);

  /** Closing without running anything gives the focus back to the button; after a command it is left on the page, so the chart's keys act at once. */
  function closeCommandList(ran: boolean) {
    setCommandListOpen(false);
    if (!ran) commandsButtonRef.current?.focus();
  }

  return (
    <div className="flex h-screen bg-app font-sans text-ink">
      {/* 1b draws no visible title, but the document still needs one heading: for assistive technology, and as the witness that the app booted. */}
      <h1 className="sr-only">Cross-Stitch Pattern Generator</h1>
      <AccountBadge account={account} />
      <ToolRail
        activeTool={activeTool}
        disabled={!pattern || startingNew}
        onSelect={switchTool}
        squareCanvas={pattern !== null && pattern.width === pattern.height}
        onMirror={applyMirror}
        onNewChart={() => setStartingNew(true)}
        newChartDisabled={startScreenVisible}
        onOpenCommands={() => setCommandListOpen(true)}
        commandsDisabled={startingNew}
        commandsButtonRef={commandsButtonRef}
      />
      {commandListOpen && <CommandList commands={commands} onClose={closeCommandList} />}

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
        {/* A tool with something of its own to act on shows its controls in place of the drawing options (the piece in hand,
            the backstitch in hand, the crop frame); which tool, and when, is the tool's own business. */}
        {tools.bar ?? (
          <ContextBar
            pattern={pattern}
            history={history}
            view={{
              mode: viewMode,
              onModeChange: chooseViewMode,
              isolate: lit.isolate,
              onIsolateChange: lit.setIsolate,
              litCount: lit.count,
            }}
            photo={{ isLoading: source.isLoading, hasSource: source.hasPhoto }}
            colours={{ slots: colours.slots, onActivate: colours.setActiveSlot, onSwap: colours.swap }}
            options={{
              shown: tools.options,
              valueOf: (option) => readToolOption(options, option),
              onChange: (option, value) => {
                const written = writeToolOption(options, option, value);
                updateOption(written.key, written.value as never);
              },
            }}
            symmetry={{
              axes: liveSymmetry,
              squareCanvas: pattern !== null && pattern.width === pattern.height,
              onToggle: symmetryState.toggle,
            }}
            lock={{ on: options.lockTransparency, onChange: (on) => updateOption("lockTransparency", on) }}
            start={{ startingNew, onBackToChart: () => setStartingNew(false) }}
          />
        )}
        <WorkspaceNotices
          restoreFailure={restore.failure}
          onDownloadRestoreReport={() => restore.failure && downloadPatternLoadReport({ content: restore.failure.payload })}
          onDismissRestoreFailure={restore.dismissFailure}
          openError={openError}
          onDismissOpenError={() => setOpenError(null)}
          openNotice={openNotice}
          onDismissOpenNotice={() => setOpenNotice(null)}
          exportError={exports.exportError}
          onDismissExportError={exports.dismissExportError}
          a4Layout={paginatesAsA4(exports.exportKind) ? exports.a4LayoutPreview : null}
          a4HasPageMap={!exports.exportKind.startsWith("pdf-")}
        />
        {pendingStart !== null && pattern && (
          <ConfirmNewChart
            pattern={pattern}
            onExportThenStart={() => {
              const action = pendingStart;
              // The chart is given up only once its file has been handed to the browser; a failed save leaves it open, with the message.
              void exports.exportEditableNow().then((saved) => {
                setPendingStart(null);
                if (!saved) return;
                discardForNewChart();
                action();
              });
            }}
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
          refs={{ scroller: scrollerRef, frame: frameRef, canvas: canvasRef, hoverCanvas: hoverCanvasRef }}
          chart={{
            pattern,
            cellSize,
            sourceMeta: source.meta,
            viewMode,
            activeTool,
            activeColorIndex,
            cursorHidden: hoverOutline !== null,
          }}
          start={{
            visible: startScreenVisible,
            startingNew,
            isLoadingImage: source.isLoading,
            onChoosePhoto: () => startNewChart(() => imageInputRef.current?.click()),
            onCreateBlank: (width, height) => startNewChart(() => void createBlankChart(width, height)),
            onImportPixelArt: () => startNewChart(() => pixelArtInputRef.current?.click()),
            onOpenPatternFile: () => startNewChart(() => openInputRef.current?.click()),
            onAidaCountChange: (count) => updateOption("aidaCount", count),
          }}
          preview={renderer}
          adjust={adjustPreview}
          pointer={{
            onDown: tools.onPointerDown,
            onMove: handleCanvasPointerMove,
            onUp: tools.onPointerUp,
            onLeave: () => updateHoverOutline(null),
            onDoubleClick: tools.onDoubleClick,
            onDrop: handleCanvasDrop,
          }}
          options={options}
          cropOverlay={startingNew ? null : tools.overlay}
        />

        <StatusBar
          pattern={startingNew ? null : pattern}
          aidaCount={options.aidaCount}
          sizeUnit={options.sizeUnit}
          autosaveStatus={autosaveStatus}
          hasPattern={pattern !== null && !startingNew}
          scrollerRef={scrollerRef}
          frameRef={frameRef}
          cellSize={cellSize}
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
        onTabChange={chooseInspectorTab}
        disabled={{
          chart: pattern === null || startingNew,
          threads: pattern === null || startingNew,
          text: pattern === null || startingNew,
        }}
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
              onDismissError={() => generation.setError(null)}
              hasPhoto={!startingNew && source.hasPhoto}
              sourceSize={source.meta ? { width: source.meta.naturalWidth, height: source.meta.naturalHeight } : null}
              isLoadingImage={!startingNew && source.isLoading}
              onCancel={generation.cancel}
              onAdjustSettled={adjustPreview.settle}
              error={generation.error}
              prediction={colorPrediction.prediction}
              predictionLoading={colorPrediction.loading}
            />
          )
        }
        chart={
          <ChartPane
            pattern={pattern}
            options={options}
            onChange={updateChartOption}
            name={nameDraft}
            onNameChange={setNameDraft}
            onNameCommit={() => pattern && history.set(renamePattern(pattern, nameDraft))}
          />
        }
        text={
          <TextPane
            pattern={pattern}
            options={options}
            onChange={updateOption}
            activeColorIndex={activeColorIndex}
            text={letteringText}
            onTextChange={setLetteringText}
            pickedColor={letteringColor}
            onPickColor={setLetteringColor}
            viewOnly={isViewOnlyMode(viewMode)}
            onAdd={addLettering}
          />
        }
        threads={
          <ColorsDock
            pattern={pattern}
            dimmed={tools.piece.selection !== null}
            activeColorIndex={activeColorIndex}
            onActiveColorChange={setActiveColorIndex}
            onBackgroundColorChange={setBackgroundColorIndex}
            litColorIndices={lit.colors}
            onToggleLit={lit.toggleColor}
            litBackstitchIndices={lit.backstitch}
            onToggleLitBackstitch={lit.toggleBackstitch}
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
