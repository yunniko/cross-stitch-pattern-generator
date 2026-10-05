"use client";

import { type DragEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { brushStamp, type StampEdge } from "@/lib/editor/brush-stamp";
import { setCrashContext } from "@/lib/editor/crash-report";
import { useDrawingColours } from "./hooks/use-drawing-colours";
import { useSymmetryAxes } from "./hooks/use-symmetry-axes";
import { downloadPatternLoadReport } from "@/lib/editor/error-report";
import { mergeColors, renamePattern } from "@/lib/editor/pattern-edit";
import { useChartFabric } from "./hooks/use-chart-fabric";
import { useEditorView } from "./hooks/use-editor-view";
import { useLitThreads } from "./hooks/use-lit-threads";
import { useNameDraft } from "./hooks/use-name-draft";
import { applyQuickMirrorWithSelection, fillSymmetric, type QuickMirror } from "@/lib/editor/symmetry";
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
import { isPhotoFree } from "@/lib/editor/blank-pattern";
import { WorkspaceNotices } from "./components/panels";
import { PhotoPane } from "./components/photo-pane";
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
import { useColorPrediction } from "./hooks/use-color-prediction";
import { readToolOption, writeToolOption } from "@/lib/editor/tool-options";
import { toolTabShown } from "@/lib/editor/tool-tab";
import { useTools } from "./tools/use-tools";
import { useShellCommands } from "./commands/shell-commands";
import { useHeldPan } from "./hooks/use-held-pan";
import { CommandList } from "./components/command-list";
import { useChartLifecycle } from "./hooks/use-chart-lifecycle";
import { useRecommendedCount } from "./hooks/use-recommended-count";
import { FileInputs } from "./components/file-inputs";
import { useSourceImage } from "./hooks/use-source-image";
import { useWorkspaceOptions } from "./hooks/use-workspace-options";
import { skinStyle } from "@/lib/skin/skin";
import { ATELIER, SkinProvider } from "./skin/skin";

/** Nothing for the cursor to carry; the renderer reads the outline only when there is a stitch to put it on. */
const NO_OUTLINE: readonly StampEdge[] = [];

/**
 * The editor shell (G-012; 1b's frame since G-045; split by what it does in G-098, D291). It composes: it calls the hooks
 * that each own one thing, hands each what it needs from the others, and lays out the frame (a tool rail, a context bar
 * over the chart with a status bar beneath, and one inspector on the right showing a single pane).
 *
 * What is **not** here, and where it is:
 * - what a command does and when it can run: `app/commands/shell-commands.ts`;
 * - every way a chart arrives or leaves, its autosave and its messages: `app/hooks/use-chart-lifecycle.ts`;
 * - what a tool does: `app/tools/`;
 * - the rule behind a piece of state: beside that state's hook (`use-lit-threads`, `use-chart-fabric`, `use-editor-view`).
 *
 * What stays is what joins two owners and belongs to neither: dropping a colour on the chart, merging two colours,
 * a quick mirror with a piece in hand, lettering arriving as a piece, the outline the cursor carries. Every edit goes
 * through `history.set` as one undo step.
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
  const symmetryState = useSymmetryAxes(pattern);
  const liveSymmetry = symmetryState.live;
  // A color editor's live draft (G-033): shown only while it was derived from the current pattern, so any real edit,
  // undo or new document drops it without an effect.
  const [colorPreview, setColorPreview] = useState<{ base: StitchPattern; next: StitchPattern } | null>(null);
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
  // A tool's own tab opens each time the tool is picked, and gives way to the tab last chosen once another is chosen
  // or the tool is put down (G-095, D296): closed for this picking of the tool, and for no other.
  const [toolTabClosedAt, setToolTabClosedAt] = useState(-1);

  // The hook skips zoom levels that would render the same cell size, so it needs to know what a level renders as.
  const cellSizeAt = useCallback((zoom: number) => computeCellSize(pattern, zoom), [pattern]);
  const panZoom = usePanZoom(scrollerRef, frameRef, pattern !== null, cellSizeAt);
  const cellSize = computeCellSize(pattern, panZoom.zoomLevel);
  // One press's footprint, rebuilt only when the brush changes rather than on every render (G-064).
  const stamp = useMemo(() => brushStamp(options.brushSize, options.brushShape), [options.brushSize, options.brushShape]);
  /** The stitch at the top left of the part of the chart in view: where a piece that arrives from nowhere is put. */
  function viewCorner() {
    const frame = frameRef.current;
    const scroller = scrollerRef.current;
    if (!frame || !scroller) return null;
    const origin = chartOrigin(frame);
    const shown = scroller.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor((shown.left - origin.left) / cellSize)),
      y: Math.max(0, Math.floor((shown.top - origin.top) / cellSize)),
    };
  }
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
    view: { ...panZoom, corner: viewCorner },
    text: {
      textFamily: options.textFamily,
      textStyle: options.textStyle,
      textSize: options.textSize,
      textWeight: options.textWeight,
      canvasColor: options.canvasColor,
      change: (key, value) => updateOption(key, value),
    },
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

  const exports = useExports(pattern, options, liveSymmetry);
  // Every way a chart arrives or leaves (`use-chart-lifecycle.ts`). What it is handed here is the state other owners keep
  // that a new chart resets; which of them a given way in resets is the table in `lib/editor/document-replace.ts`.
  const lifecycle = useChartLifecycle({
    history,
    source,
    browserOptions,
    fabricNow,
    symmetry: liveSymmetry,
    startingNew,
    setStartingNew,
    setPhotoError: (message) => generation.setError(message),
    saveEditable: exports.exportEditableNow,
    resets: {
      clearSelection: () => tools.piece.clear(),
      // Each tool puts down what belonged to the old chart; the Crop tool, if in hand, starts a fresh frame over the new one.
      closeCrop: () => tools.documentReplaced(),
      clearLit: lit.clear,
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
      awaitRecommendedCount: () => recommendedCount.awaitNext(),
    },
  });
  const { startScreenVisible } = lifecycle;
  // How many colours the picture reasonably needs, which, and how well the set being set up covers it (G-087).
  const colorPrediction = useColorPrediction({
    photoDataUrl: source.meta?.dataUrl ?? null,
    longerSideStitches: longerSideFor(options),
    paletteMode: options.paletteSetup ? options.paletteSet.mode : options.paletteMode,
    photoAdjust: options.photoAdjust,
    setColors: options.paletteSetup && options.paletteSet.colors.length ? options.paletteSet.colors.map((c) => c.rgb) : null,
  });
  const recommendedCount = useRecommendedCount(colorPrediction.prediction, (count) => updateOption("colorCount", count));
  const generation = useGeneration({
    colorCeiling: options.paletteSetup ? null : (colorPrediction.prediction?.ceiling ?? null),
    options,
    pixelBuffer: source.pixelBuffer,
    sourceMeta: source.meta,
    sourceFileName: source.fileName,
    revisionRef: source.revisionRef,
    currentPattern: pattern,
    onGenerated: lifecycle.generated,
  });

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

  const photoFree = isPhotoFree(pattern);

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
      choosePhoto: lifecycle.choosePhoto,
      openFile: lifecycle.chooseFile,
      importPixelArt: lifecycle.choosePixelArt,
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

  // The skin in force (G-095, D295). One is shipped; choosing between skins is a later goal's.
  const skin = ATELIER;

  return (
    <SkinProvider skin={skin}>
      <div className="flex h-screen bg-app font-sans text-ink" style={skinStyle(skin.colours)}>
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

        <FileInputs
          photoRef={lifecycle.inputs.photo}
          openRef={lifecycle.inputs.open}
          pixelArtRef={lifecycle.inputs.pixelArt}
          onPhoto={lifecycle.photoChosen}
          onOpen={lifecycle.fileChosen}
          onPixelArt={(file) => void lifecycle.pixelArtChosen(file)}
          photoDisabled={source.isLoading || generation.isProcessing}
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
            restoreFailure={lifecycle.restore.failure}
            onDownloadRestoreReport={() =>
              lifecycle.restore.failure && downloadPatternLoadReport({ content: lifecycle.restore.failure.payload })
            }
            onDismissRestoreFailure={lifecycle.restore.dismissFailure}
            openError={lifecycle.messages.openError}
            onDismissOpenError={lifecycle.messages.dismissOpenError}
            openNotice={lifecycle.messages.openNotice}
            onDismissOpenNotice={lifecycle.messages.dismissOpenNotice}
            exportError={exports.exportError}
            onDismissExportError={exports.dismissExportError}
            a4Layout={paginatesAsA4(exports.exportKind) ? exports.a4LayoutPreview : null}
            a4HasPageMap={!exports.exportKind.startsWith("pdf-")}
          />
          {lifecycle.confirm && (
            <ConfirmNewChart
              pattern={lifecycle.confirm.pattern}
              onExportThenStart={lifecycle.confirm.exportThenStart}
              onKeepEditing={lifecycle.confirm.keepEditing}
              onStartNew={lifecycle.confirm.startNew}
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
              onChoosePhoto: lifecycle.choosePhoto,
              onCreateBlank: lifecycle.createBlank,
              onImportPixelArt: lifecycle.choosePixelArt,
              onOpenPatternFile: lifecycle.chooseFile,
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
            autosaveStatus={lifecycle.autosaveStatus}
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
          onTabChange={(tab) => {
            setToolTabClosedAt(tools.activation);
            chooseInspectorTab(tab);
          }}
          toolTab={
            tools.tab && pattern && !startingNew
              ? { ...tools.tab, shown: toolTabShown(tools.activation, toolTabClosedAt), onChoose: () => setToolTabClosedAt(-1) }
              : null
          }
          disabled={{
            chart: pattern === null || startingNew,
            threads: pattern === null || startingNew,
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
              documentId={lifecycle.documentId}
              onMergeColors={handleMergeColors}
            />
          }
          footer={
            // Nothing to export or generate while the start screen is up, and 1b draws no footer there.
            startingNew || (tools.tab !== null && toolTabShown(tools.activation, toolTabClosedAt)) ? null : inspectorTab === "threads" ? (
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
    </SkinProvider>
  );
}
