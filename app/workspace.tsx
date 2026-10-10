"use client";

import { type DragEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { brushStamp, type StampEdge } from "@/lib/editor/brush-stamp";
import { setCrashContext } from "@/lib/editor/crash-report";
import { WHATS_NEW_PATH } from "@/lib/app-version";
import { useDrawingColours } from "./hooks/use-drawing-colours";
import { useSymmetryAxes } from "./hooks/use-symmetry-axes";
import { downloadPatternLoadReport } from "@/lib/editor/error-report";
import { mergeColorsInDocument, replacePaletteInDocument, transformDocument } from "@/lib/editor/document-edit";
import type { PaletteSet } from "@/lib/editor/palette-set";
import { renamePattern } from "@/lib/editor/pattern-edit";
import { useChartFabric } from "./hooks/use-chart-fabric";
import { useEditorView } from "./hooks/use-editor-view";
import { useLitThreads } from "./hooks/use-lit-threads";
import { useNameDraft } from "./hooks/use-name-draft";
import { applyQuickMirrorWithSelection, fillSymmetric, type QuickMirror } from "@/lib/editor/symmetry";
import { useDocumentHistory } from "./hooks/use-document-history";
import { useLayers } from "./hooks/use-layers";
import { flatten, withLayerView } from "@/lib/document/convert";
import { layerStack } from "@/lib/document/layer-stack";
import { layerRefusal, STITCH_KINDS } from "@/lib/editor/tool-layer";
import type { StitchPattern } from "@/lib/types";
import { ConfirmNewChart } from "./components/confirm-new-chart";
import { SaveConflict } from "./components/save-conflict";
import { StampGallery } from "./components/stamp-gallery";
import { StampNameDialog } from "./components/stamp-name-dialog";
import { AppBar } from "./components/app-bar";
import { EditorLayout } from "./components/editor-layout";
import { QuickBar } from "./components/quick-bar";
import { WorkspacePanel } from "./components/workspace-panel";
import { ViewControls } from "./components/view-controls";
import { ImageWindow } from "./components/image-window";
import { isKeyboardCursorTool, usesStitchKind } from "./editor-types";
import { describeView, viewEditable } from "@/lib/editor/view";
import { isPhotoFree } from "@/lib/editor/blank-pattern";
import { WorkspaceNotices } from "./components/panels";
import { StatusBar } from "./components/status-bar";
import { ToolRail } from "./components/tool-rail";
import { cellIndexFromEvent, chartOrigin, computeCellSize } from "./editor-geometry";
import { useChartRenderer, type ChartRenderer } from "./hooks/use-chart-renderer";
import { paginatesAsA4, useExports } from "./hooks/use-exports";
import { useAccountSave } from "./hooks/use-account-save";
import { useStamps } from "./hooks/use-stamps";
import { placeStamp } from "@/lib/stamps/place";
import { STAMPS_FEATURE, type StampContents } from "@/lib/stamps/stamp";
import { PageCuts } from "./components/page-cuts";
import { Preferences } from "./components/preferences";
import { longerSideFor, useGeneration } from "./hooks/use-generation";
import { useKeyboardCursor } from "./hooks/use-keyboard-cursor";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts";
import { usePanZoom, ZOOM_STEP } from "./hooks/use-pan-zoom";
import { EMPTY_SET } from "@/lib/editor/palette-set";
import { isNeutralAdjust, NEUTRAL_ADJUST } from "@/lib/pipeline/photo-adjust";
import { generationPhotoAdjust } from "@/lib/editor/photo-adjust-session";
import { usePhotoAdjustPreview } from "./hooks/use-photo-adjust-preview";
import { useColorPrediction } from "./hooks/use-color-prediction";
import { readToolOption, writeToolOption } from "@/lib/editor/tool-options";
import { toolTabShown } from "@/lib/editor/tool-tab";
import { currentTryId as currentTryOf, isTry, trySettingsOf, type Try } from "@/lib/editor/tries";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { useTries } from "./hooks/use-tries";
import { TriesStrip } from "./components/tries-strip";
import { noWorkspaceOn, workspaceEdits, workspaceFeature, workspaceOpen, workspaceShown } from "@/lib/editor/workspaces";
import { featureUsable } from "@/lib/features/features";
import { gatedAction } from "./commands/registry";
import { NoWorkspace } from "./components/no-workspace";
import { ZOOM_DIRECTION } from "./tools/options";
import { toolDefinition } from "./tools/registry";
import { useTools } from "./tools/use-tools";
import { useShellCommands } from "./commands/shell-commands";
import { PAN_TOOL, PICKER_TOOL, useHeldTool } from "./hooks/use-held-tool";
import { CommandList } from "./components/command-list";
import { useChartLifecycle } from "./hooks/use-chart-lifecycle";
import { useRecommendedCount } from "./hooks/use-recommended-count";
import { FileInputs } from "./components/file-inputs";
import { useSourceImage } from "./hooks/use-source-image";
import { usePhotoEdits } from "./hooks/use-photo-edits";
import { useWorkspaceOptions } from "./hooks/use-workspace-options";
import { skinStyle } from "@/lib/skin/skin";
import { ATELIER, SkinProvider } from "./skin/skin";
import { PaletteAccountProvider } from "./components/palette-account";
import { optionsInForce } from "@/lib/features/in-force";
import { useFeatures } from "./features/features-context";

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
  const {
    options: storedOptions,
    fabricNow,
    updateChartOption,
  } = useChartFabric({
    pattern,
    startingNew,
    browserOptions,
    updateOption,
    commit: history.set,
  });
  // Under the feature switches (G-102): a stored setting naming a feature this person cannot use is read as its default.
  const features = useFeatures();
  const options = useMemo(() => optionsInForce(storedOptions, features), [storedOptions, features]);
  const source = useSourceImage();
  // The photo's own edits in Photo (G-124): the Photo wand's selection, Delete and Apply, each a step of the photo's history.
  // A failed edit is reported where a failed generation is; that hook comes later, so the report goes through a ref.
  const photoErrorRef = useRef<(message: string | null) => void>(() => {});
  const photoEdits = usePhotoEdits(source, (message) => photoErrorRef.current(message));
  const photoFree = isPhotoFree(pattern);

  // What is being looked at: the view, the settings beside it, and the rule that unused photo sliders are given up.
  const view = useEditorView({
    pattern,
    features,
    chosenView: browserOptions.view,
    setChosenView: (next) => updateOption("view", next),
    sliders: options.photoAdjust,
    restoreSliders: (adjust) => updateOption("photoAdjust", adjust),
  });
  const { inspectorTab, chooseInspectorTab, chooseWorkspace } = view;
  // The workspace shown (G-095, D297): the one chosen, or the first that can be entered (G-103, D312). Only Edit changes
  // the chart; in the other two it is looked at, whatever view is up. Null when none can be: no chart shown and Photo
  // off, where the start choices are what is offered, or every workspace off, where a window says so.
  const workspaceConditions = { hasChart: pattern !== null, startingNew, features };
  const workspace = workspaceShown(view.workspace, workspaceConditions);
  const everyWorkspaceOff = noWorkspaceOn(features);
  const photoOn = featureUsable(features, workspaceFeature("photo"));
  const editing = workspaceEdits(workspace);
  const lookingOnly = !viewEditable(view.shown) || !editing;
  // The photo can be worked on (G-124): in Photo, with a photo in hand that the chart, if any, was made from.
  const photoEditable = workspace === "photo" && source.hasPhoto && !startingNew && !photoFree;
  // Two colours since G-064: the squares never move, so the pair is two slots and a flag saying which is in
  // front. `activeColorIndex` stays the name for the foreground, which is what a left press paints with.
  const colours = useDrawingColours(pattern?.palette.length ?? 0);
  const { activeColorIndex, setActiveColorIndex } = colours;
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
  const viewControlsRef = useRef<HTMLDivElement>(null);
  const [commandListOpen, setCommandListOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
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
  // The person's stamps (G-119): Save as stamp in the Selection tab, and Add stamp's gallery in the top bar.
  const stamps = useStamps(pattern, account !== null, featureUsable(features, STAMPS_FEATURE));
  const stampSaving = gatedAction("selection.save-stamp", features, () => {});
  // The tools (G-092): which is in hand, and the routing of the pointer and the keys to it. What each does is in its own
  // module under `app/tools/`; this is everything a tool is allowed to touch.
  // The layer the tools work on, as the tools see it (G-130): its name, kind, visibility and lock (D404).
  const activeLayerHeader = history.document?.layers.find((layer) => layer.id === history.activeLayerId);
  const activeLayer = activeLayerHeader
    ? {
        id: activeLayerHeader.id,
        name: activeLayerHeader.name,
        kind: activeLayerHeader.kind,
        visible: activeLayerHeader.visible,
        locked: activeLayerHeader.locked === true,
      }
    : null;
  const tools = useTools({
    frameRef,
    rendererRef,
    pattern,
    shown: history.composite,
    activeLayer,
    layerCount: history.document?.layers.length ?? 0,
    cellSize,
    workspace,
    viewOnly: lookingOnly,
    startingNew,
    commit: history.set,
    // A crop to a piece puts the piece down on the active layer first, in the same undo step (`EditorApi.transformChart`).
    transformChart: (transform, edited) =>
      history.apply((document) =>
        transformDocument(edited && history.activeLayerId ? withLayerView(document, history.activeLayerId, edited) : document, transform)
      ),
    history,
    colorForPointer: colours.colorForPointer,
    takeColor: colours.takeColor,
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
    photo: {
      shown: photoEditable,
      hasSelection: photoEdits.selection !== null,
      busy: photoEdits.busy,
      wand: photoEdits.wand,
      deleteSelected: photoEdits.deleteSelected,
      deselect: photoEdits.deselect,
      invert: photoEdits.invert,
    },
    stamps: {
      save: stampSaving && { run: stamps.begin, locked: stampSaving.locked, signedIn: account !== null, busy: stamps.busy },
    },
  });
  const { activeTool, switchTool, hoverOutline } = tools;
  // The Layers tab (G-130): under its feature, and in Edit only.
  const layers = useLayers(history, features, tools.piece);
  const editTab = inspectorTab === "layers" && !layers.usable ? "threads" : inspectorTab;
  // The photo itself is up in place of the chart (G-124): before the first chart; while the photo has been edited since the
  // chart was made, so what is shown is what the next Generate reads; and while the Photo wand is in hand or the sliders are
  // off centre, since both act on the photo and not on the chart.
  const chartFromPhotoShown = pattern?.sourceImage !== undefined && pattern.sourceImage.dataUrl === source.meta?.dataUrl;
  const photoStageShown = photoEditable && (!chartFromPhotoShown || activeTool === "photo-wand" || !isNeutralAdjust(options.photoAdjust));
  // The photo's history, while an edit is being worked nothing can be stepped (G-124).
  const photoHistory = {
    canUndo: source.edits.canUndo && !photoEdits.busy,
    canRedo: source.edits.canRedo && !photoEdits.busy,
    undo: source.edits.undo,
    redo: source.edits.redo,
  };
  // The four sliders (G-074), drawn in the browser from the decoded photo -- no request to the server.
  const adjustPreview = usePhotoAdjustPreview(source.pixelBuffer, options.photoAdjust, photoStageShown);
  // What is drawn is every visible layer (G-130): the composite, or under a colour editor's draft the composite with the
  // draft written into the active layer. With one layer the two are the active layer's view itself.
  const { document: chartDocument, activeLayerId, composite } = history;
  const displayedPattern = useMemo(() => {
    if (!colorPreview || colorPreview.base !== pattern) return composite;
    if (!chartDocument || !activeLayerId || chartDocument.layers.length === 1) return colorPreview.next;
    return flatten(withLayerView(chartDocument, activeLayerId, colorPreview.next));
  }, [chartDocument, activeLayerId, composite, colorPreview, pattern]);
  // The layers around the active one, which a gesture's preview is drawn among (G-130, D392).
  const layersAround = chartDocument && activeLayerId && pattern ? layerStack(chartDocument, activeLayerId, pattern) : null;
  const renderer = useChartRenderer({
    canvasRef,
    frameRef,
    scrollerRef,
    navigatorCanvasRef,
    hoverCanvasRef,
    pattern: displayedPattern,
    view: view.shown,
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
    clothBehind: view.shown.pattern === "realistic" && options.canvasTexture !== "off",
    symmetryAxes: liveSymmetry,
    photoAdjust: view.shownPhotoAdjust,
    // The renderer applies a zoom's anchor itself, between sizing the frame and measuring the view (D124, D135).
    applyZoomAnchor: panZoom.applyZoomAnchor,
    layers: layersAround,
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
      viewMode: describeView(view.shown),
      activeTool,
      brush: `${options.brushSize} ${options.brushShape}`,
      zoomPercent: Math.round(panZoom.zoomLevel * 100),
      pattern,
      symmetry: liveSymmetry,
    });
  });

  // Every export but the editable file is of the chart as shown, every visible layer's top stitch (G-130 M4).
  const exports = useExports(history.composite, history.document, options, liveSymmetry);
  // Saving to the account (G-108): which saved chart this is, kept by the replace table and autosaved with the chart.
  const accountSave = useAccountSave(history.document, liveSymmetry);
  // Every way a chart arrives or leaves (`use-chart-lifecycle.ts`). What it is handed here is the state other owners keep
  // that a new chart resets; which of them a given way in resets is the table in `lib/editor/document-replace.ts`.
  const lifecycle = useChartLifecycle({
    history,
    source,
    browserOptions,
    fabricNow,
    symmetry: liveSymmetry,
    savedChart: accountSave.link,
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
      resetChartView: () => view.resetView(),
      setSymmetry: (axes) => symmetryState.reset(axes),
      resetPaletteSet: () => {
        updateOption("paletteSetup", false);
        updateOption("paletteSet", EMPTY_SET);
        // A chart that starts from nothing starts in the palette mode set in Preferences (G-095, D299).
        updateOption("paletteMode", browserOptions.defaultPaletteMode);
      },
      restorePaletteSet: ({ active, ...set }) => {
        updateOption("paletteSet", set);
        updateOption("paletteSetup", active);
      },
      setPhotoAdjust: (adjust) => updateOption("photoAdjust", adjust),
      showWorkspace: view.showWorkspace,
      awaitRecommendedCount: () => recommendedCount.awaitNext(),
      setSavedChart: accountSave.setLink,
    },
  });
  // A dropped photo is the photo choice by another road, so it goes under that command's gate (D313); a locked one takes none either.
  const photoChoice = gatedAction("file.choose-photo", features, () => {});
  const dropPhoto = photoChoice && photoChoice.locked === undefined ? lifecycle.dropPhoto : null;
  // With no workspace to show, the start choices are what is offered, even over a photo the browser kept (G-103).
  const startScreenVisible = lifecycle.startScreenVisible || workspace === null;
  // A Generate reads the photo as applied, never the sliders, which are a preview until Apply (D352).
  const generationAdjust = generationPhotoAdjust(pattern, {
    originalDataUrl: source.original?.meta.dataUrl ?? null,
    isOriginal: source.edits.isOriginal,
  });
  const generationOptions = useMemo(() => ({ ...options, photoAdjust: generationAdjust }), [options, generationAdjust]);
  // How many colours the picture reasonably needs, which, and how well the set being set up covers it (G-087).
  const colorPrediction = useColorPrediction({
    // Nothing is asked of the server for a workspace that is off (G-103).
    photoDataUrl: photoOn ? (source.meta?.dataUrl ?? null) : null,
    longerSideStitches: longerSideFor(options),
    paletteMode: options.paletteSetup ? options.paletteSet.mode : options.paletteMode,
    photoAdjust: generationAdjust,
    setColors: options.paletteSetup && options.paletteSet.colors.length ? options.paletteSet.colors.map((c) => c.rgb) : null,
  });
  const recommendedCount = useRecommendedCount(colorPrediction.prediction, (count) => updateOption("colorCount", count));
  // Every chart a Generate makes is kept as a try of the photo in hand (G-095 M4, D298).
  // They belong to the photo as loaded, so its edits do not hide them (G-124).
  const tries = useTries(source.original?.meta.dataUrl ?? null);
  // The one last chosen or made while the chart is still it, else the most recent the chart equals (D403).
  const currentTryId = useMemo(() => currentTryOf(tries.tries, pattern, tries.chosenId), [pattern, tries.tries, tries.chosenId]);
  /**
   * A new chart is what the person asked to see, so a Photo tool still in hand (which keeps the photo up over the chart)
   * is put down for Pan once a generation or a try lands (G-124).
   */
  function putPhotoToolDown() {
    if (toolDefinition(tools.activeTool).workspace === "photo") tools.switchTool("pan");
  }
  const generation = useGeneration({
    colorCeiling: options.paletteSetup ? null : (colorPrediction.prediction?.ceiling ?? null),
    options: generationOptions,
    pixelBuffer: source.pixelBuffer,
    sourceMeta: source.meta,
    sourceFileName: source.fileName,
    revisionRef: source.revisionRef,
    currentPattern: pattern,
    onGenerated: (next, isFirst) => {
      lifecycle.generated(next, isFirst);
      putPhotoToolDown();
      // With the settings as they stood when Generate was pressed, which are the ones that made it.
      tries.add(next, trySettingsOf(generationOptions));
    },
  });

  useEffect(() => {
    photoErrorRef.current = generation.setError;
  }, [generation.setError]);

  /**
   * Going back to a try: its chart becomes the chart, as one undoable step like a Regenerate, and the settings that made
   * it are put back, so what the Photo panel shows is what made the chart on screen. Nothing is asked of the server.
   */
  function showTry(entry: Try) {
    if (entry.id === currentTryId) return;
    tries.choose(entry.id);
    // Two tries can be the same chart (made with different settings): then only the settings change, and the chart stays.
    if (!isTry(pattern, entry.pattern)) lifecycle.generated(entry.pattern, false);
    putPhotoToolDown();
    // The sliders are a preview of the next Apply, not a setting of the chart, so a try leaves them as they are (G-124).
    for (const [key, value] of Object.entries(entry.settings))
      if (key !== "photoAdjust") updateOption(key as keyof WorkspaceOptions, value as never);
  }

  // The arrow keys move the highlighted stitch and Enter is the pen, for the tools that paint or draw (G-080).
  useKeyboardCursor({
    frameRef,
    scrollerRef,
    enabled:
      pattern !== null &&
      !startingNew &&
      !commandListOpen &&
      !preferencesOpen &&
      !lookingOnly &&
      tools.piece.selection === null &&
      tools.layerNote === null &&
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

  /** While a press is held on the chart the view controls stand aside, so a stroke can pass beneath them. */
  function handleCanvasPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (viewControlsRef.current) viewControlsRef.current.dataset.away = "true";
    tools.onPointerDown(e);
  }

  function handleCanvasPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (viewControlsRef.current) delete viewControlsRef.current.dataset.away;
    tools.onPointerUp(e);
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
    // A dropped colour fills on the active layer, as the Fill tool does, and is refused where Fill would be.
    if (!pattern || raw === "" || !frame || lookingOnly || layerRefusal(toolDefinition("fill"), activeLayer)) return;
    const cellIndex = cellIndexFromEvent(e, frame, cellSize, pattern.width, pattern.height);
    const paletteIndex = Number(raw);
    if (cellIndex !== null && Number.isInteger(paletteIndex)) history.set(fillSymmetric(pattern, cellIndex, liveSymmetry, paletteIndex, 4));
  }

  function handleMergeColors(sourceIndex: number, targetIndex: number) {
    if (!pattern || sourceIndex === targetIndex) return;
    // On every layer, hidden ones too: the palette is the chart's (G-130).
    history.apply((document) => mergeColorsInDocument(document, sourceIndex, targetIndex));
    tools.piece.invalidateClipboard();
    // A merge renumbers the palette, so a square holding an index above the merged one would otherwise be
    // pointing at a different thread than the reader picked.
    colours.forgetColor(sourceIndex);
    // A merge renumbers palette indices, so lit indices could now point at other colors.
    lit.forget();
  }

  /** A loaded palette replaces the chart's (G-131, D397): on every layer, as one undo step. */
  function handleReplacePalette(set: PaletteSet) {
    if (!pattern || set.colors.length === 0) return;
    history.apply((document) => replacePaletteInDocument(document, set));
    tools.piece.invalidateClipboard();
    // Every index may now name another thread, so the drawing squares and the lit threads start over.
    colours.reset();
    lit.forget();
  }

  /**
   * A quick mirror (G-037): any floating selection is merged and the mirror applied, committed as one undo step. It changes
   * the active layer's stitches, so it is refused where a drawing tool would be (D392).
   */
  function applyMirror(kind: QuickMirror) {
    if (!pattern || (kind === "upper-left-half-corner" && pattern.width !== pattern.height)) return;
    if (layerRefusal({ label: "Mirror", layerKinds: STITCH_KINDS, drawsOnLayer: true }, activeLayer)) return;
    history.set(applyQuickMirrorWithSelection(pattern, tools.piece.selection, kind));
    tools.piece.release();
  }

  // The command table for this render (G-093): what is true of the editor now, and what can be done. Which command each is,
  // and when it can run, is `app/commands/shell-commands.ts`; the keys and the command list read the result.
  const heldTool = useHeldTool(activeTool, switchTool, tools.restoreTool);
  const commands = useShellCommands(
    {
      hasChart: pattern !== null,
      startingNew,
      startScreenVisible,
      view: view.shown,
      features,
      workspace,
      squareChart: pattern !== null && pattern.width === pattern.height,
      hasPiece: tools.piece.selection !== null,
      hasPhotoViews: pattern?.sourceImage !== undefined,
      photoShown: !startingNew && !photoFree && source.hasPhoto,
      photoLoading: source.isLoading,
      generating: generation.isProcessing,
      exporting: exports.isExporting || exports.isExportingAll,
      signedIn: account !== null,
      savedToAccount: accountSave.link !== null,
      savingToAccount: accountSave.busy,
      // With the photo itself up, Undo and Redo step through the photo's edits, not the chart's (G-124).
      canUndo: photoStageShown ? photoHistory.canUndo : history.canUndo,
      canRedo: photoStageShown ? photoHistory.canRedo : history.canRedo,
      slidersNeutral: isNeutralAdjust(options.photoAdjust),
      picksOnAlt: !lookingOnly && toolDefinition(activeTool).heldPicker === true,
    },
    {
      newChart: () => setStartingNew(true),
      choosePhoto: lifecycle.choosePhoto,
      openFile: lifecycle.chooseFile,
      importPixelArt: lifecycle.choosePixelArt,
      exportSelected: exports.exportSelected,
      exportAll: exports.exportAll,
      exportEditable: exports.exportEditableNow,
      saveToAccount: accountSave.save,
      saveCopy: accountSave.saveCopy,
      generate: generation.generate,
      cancelGeneration: generation.cancel,
      resetSliders: () => updateOption("photoAdjust", NEUTRAL_ADJUST),
      undo: photoStageShown ? photoHistory.undo : history.undo,
      redo: photoStageShown ? photoHistory.redo : history.redo,
      swapColours: colours.swap,
      toggleIsolate: lit.toggleIsolate,
      mirror: applyMirror,
      toggleSymmetry: symmetryState.toggle,
      toggleLock: () => updateOption("lockTransparency", !options.lockTransparency),
      changeView: (change) => view.chooseView(change(view.chosenView)),
      zoomIn: () => panZoom.zoomBy(ZOOM_STEP),
      zoomOut: () => panZoom.zoomBy(1 / ZOOM_STEP),
      zoomReset: panZoom.resetZoom,
      openCommandList: () => setCommandListOpen(true),
      openPreferences: () => setPreferencesOpen(true),
      openWhatsNew: () => window.open(WHATS_NEW_PATH, "_blank", "noopener"),
      holdPan: () => heldTool.hold("Space", PAN_TOOL),
      releasePan: () => heldTool.release("Space"),
      holdPicker: () => heldTool.hold("Alt", PICKER_TOOL),
      releasePicker: () => heldTool.release("Alt"),
      chooseTool: switchTool,
      showWorkspace: chooseWorkspace,
    },
    tools.commands
  );
  // While the list is up the keys are the list's: nothing typed there reaches a tool or a view.
  // The same while the preferences are up: what is typed there is for them.
  useKeyboardShortcuts(
    commands,
    scrollerRef,
    commandListOpen ||
      preferencesOpen ||
      stamps.naming !== null ||
      stamps.gallery !== null ||
      accountSave.conflict !== null ||
      everyWorkspaceOff
  );

  /**
   * A stamp chosen in Add stamp's gallery, placed as a piece in hand at the corner of the part of the chart in view (G-119
   * M4), the threads the chart lacks committed with it. Answers why the chart refused it, or null.
   */
  function placeChosenStamp(contents: StampContents): string | null {
    if (!pattern) return "Open a chart to place a stamp in it.";
    const placed = placeStamp(pattern, contents, viewCorner() ?? { x: 0, y: 0 });
    if ("error" in placed) return placed.error;
    tools.takePiece(placed.piece, placed.pattern === pattern ? undefined : placed.pattern);
    return null;
  }

  /** Closing without running anything gives the focus back to the button; after a command it is left on the page, so the chart's keys act at once. */
  function closeCommandList(ran: boolean) {
    setCommandListOpen(false);
    if (!ran) commandsButtonRef.current?.focus();
  }

  // The skin in force (G-095, D295). One is shipped; choosing between skins is a later goal's.
  const skin = ATELIER;
  const chartShown = pattern !== null && !startingNew;
  // Add stamp (G-119 M4) is for a signed-in person with stamps, placing into a chart open in Edit.
  const addStampUnusable =
    account === null
      ? "Sign in to place the stamps kept with your account"
      : !chartShown || lookingOnly
        ? "Add stamp places a stamp in the chart open in Edit"
        : stamps.count === null
          ? "Your stamps could not be read yet"
          : stamps.count === 0
            ? "No stamps yet: select a piece, then choose Save as stamp in the Selection tab"
            : null;
  /**
   * The Save menu (G-108): the account's group under its own switch, the file under Export's (G-103). There is something to
   * save only with a chart shown, and no menu with both groups hidden.
   */
  const saveMenu = (() => {
    if (!chartShown) return null;
    const toFile = gatedAction("file.export-editable", features, () => void exports.exportEditableNow());
    const save = gatedAction("file.save-to-account", features, accountSave.save);
    const copy = gatedAction("file.save-copy", features, accountSave.saveCopy);
    const accountGroup =
      save && copy
        ? { signedIn: account !== null, locked: save.locked, saved: accountSave.link, save: save.run, saveCopy: copy.run }
        : null;
    if (!accountGroup && !toFile) return null;
    return { busy: exports.isExporting || exports.isExportingAll || accountSave.busy, account: accountGroup, toFile };
  })();
  const toolTabUp = tools.tab !== null && chartShown && toolTabShown(tools.activation, toolTabClosedAt);

  return (
    <SkinProvider skin={skin}>
      {/* The palettes kept with the account (G-131 M4): one list for Set up palette and the Edit page. */}
      <PaletteAccountProvider signedIn={account !== null}>
        <div className="flex h-screen flex-col bg-app font-sans text-ink" style={skinStyle(skin.colours)}>
          {/* 1b draws no visible title, but the document still needs one heading: for assistive technology, and as the witness that the app booted. */}
          <h1 className="sr-only">Cross-Stitch Pattern Generator</h1>
          {commandListOpen && <CommandList commands={commands} onClose={closeCommandList} />}
          {/* The browser's own settings, not the open chart's: a preference is what the next chart starts from. */}
          {preferencesOpen && (
            <Preferences options={browserOptions} pattern={pattern} onChange={updateOption} onClose={() => setPreferencesOpen(false)} />
          )}
          <FileInputs
            photoRef={lifecycle.inputs.photo}
            openRef={lifecycle.inputs.open}
            pixelArtRef={lifecycle.inputs.pixelArt}
            onPhoto={lifecycle.photoChosen}
            onOpen={lifecycle.fileChosen}
            onPixelArt={(file) => void lifecycle.pixelArtChosen(file)}
            photoDisabled={source.isLoading || generation.isProcessing}
          />
          {stamps.naming && <StampNameDialog facts={stamps.naming.facts} onSave={stamps.naming.save} onCancel={stamps.naming.cancel} />}
          {stamps.gallery && (
            <StampGallery
              stamps={stamps.gallery.stamps}
              error={stamps.gallery.error}
              placing={stamps.gallery.placing}
              onChoose={(id) => stamps.gallery?.choose(id, placeChosenStamp)}
              onClose={stamps.gallery.close}
            />
          )}
          {accountSave.conflict && (
            <SaveConflict
              savedAt={accountSave.conflict.savedAt}
              onSaveCopy={accountSave.conflict.saveCopy}
              onReplace={accountSave.conflict.replace}
              onCancel={accountSave.conflict.cancel}
            />
          )}
          {lifecycle.confirm && (
            <ConfirmNewChart
              pattern={lifecycle.confirm.pattern}
              exportThenStart={gatedAction("file.export-editable", features, lifecycle.confirm.exportThenStart)}
              onKeepEditing={lifecycle.confirm.keepEditing}
              onStartNew={lifecycle.confirm.startNew}
              pinnedTries={tries.pinnedCount}
            />
          )}

          {everyWorkspaceOff ? (
            <NoWorkspace />
          ) : (
            <EditorLayout
              appBar={
                <AppBar
                  account={account}
                  chartName={chartShown ? (pattern.name ?? "cross-stitch-pattern") : null}
                  workspace={workspace}
                  onWorkspaceChange={chooseWorkspace}
                  workspaceOpen={(candidate) => workspaceOpen(candidate, workspaceConditions)}
                  history={
                    photoStageShown
                      ? { ...photoHistory, pieceInHand: false }
                      : chartShown
                        ? {
                            canUndo: history.canUndo,
                            canRedo: history.canRedo,
                            undo: history.undo,
                            redo: history.redo,
                            pieceInHand: tools.piece.selection !== null,
                          }
                        : null
                  }
                  onNewChart={() => setStartingNew(true)}
                  newChartDisabled={startScreenVisible}
                  save={saveMenu}
                  addStamp={{ onOpen: stamps.openGallery, unusable: addStampUnusable }}
                  onOpenCommands={() => setCommandListOpen(true)}
                  commandsDisabled={startingNew}
                  commandsButtonRef={commandsButtonRef}
                  onOpenPreferences={() => setPreferencesOpen(true)}
                />
              }
              tools={
                <ToolRail
                  workspace={workspace}
                  activeTool={activeTool}
                  // In Photo the photo's own tools work on the photo alone, before any chart (G-124).
                  disabled={!chartShown && !photoEditable}
                  onSelect={switchTool}
                  squareCanvas={pattern !== null && pattern.width === pattern.height}
                  onMirror={applyMirror}
                />
              }
              quickBar={
                <QuickBar
                  pattern={pattern}
                  workspace={workspace}
                  tool={{
                    label: toolDefinition(activeTool).label,
                    shares: tools.shares,
                    options: tools.options,
                    valueOf: (option) => readToolOption(options, option),
                    onChange: (option, value) => {
                      const written = writeToolOption(options, option, value);
                      updateOption(written.key, written.value as never);
                    },
                    quick: tools.quick,
                    quickCompact: tools.quickCompact,
                  }}
                  photo={{
                    isLoading: source.isLoading,
                    hasSource: source.hasPhoto,
                    toolUp: photoEditable && toolDefinition(activeTool).workspace === "photo",
                  }}
                  colours={{ slots: colours.slots, onActivate: colours.setActiveSlot, onSwap: colours.swap }}
                  symmetry={{
                    axes: liveSymmetry,
                    squareCanvas: pattern !== null && pattern.width === pattern.height,
                    onToggle: symmetryState.toggle,
                  }}
                  lock={{ on: options.lockTransparency, onChange: (on) => updateOption("lockTransparency", on) }}
                  start={{ startingNew, photoDrop: dropPhoto !== null, onBackToChart: () => setStartingNew(false) }}
                />
              }
              notices={
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
                  accountSaveMessage={accountSave.message}
                  onDismissAccountSaveMessage={accountSave.dismissMessage}
                  stampMessage={stamps.message}
                  onDismissStampMessage={stamps.dismissMessage}
                />
              }
              stage={
                <ImageWindow
                  refs={{ scroller: scrollerRef, frame: frameRef, canvas: canvasRef, hoverCanvas: hoverCanvasRef }}
                  chart={{
                    pattern,
                    cellSize,
                    sourceMeta: source.meta,
                    view: view.shown,
                    activeTool,
                    activeColorIndex,
                    cursorHidden: hoverOutline !== null,
                    lookingOnly: !editing,
                    zoomsOut: readToolOption(options, ZOOM_DIRECTION) === "out",
                  }}
                  start={{
                    visible: startScreenVisible,
                    startingNew,
                    isLoadingImage: source.isLoading,
                    choosePhoto: gatedAction("file.choose-photo", features, lifecycle.choosePhoto),
                    dropPhoto,
                    onCreateBlank: lifecycle.createBlank,
                    onImportPixelArt: lifecycle.choosePixelArt,
                    onOpenPatternFile: lifecycle.chooseFile,
                  }}
                  preview={renderer}
                  adjust={adjustPreview}
                  photoStage={
                    photoStageShown && source.pixelBuffer
                      ? {
                          pixelSize: { width: source.pixelBuffer.width, height: source.pixelBuffer.height },
                          selection: photoEdits.selection,
                          onPress: activeTool === "photo-wand" ? tools.photoPress : null,
                        }
                      : null
                  }
                  pointer={{
                    onDown: handleCanvasPointerDown,
                    onMove: handleCanvasPointerMove,
                    onUp: handleCanvasPointerUp,
                    onLeave: () => updateHoverOutline(null),
                    onDoubleClick: tools.onDoubleClick,
                    onDrop: handleCanvasDrop,
                  }}
                  options={options}
                  cropOverlay={startingNew ? null : tools.overlay}
                  marks={
                    // Where the pages of a paged export fall, while that export is the one chosen.
                    workspace === "export" && chartShown && paginatesAsA4(exports.exportKind) && exports.a4LayoutPreview ? (
                      <PageCuts pages={exports.a4LayoutPreview.pages} cellSize={cellSize} lettered={exports.exportKind.startsWith("a4-")} />
                    ) : null
                  }
                />
              }
              viewControls={
                chartShown ? (
                  <ViewControls
                    awayRef={viewControlsRef}
                    chosen={view.chosenView}
                    shown={view.shown}
                    onChange={view.chooseView}
                    hasPhoto={pattern.sourceImage !== undefined}
                    editing={editing}
                    layerNote={editing ? tools.layerNote : null}
                    isolate={lit.isolate}
                    onIsolateChange={lit.setIsolate}
                    litCount={lit.count}
                    zoomLevel={panZoom.zoomLevel}
                    onZoomIn={() => panZoom.zoomBy(ZOOM_STEP)}
                    onZoomOut={() => panZoom.zoomBy(1 / ZOOM_STEP)}
                    onResetZoom={panZoom.resetZoom}
                  />
                ) : null
              }
              strip={
                workspace === "photo" && chartShown && !photoFree ? (
                  <TriesStrip
                    tries={tries.tries}
                    currentId={currentTryId}
                    busy={generation.isProcessing}
                    refusal={tries.refusal}
                    onChoose={showTry}
                    onPin={tries.pin}
                    onUnpin={tries.unpin}
                    onDelete={tries.remove}
                  />
                ) : null
              }
              readout={
                <StatusBar
                  pattern={startingNew ? null : composite}
                  aidaCount={options.aidaCount}
                  sizeUnit={options.sizeUnit}
                  autosaveStatus={lifecycle.autosaveStatus}
                  hasPattern={chartShown}
                  scrollerRef={scrollerRef}
                  frameRef={frameRef}
                  cellSize={cellSize}
                />
              }
              panel={
                <WorkspacePanel
                  workspace={workspace}
                  pattern={pattern}
                  shown={composite}
                  chartShown={chartShown}
                  startingNew={startingNew}
                  photoFree={photoFree}
                  options={options}
                  onOptionChange={updateOption}
                  onChartOptionChange={updateChartOption}
                  edit={{
                    tab: editTab,
                    onTabChange: (tab) => {
                      setToolTabClosedAt(tools.activation);
                      chooseInspectorTab(tab);
                    },
                    toolTab: tools.tab && chartShown ? { ...tools.tab, shown: toolTabUp, onChoose: () => setToolTabClosedAt(-1) } : null,
                    name: nameDraft,
                    onNameChange: setNameDraft,
                    onNameCommit: () => pattern && history.set(renamePattern(pattern, nameDraft)),
                    commit: history.set,
                    onPreviewChange: setColorPreview,
                    onMergeColors: handleMergeColors,
                    onReplacePalette: handleReplacePalette,
                    documentId: lifecycle.documentId,
                    layers: layers.tab,
                  }}
                  colours={colours}
                  lit={lit}
                  piece={tools.piece}
                  source={source}
                  generation={generation}
                  prediction={colorPrediction}
                  adjustPreview={adjustPreview}
                  photoEdit={{
                    hasSelection: photoEdits.selection !== null,
                    busy: photoEdits.busy,
                    apply: () => photoEdits.apply(options.photoAdjust, () => updateOption("photoAdjust", NEUTRAL_ADJUST)),
                    cancel: () => updateOption("photoAdjust", NEUTRAL_ADJUST),
                    ...photoHistory,
                    edited: !source.edits.isOriginal,
                    restore: source.edits.restore,
                  }}
                  exports={exports}
                />
              }
            />
          )}

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
      </PaletteAccountProvider>
    </SkinProvider>
  );
}
