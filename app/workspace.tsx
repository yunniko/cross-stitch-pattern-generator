"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { hexToRgb, rgbToHex } from "@/lib/color";
import { decodeSourceImage, loadImageAsPixelBuffer } from "@/lib/load-image";
import { cancelPatternJob, runPatternJob } from "@/lib/pattern-client";
import {
  addColor,
  addDmcColor,
  compactUnusedColors,
  compositeSelectionPreview,
  editColorRgb,
  editColorToDmc,
  fillCluster,
  fillClusterDiagonal,
  flipSelectionHorizontal,
  flipSelectionVertical,
  liftSelection,
  mergeColors,
  mergeSelection,
  moveSelection,
  paintStitch,
  renameColor,
  renamePattern,
  resizeCanvas,
  setColorSymbol,
  shiftPattern,
} from "@/lib/pattern-edit";
import { DMC_COLORS, type DmcColor } from "@/lib/dmc-colors";
import { SYMBOL_SET } from "@/lib/symbols";
import { serializePattern } from "@/lib/pattern-serialize";
import { loadPatternFromFile } from "@/lib/pattern-import";
import { generateExportAllZip } from "@/lib/export-all";
import {
  downloadCanvasAsPng,
  drawChart,
  drawChartOutline,
  drawHighlightOverlay,
  renderNavigatorPixels,
  renderPatternToCanvas,
  renderStitchPreviewToCanvas,
  type RenderMode,
} from "@/lib/render";
import { generateA4Export, downloadBlob } from "@/lib/a4-export";
import { calculateA4Layout, type OverlapCells } from "@/lib/a4-layout";
import { buildPatternKeeperPdf } from "@/lib/pattern-keeper-pdf";
import { useUndoHistory } from "@/lib/use-undo-history";
import {
  EMPTY_CELL,
  MAX_COLORS,
  MAX_STITCHES,
  MIN_COLORS,
  MIN_STITCHES,
  SIZE_PRESETS,
  SIZE_PRESET_LABELS,
  type CellRect,
  type FloatingSelection,
  type PixelBuffer,
  type SizePresetId,
  type StitchPattern,
} from "@/lib/types";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT, STANDARD_AIDA_COUNTS, formatFinishedDimension, type SizeUnit } from "@/lib/finished-size";
import { formatSkeinEstimate } from "@/lib/floss-estimate";
import { loadSavedProject, loadWorkspaceOptions, saveProject, saveWorkspaceOptions } from "@/lib/workspace-storage";
import type { EdgeMode, GenerationMode, PaletteMode } from "@/lib/pattern.worker";

// The Image window's target on-screen width for its live-editable (color/bw)
// canvas -- cell size is derived from this so a small pattern isn't a
// postage stamp and a huge one doesn't overflow the window. One shared
// constant (not one per old page/editor split) so switching render modes
// doesn't jump size.
const IMAGE_WINDOW_TARGET_WIDTH_PX = 720;
const IMAGE_WINDOW_MAX_CELL_SIZE = 28;
const IMAGE_WINDOW_MIN_CELL_SIZE = 4;
// Caps the *zoomed-in* editor canvas's total pixel dimensions -- matches
// lib/render.ts's own MAX_CHART_DIMENSION_PX budget for the export path, so
// zooming in on the largest supported pattern can't request a runaway
// canvas allocation the browser can't make.
const IMAGE_WINDOW_MAX_ZOOMED_CANVAS_PX = 8000;

// The Preview/navigator dock's bounded box -- big enough to be useful, small
// enough to stay a "where am I" glance, not a second full preview. Its own
// canvas renders at *true* 1px-per-stitch scale (G-012's own spec) inside
// this box, scrolling internally via overflow if the pattern is larger.
const NAVIGATOR_MAX_SIZE_PX = 180;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.4;
/** How close together (in time) two brush clicks on the same cell need to be to treat the second as "probably part of a double-click" -- see preDoubleClickPatternRef. */
const DOUBLE_CLICK_WINDOW_MS = 400;

// "photo" = the existing "Grid + photo" mode (symbol grid overlaid on the
// source photo, drawChartOutline). "photo-only" is a distinct, newer mode
// (Owner request, 2026-09-12): just the original uploaded photo, no grid/
// symbols at all -- for comparing the generated chart against the source.
type ViewMode = RenderMode | "realistic" | "photo" | "photo-only";
type Tool = "brush" | "pan" | "zoom" | "move" | "highlight" | "select" | "fill";

// --- Tools dock icons (Owner request, 2026-09-12: icons instead of text
// labels, grouped by kind) -- small original stroke-based SVGs rather than
// a new icon-library dependency, matching this project's own minimal-deps
// pattern (no icon package anywhere else in the portfolio either). Every
// tool button keeps an `aria-label` carrying its old visible text as the
// accessible name, so existing behavior (and every e2e test that finds a
// tool by name, e.g. "Move"/"Highlight"/"Pan") is unaffected by dropping
// the visible label.
const TOOL_ICON_PROPS = {
  viewBox: "0 0 24 24",
  className: "h-5 w-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function BrushIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M19 3 13 9" />
      <path d="M13 9c1 1.5.7 3-.5 4.2L8 17.7c-1 1-2.6 1-3.6 0s-1-2.6 0-3.6l4.5-4.5C10.1 8.4 11.6 8.1 13 9Z" />
      <path d="M4 20c1.2-1.8 2.3-2.8 3.3-3.5" />
    </svg>
  );
}

function FillIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M6 7A6 4 0 0 1 18 7" />
      <path d="M5.5 7 6.9 18.3A1.6 1.6 0 0 0 8.5 20h7a1.6 1.6 0 0 0 1.6-1.7L18.5 7Z" />
    </svg>
  );
}

function SelectIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="4 3" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M9 6l3-3 3 3" />
      <path d="M9 18l3 3 3-3" />
      <path d="M6 9l-3 3 3 3" />
      <path d="M18 9l3 3-3 3" />
    </svg>
  );
}

function PanIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M7 11V6a1.5 1.5 0 0 1 3 0v4" />
      <path d="M10 10.5V5a1.5 1.5 0 0 1 3 0v5.5" />
      <path d="M13 10.5V6a1.5 1.5 0 0 1 3 0v6" />
      <path d="M16 12V9a1.5 1.5 0 0 1 3 0v6c0 3.5-2 6-6 6h-1c-3 0-4.5-1-6-3l-2.2-3.3c-.6-.9 0-2.2 1.2-2.2.6 0 1.1.3 1.4.8L7 16" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="20" y1="20" x2="15.5" y2="15.5" />
    </svg>
  );
}

function HighlightIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

/** Grouped per Owner spec (2026-09-12): brush+fill, select+move, pan+zoom+highlight -- each group visually separated by a divider in the Tools dock. */
const TOOL_GROUPS = [
  [
    {
      tool: "brush" as const,
      label: "Brush",
      title: "Paint the selected color -- click a color in the Colors dock first (B). Double-click to flood-fill instead.",
      Icon: BrushIcon,
    },
    {
      tool: "fill" as const,
      label: "Fill",
      title: "Click a color in the Colors dock, then click a cell to flood-fill its same-colored region (diagonal touching counts as connected) (F)",
      Icon: FillIcon,
    },
  ],
  [
    {
      tool: "select" as const,
      label: "Select",
      title: "Drag a rectangle to select it -- then copy/paste/move/flip it before it merges back into the picture",
      Icon: SelectIcon,
    },
    {
      tool: "move" as const,
      label: "Move",
      title: "Drag to reposition the whole design (and its photo underlay) within the canvas",
      Icon: MoveIcon,
    },
  ],
  [
    { tool: "pan" as const, label: "Pan", title: "Drag the Image window to scroll it (or just hold Space with any tool active)", Icon: PanIcon },
    { tool: "zoom" as const, label: "Zoom", title: "Click to zoom in, Shift-click to zoom out (wheel always zooms too)", Icon: ZoomIcon },
    { tool: "highlight" as const, label: "Highlight", title: "Click colors in the Colors dock to dim everything else", Icon: HighlightIcon },
  ],
];

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

/** Same idea as `cellIndexFromEvent`, but clamped to the grid's own bounds instead of returning null outside it -- for drag-based interactions (drawing/moving a selection) where the pointer legitimately drifts past the canvas edge mid-drag and the gesture should still track smoothly rather than stalling. */
function clampedCellFromEvent(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  cellSize: number,
  width: number,
  height: number
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor(((e.clientX - rect.left) * scaleX) / cellSize);
  const y = Math.floor(((e.clientY - rect.top) * scaleY) / cellSize);
  return { x: Math.max(0, Math.min(width - 1, x)), y: Math.max(0, Math.min(height - 1, y)) };
}

function rectFromCorners(x0: number, y0: number, x1: number, y1: number): CellRect {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return { x, y, width: Math.abs(x1 - x0) + 1, height: Math.abs(y1 - y0) + 1 };
}

function pointInRect(x: number, y: number, rect: CellRect): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/** A dashed rectangle outline marking the current/in-progress selection, in a color distinct from the chart's own grid lines. */
function drawSelectionOutline(ctx: CanvasRenderingContext2D, rect: CellRect, cellSize: number) {
  if (rect.width <= 0 || rect.height <= 0) return;
  ctx.save();
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = Math.max(2, Math.round(cellSize * 0.12));
  ctx.setLineDash([Math.max(4, cellSize * 0.5), Math.max(4, cellSize * 0.5)]);
  ctx.strokeRect(rect.x * cellSize, rect.y * cellSize, rect.width * cellSize, rect.height * cellSize);
  ctx.restore();
}

/** Filters the 454-color DMC line by code or name substring (case-insensitive) -- shared by "+ Add" and the color editor's DMC picker (G-016/G-017). */
function filterDmcColors(query: string): readonly DmcColor[] {
  const q = query.trim().toLowerCase();
  if (!q) return DMC_COLORS;
  return DMC_COLORS.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
}

/** Every single-file export the app offers, unified behind one dropdown (G-027, Owner request 2026-09-12) instead of a separate button per format. */
type ExportKind = "png-color" | "png-bw" | "png-realistic" | "editable" | "a4-color" | "a4-bw" | "pdf-color" | "pdf-bw";

/**
 * Ordering/grouping per Owner spec (2026-09-12): editable JSON first (also
 * the default selection -- it's the most complete, most re-importable
 * single-file format), then the realistic preview, then a "Color" group
 * and a "Black & white" group each listing the same three formats in the
 * same order. `<optgroup>` supplies both the header text and the native
 * select's own visual separation -- a plain `<select>` has no divider
 * primitive between individual options, so the two ungrouped items above
 * the groups are ordered but not literally divided by a rule.
 */
const EXPORT_KIND_TOP_OPTIONS: Array<{ value: ExportKind; label: string }> = [
  { value: "editable", label: "Editable pattern (.json)" },
  { value: "png-realistic", label: "Realistic preview PNG" },
];

const EXPORT_KIND_GROUPS: Array<{ heading: string; options: Array<{ value: ExportKind; label: string }> }> = [
  {
    heading: "Color",
    options: [
      { value: "png-color", label: "Full chart PNG" },
      { value: "a4-color", label: "A4 pages (ZIP)" },
      { value: "pdf-color", label: "PDF for Pattern Keeper" },
    ],
  },
  {
    heading: "Black & white",
    options: [
      { value: "png-bw", label: "Full chart PNG" },
      { value: "a4-bw", label: "A4 pages (ZIP)" },
      { value: "pdf-bw", label: "PDF for Pattern Keeper" },
    ],
  },
];

/** `pdf-*`/`a4-*` kinds paginate via the same A4 layout the Overlap setting affects -- used to decide whether to show the page-count preview and whether the PDF font needs fetching. */
function paginatesAsA4(kind: ExportKind): boolean {
  return kind.startsWith("a4-") || kind.startsWith("pdf-");
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
  // Defaults here match lib/workspace-storage.ts's own DEFAULT_OPTIONS --
  // this is what renders before the mount effect below loads whatever was
  // actually persisted (or confirms there's nothing to load).
  const [aidaCount, setAidaCount] = useState<number>(DEFAULT_AIDA_COUNT);
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>(DEFAULT_SIZE_UNIT);
  const [authorName, setAuthorName] = useState("");
  const [showOptionsPanel, setShowOptionsPanel] = useState(false);
  const [colorCount, setColorCount] = useState(16);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("latest");
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("full");
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("standard");
  const [a4Overlap, setA4Overlap] = useState<OverlapCells>(5);
  const [canvasColor, setCanvasColor] = useState("#ffffff");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);

  const longerSideStitches = sizePreset === "custom" ? customSize : SIZE_PRESETS[sizePreset];

  // --- The pattern itself: undo/redo-tracked, null until the first
  // generate (or an opened file). Regenerating pushes a new snapshot onto
  // this same stack, so it undoes/redoes like any other edit (G-012). ---
  const history = useUndoHistory<StitchPattern | null>(null);
  const pattern = history.state;
  // Latest pattern, readable from the native (non-React) wheel listener
  // below without needing to re-attach it on every edit. Synced via an
  // effect, not a direct assignment during render -- this project's lint
  // config (react-hooks/refs) flags ref writes during render.
  const patternRef = useRef<StitchPattern | null>(null);
  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);

  // --- Persisted workspace options + auto-saved project (G-015) ---
  // Gated on a ref (not just "run once on mount") so the save effects below
  // can tell whether the initial load has actually completed yet -- without
  // this, they'd fire on the very first render (before restoring anything)
  // and immediately overwrite/clear whatever was already saved.
  const workspaceRestoredRef = useRef(false);
  useEffect(() => {
    queueMicrotask(() => {
      const options = loadWorkspaceOptions();
      setAidaCount(options.aidaCount);
      setSizeUnit(options.sizeUnit);
      setAuthorName(options.authorName);
      setEdgeMode(options.edgeMode);
      setA4Overlap(options.overlapCells);
      setCanvasColor(options.canvasColor);
      setSizePreset(options.sizePreset);
      setCustomSize(options.customSize);
      setColorCount(options.colorCount);
      setGenerationMode(options.generationMode);
      setPaletteMode(options.paletteMode);

      const saved = loadSavedProject();
      if (saved) {
        loadPatternIntoWorkspace(saved, saved.name ?? "cross-stitch-pattern");
      }
      workspaceRestoredRef.current = true;
    });
    // Deliberately mount-only -- loadPatternIntoWorkspace's identity changes
    // every render, but re-running this restore whenever it changes would
    // defeat the point (it must fire exactly once, before the save effects
    // below start reacting to state changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!workspaceRestoredRef.current) return;
    saveWorkspaceOptions({
      aidaCount,
      sizeUnit,
      authorName,
      edgeMode,
      overlapCells: a4Overlap,
      canvasColor,
      sizePreset,
      customSize,
      colorCount,
      generationMode,
      paletteMode,
    });
  }, [aidaCount, sizeUnit, authorName, edgeMode, a4Overlap, canvasColor, sizePreset, customSize, colorCount, generationMode, paletteMode]);

  useEffect(() => {
    if (!workspaceRestoredRef.current) return;
    saveProject(pattern);
  }, [pattern]);

  // --- Image window view mode + brush/legend state (the Colors dock) ---
  const [viewMode, setViewMode] = useState<ViewMode>("color");
  const [realisticPreviewUrl, setRealisticPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRetryToken, setPreviewRetryToken] = useState(0);
  const [activeColorIndex, setActiveColorIndex] = useState<number | null>(null);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [editingDraftHex, setEditingDraftHex] = useState("#000000");
  // "Full range" (arbitrary hex) vs "DMC" (real thread swatches) for the
  // color-editor panel (G-017). Forced to "dmc" and hidden entirely for a
  // dmcMode pattern; a free-form pattern gets the switcher so any single
  // color can still be snapped to a real thread without converting the
  // whole palette.
  const [editColorMode, setEditColorMode] = useState<"full" | "dmc">("full");
  const [editDmcFilter, setEditDmcFilter] = useState("");
  const [addingColor, setAddingColor] = useState(false);
  const [addColorDraftHex, setAddColorDraftHex] = useState("#808080");
  const [addDmcFilter, setAddDmcFilter] = useState("");
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingSymbolIndex, setEditingSymbolIndex] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<{ pattern: StitchPattern; lastCell: number | null } | null>(null);
  /** The pattern state right before a brush click (or the first click of a double-click) started painting -- see handleCanvasDoubleClick. */
  const preDoubleClickPatternRef = useRef<StitchPattern | null>(null);
  /** Time+cell of the last brush click -- used to recognize "this pointerdown is probably the second half of a double-click" by timing/position alone, since a `PointerEvent`'s own `detail` isn't reliably incremented for the second click across browsers/automation. */
  const lastBrushClickRef = useRef<{ time: number; cellIndex: number } | null>(null);

  // --- Tools dock: active tool + pan/zoom (M2) ---
  const [activeTool, setActiveTool] = useState<Tool>("brush");
  const [zoomLevel, setZoomLevel] = useState(1);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const moveRef = useRef<{ pointerId: number; basePattern: StitchPattern; startX: number; startY: number; lastDx: number; lastDy: number } | null>(null);

  // --- Rectangle Select tool (G-018) ---
  // `selection` is the committed floating piece (drives the normal
  // re-render path below); `selectDragRef` tracks an in-progress drag
  // (drawing a brand-new rectangle, or moving the current selection) the
  // same ref-based way panRef/moveRef do, so dragging doesn't push a
  // React re-render on every pointermove. Nothing here is pushed to
  // `history` until the selection is merged (deselected) -- an entire
  // select/move/flip session collapses into one undo step, same as Move.
  const [selection, setSelection] = useState<FloatingSelection | null>(null);
  const [clipboard, setClipboard] = useState<FloatingSelection | null>(null);
  const selectDragRef = useRef<
    | { pointerId: number; mode: "drawing"; basePattern: StitchPattern; startX: number; startY: number; rect: CellRect }
    | { pointerId: number; mode: "moving"; basePattern: StitchPattern; selection: FloatingSelection; startX: number; startY: number; lastDx: number; lastDy: number }
    | null
  >(null);

  // Highlight tool: colors selected here get dimmed-out contrast against
  // everything else in the Image window (drawHighlightOverlay) -- a pure
  // view concern, never mutates the pattern.
  const [highlightedColorIndices, setHighlightedColorIndices] = useState<ReadonlySet<number>>(new Set());

  // The decoded photo image for "Grid + photo" mode, cached by its data URL
  // so switching modes back and forth doesn't re-decode every time. A ref
  // (not state) since the Image element itself isn't rendered -- only drawn
  // into the canvas -- but photoImageVersion (state) forces a redraw once a
  // new one finishes loading.
  const photoImageRef = useRef<{ dataUrl: string; img: HTMLImageElement } | null>(null);
  const [photoImageVersion, setPhotoImageVersion] = useState(0);
  const navigatorCanvasRef = useRef<HTMLCanvasElement>(null);

  // --- Name, open/save, downloads, export (G-027: one dropdown covers
  // every single-file export; a separate "Export all" bundles all of
  // them into one .cspzip) ---
  const [nameDraft, setNameDraft] = useState("cross-stitch-pattern");
  const [lastCommittedName, setLastCommittedName] = useState<string | undefined>(undefined);
  const [openError, setOpenError] = useState<string | null>(null);
  const [exportKind, setExportKind] = useState<ExportKind>("editable");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openEditableInputRef = useRef<HTMLInputElement>(null);

  // --- Canvas resize (M4): crop/expand any edge in one panel ---
  const [showResizePanel, setShowResizePanel] = useState(false);
  const [resizeDelta, setResizeDelta] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const [resizeFillHex, setResizeFillHex] = useState("#ffffff");
  const [resizeError, setResizeError] = useState<string | null>(null);

  const a4LayoutPreview = useMemo(
    () => (pattern ? calculateA4Layout(pattern.width, pattern.height, { overlapCells: a4Overlap }) : null),
    [pattern, a4Overlap]
  );

  // "+ Add" in a dmcMode pattern (G-016), and the "DMC" side of the color
  // editor's switcher (G-017), both pick from the real DMC line instead of
  // an arbitrary hex color -- filtered by code or name so 454 swatches stay
  // browsable. Two independent filter strings/memos since both pickers can
  // be open (and searched) at the same time.
  const filteredDmcColors = useMemo(() => filterDmcColors(addDmcFilter), [addDmcFilter]);
  const filteredEditDmcColors = useMemo(() => filterDmcColors(editDmcFilter), [editDmcFilter]);

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

  const baseCellSize = pattern
    ? Math.max(
        IMAGE_WINDOW_MIN_CELL_SIZE,
        Math.min(IMAGE_WINDOW_MAX_CELL_SIZE, Math.floor(IMAGE_WINDOW_TARGET_WIDTH_PX / Math.max(pattern.width, pattern.height)))
      )
    : IMAGE_WINDOW_MAX_CELL_SIZE;
  // Zoom actually re-renders at a higher resolution (not a CSS scale of the
  // same low-res canvas) -- otherwise a large pattern's small base cell size
  // (down to 4px, below drawChart's own symbol-legibility floor) would still
  // never show symbols no matter how far in you zoom, defeating the whole
  // point of zooming in on a dense chart to read it. Bounded by the same
  // total-canvas-dimension budget the export path already established
  // (`MAX_CHART_DIMENSION_PX` in lib/render.ts) so 4x zoom on the largest
  // supported pattern can't request a runaway canvas allocation.
  const cellSize = pattern
    ? Math.min(Math.round(baseCellSize * zoomLevel), Math.floor(IMAGE_WINDOW_MAX_ZOOMED_CANVAS_PX / Math.max(pattern.width, pattern.height)))
    : baseCellSize;

  // The photo underlay is drawn at reduced opacity so the (always full-
  // opacity, white-haloed) symbol grid on top of it stays the primary
  // readable layer -- an onion-skin-style reference, not a second download
  // mode, which is why this stays entirely inside the workspace rather than
  // becoming a `RenderMode` the export/A4 paths also need to understand.
  const PHOTO_UNDERLAY_ALPHA = 0.55;

  const drawCurrentView = useCallback(
    (ctx: CanvasRenderingContext2D, p: StitchPattern) => {
      // A committed selection (G-018) is composited in for display only --
      // never mutates `p`/history. Skipped while a drag is actively
      // repositioning it: the pointer-move handler draws its own
      // more-current live preview instead (selectDragRef is a ref, so
      // reading it here doesn't need to be a dependency).
      const displayPattern = activeTool === "select" && selection && !selectDragRef.current ? compositeSelectionPreview(p, selection) : p;

      if (viewMode === "photo" && displayPattern.sourceImage) {
        const cached = photoImageRef.current;
        if (cached && cached.dataUrl === displayPattern.sourceImage.dataUrl) {
          const { naturalWidth, naturalHeight, cellSizePx, offsetX, offsetY } = displayPattern.sourceImage;
          const scale = cellSize / cellSizePx;
          ctx.globalAlpha = PHOTO_UNDERLAY_ALPHA;
          ctx.drawImage(cached.img, offsetX * cellSize, offsetY * cellSize, naturalWidth * scale, naturalHeight * scale);
          ctx.globalAlpha = 1;
        }
        drawChartOutline(ctx, displayPattern, cellSize);
      } else {
        // viewMode is "color" | "bw" here -- "realistic" and "photo-only" are
        // each handled by their own <img>-based rendering below instead (no
        // canvas), and "photo" (Grid + photo) is handled above. canvasColor
        // is the Owner's view-only "canvas color" preference (2026-09-12) --
        // shown behind empty cells here, never passed by any export path.
        drawChart(ctx, displayPattern, viewMode as RenderMode, cellSize, undefined, canvasColor);
      }

      if (activeTool === "highlight" && highlightedColorIndices.size > 0) {
        drawHighlightOverlay(ctx, displayPattern, cellSize, highlightedColorIndices);
      }

      if (activeTool === "select" && selection && !selectDragRef.current) {
        drawSelectionOutline(ctx, selection, cellSize);
      }
    },
    // photoImageVersion isn't read directly but its change means
    // photoImageRef.current now points at a newly-loaded image -- this
    // callback (and the effect below re-running it) needs to be recreated
    // then, or the redraw would use a stale closure and never show it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewMode, cellSize, photoImageVersion, activeTool, highlightedColorIndices, selection, canvasColor]
  );

  // --- Image window: live editable canvas for color/bw/photo ---
  useEffect(() => {
    if (viewMode === "realistic" || viewMode === "photo-only") return;
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return;
    canvas.width = pattern.width * cellSize;
    canvas.height = pattern.height * cellSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCurrentView(ctx, pattern);
  }, [pattern, viewMode, cellSize, photoImageVersion, drawCurrentView]);

  // Decodes the pattern's embedded photo once per unique data URL, for
  // "Grid + photo" mode -- lazy (only while that mode is selected) so
  // patterns/sessions that never use it never pay for the decode.
  useEffect(() => {
    if (viewMode !== "photo" || !pattern?.sourceImage) return;
    const sourceImage = pattern.sourceImage;
    if (photoImageRef.current?.dataUrl === sourceImage.dataUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      photoImageRef.current = { dataUrl: sourceImage.dataUrl, img };
      setPhotoImageVersion((v) => v + 1);
    };
    img.src = sourceImage.dataUrl;
    return () => {
      cancelled = true;
    };
  }, [viewMode, pattern?.sourceImage]);

  // --- Preview/navigator dock: the whole pattern at true 1px-per-stitch scale ---
  useEffect(() => {
    const canvas = navigatorCanvasRef.current;
    if (!canvas || !pattern) return;
    canvas.width = pattern.width;
    canvas.height = pattern.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Cast needed: Uint8ClampedArray's ArrayBufferLike-vs-ArrayBuffer generic
    // mismatch between TS's typed-array and DOM lib definitions -- the
    // runtime array is always a plain ArrayBuffer (`new Uint8ClampedArray(n)`
    // never produces a SharedArrayBuffer-backed one).
    const pixels = renderNavigatorPixels(pattern) as unknown as Uint8ClampedArray<ArrayBuffer>;
    ctx.putImageData(new ImageData(pixels, pattern.width, pattern.height), 0, 0);
  }, [pattern]);

  function redrawWith(p: StitchPattern) {
    if (viewMode === "realistic") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCurrentView(ctx, p);
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
      setZoomLevel(1);
      setHighlightedColorIndices(new Set());
      setSelection(null);
      setShowResizePanel(false);
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
        paletteMode,
        edgeMode,
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
      // Any in-progress selection references coordinates/cells from the
      // pattern being replaced -- stale (and possibly out-of-bounds) the
      // instant a new one lands, so it's discarded rather than merged
      // (there's nothing correct left to merge it into).
      setSelection(null);
      selectDragRef.current = null;

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

  const zoomBy = useCallback((factor: number) => {
    setZoomLevel((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor)));
  }, []);

  // A *native* (non-React) listener, deliberately not React's own `onWheel`
  // prop: React attaches wheel/touch handlers as passive by default (a
  // long-standing, documented choice -- see facebook/react#14856), which
  // makes `e.preventDefault()` inside a React `onWheel` handler a silent
  // no-op on real hardware wheel/trackpad input. Without this, scrolling
  // the wheel over the Image window would zoom *and* natively scroll the
  // container at the same time -- exactly the "scaling and panning
  // interfere with each other" symptom this fixes.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    function onWheel(e: WheelEvent) {
      if (!patternRef.current) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    }
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // --- Rectangle Select tool helpers (G-018) ---

  /** Redraws the canvas for the current in-progress select-tool drag (drawing a new rectangle, or moving the current selection) -- called from both pointerdown (for instant feedback) and pointermove. */
  function redrawSelectionDrag() {
    const drag = selectDragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (drag.mode === "drawing") {
      drawCurrentView(ctx, drag.basePattern);
      drawSelectionOutline(ctx, drag.rect, cellSize);
    } else {
      const moved = moveSelection(drag.selection, drag.lastDx, drag.lastDy);
      drawCurrentView(ctx, compositeSelectionPreview(drag.basePattern, moved));
      drawSelectionOutline(ctx, moved, cellSize);
    }
  }

  /** Commits the current floating selection into the pattern/history and clears selection state -- the "as soon as selection is reset, the editable piece merges into picture" step. No-op if there's nothing selected. */
  function mergeCurrentSelection() {
    if (!selection || !pattern) return;
    history.set(mergeSelection(pattern, selection));
    setSelection(null);
  }

  /** Tools-dock button handler: switching away from Select merges whatever's currently floating first, exactly like clicking outside it on the canvas would. */
  function switchTool(tool: Tool) {
    if (activeTool === "select" && tool !== "select") mergeCurrentSelection();
    setActiveTool(tool);
  }

  function commitCopySelection() {
    if (!selection) return;
    setClipboard(selection);
  }

  function commitPasteSelection() {
    if (!clipboard || !pattern) return;
    mergeCurrentSelection(); // don't silently discard whatever's currently floating
    // Offset from the copy's own original spot so a paste is visibly a new
    // piece, not indistinguishable from the (untouched) copy source.
    const pasted = moveSelection({ ...clipboard, originRect: undefined }, 3, 3);
    setSelection(pasted);
  }

  function commitFlipSelectionHorizontal() {
    if (!selection) return;
    setSelection(flipSelectionHorizontal(selection));
  }

  function commitFlipSelectionVertical() {
    if (!selection) return;
    setSelection(flipSelectionVertical(selection));
  }

  // Escape deselects (merges) the current selection -- the explicit,
  // discoverable-by-convention counterpart to the Deselect button, and to
  // clicking outside the selection on the canvas.
  useEffect(() => {
    if (activeTool !== "select") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") mergeCurrentSelection();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, selection, pattern]);

  /**
   * Global keyboard shortcuts (Owner request, 2026-09-12): Ctrl+Z/Ctrl+Y for
   * undo/redo, B/F to switch to Brush/Fill, holding Space to pan
   * temporarily -- the same convention every mainstream image editor uses --
   * regardless of whichever tool was active before (releasing Space restores
   * it), and 1-5 to switch the Image window's view mode (Color/B&W/
   * Realistic/Grid+photo/Original photo). Skipped entirely while focus is in
   * a text input/textarea/contenteditable element, so typing the pattern
   * name, author name, or a DMC search query is never hijacked as a
   * shortcut (and Ctrl+Z there stays that field's own native undo, not this
   * app's pattern-level one).
   */
  const previousToolRef = useRef<Tool | null>(null);
  const spacePanActiveRef = useRef(false);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        history.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        history.redo();
        return;
      }

      if (!pattern) return; // no pattern yet -- every tool button is disabled too

      if (e.key === " ") {
        e.preventDefault(); // stop the page itself from scrolling on every repeat while held
        if (!spacePanActiveRef.current) {
          spacePanActiveRef.current = true;
          previousToolRef.current = activeTool;
          switchTool("pan");
        }
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key.toLowerCase() === "b") switchTool("brush");
        else if (e.key.toLowerCase() === "f") switchTool("fill");
        else if (e.key === "1") setViewMode("color");
        else if (e.key === "2") setViewMode("bw");
        else if (e.key === "3") setViewMode("realistic");
        else if (e.key === "4" && pattern.sourceImage) setViewMode("photo");
        else if (e.key === "5" && pattern.sourceImage) setViewMode("photo-only");
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === " " && spacePanActiveRef.current) {
        spacePanActiveRef.current = false;
        const restore = previousToolRef.current;
        previousToolRef.current = null;
        if (restore) setActiveTool(restore);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, pattern]);

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return;

    if (activeTool === "pan") {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      panRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, scrollLeft: scroller.scrollLeft, scrollTop: scroller.scrollTop };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool === "zoom") {
      zoomBy(e.shiftKey || e.altKey ? 1 / ZOOM_STEP : ZOOM_STEP);
      return;
    }

    if (activeTool === "move") {
      moveRef.current = { pointerId: e.pointerId, basePattern: pattern, startX: e.clientX, startY: e.clientY, lastDx: 0, lastDy: 0 };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool === "select") {
      const { x: cx, y: cy } = clampedCellFromEvent(e, canvas, cellSize, pattern.width, pattern.height);
      if (selection && pointInRect(cx, cy, selection)) {
        selectDragRef.current = { pointerId: e.pointerId, mode: "moving", basePattern: pattern, selection, startX: cx, startY: cy, lastDx: 0, lastDy: 0 };
      } else {
        // Clicking outside the current selection commits it first, then starts drawing a new one.
        let workingPattern = pattern;
        if (selection) {
          workingPattern = mergeSelection(pattern, selection);
          history.set(workingPattern);
          setSelection(null);
        }
        selectDragRef.current = { pointerId: e.pointerId, mode: "drawing", basePattern: workingPattern, startX: cx, startY: cy, rect: { x: cx, y: cy, width: 1, height: 1 } };
      }
      canvas.setPointerCapture(e.pointerId);
      redrawSelectionDrag();
      return;
    }

    if (activeTool === "fill") {
      if (activeColorIndex === null) return;
      const cellIndex = cellIndexFromEvent(e, canvas, cellSize, pattern.width, pattern.height);
      if (cellIndex === null) return;
      history.set(fillClusterDiagonal(pattern, cellIndex, activeColorIndex));
      return;
    }

    if (activeTool === "highlight" || activeColorIndex === null) return;
    const cellIndex = cellIndexFromEvent(e, canvas, cellSize, pattern.width, pattern.height);
    if (cellIndex === null) return;
    // Only the *first* click of a potential double-click should snapshot
    // `pattern` here -- a second click landing on the same cell shortly
    // after keeps the first click's snapshot, so a following dblclick (see
    // handleCanvasDoubleClick) can flood-fill the region as it was *before*
    // either of the double-click's two incidental single-cell paints ran,
    // rather than the tiny, already-repainted region they'd otherwise leave
    // behind. Timing+position, not `e.detail`: a PointerEvent's own click
    // count isn't reliably incremented for the second click across every
    // browser/automation tool.
    const now = Date.now();
    const last = lastBrushClickRef.current;
    const isSecondClickOfDoubleClick = last !== null && now - last.time < DOUBLE_CLICK_WINDOW_MS && last.cellIndex === cellIndex;
    if (!isSecondClickOfDoubleClick) preDoubleClickPatternRef.current = pattern;
    lastBrushClickRef.current = { time: now, cellIndex };
    const painted = paintStitch(pattern, cellIndex, activeColorIndex);
    strokeRef.current = { pattern: painted, lastCell: cellIndex };
    redrawWith(painted);
    canvas.setPointerCapture(e.pointerId);
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (panRef.current && panRef.current.pointerId === e.pointerId) {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      scroller.scrollLeft = panRef.current.scrollLeft - (e.clientX - panRef.current.startX);
      scroller.scrollTop = panRef.current.scrollTop - (e.clientY - panRef.current.startY);
      return;
    }

    if (moveRef.current && moveRef.current.pointerId === e.pointerId) {
      const move = moveRef.current;
      const dx = Math.round((e.clientX - move.startX) / cellSize);
      const dy = Math.round((e.clientY - move.startY) / cellSize);
      if (dx === move.lastDx && dy === move.lastDy) return;
      move.lastDx = dx;
      move.lastDy = dy;
      redrawWith(shiftPattern(move.basePattern, dx, dy));
      return;
    }

    if (selectDragRef.current && selectDragRef.current.pointerId === e.pointerId) {
      const canvas = canvasRef.current;
      if (!canvas || !pattern) return;
      const { x: cx, y: cy } = clampedCellFromEvent(e, canvas, cellSize, pattern.width, pattern.height);
      const drag = selectDragRef.current;
      if (drag.mode === "drawing") {
        const rect = rectFromCorners(drag.startX, drag.startY, cx, cy);
        if (rect.x === drag.rect.x && rect.y === drag.rect.y && rect.width === drag.rect.width && rect.height === drag.rect.height) return;
        drag.rect = rect;
      } else {
        const dx = cx - drag.startX;
        const dy = cy - drag.startY;
        if (dx === drag.lastDx && dy === drag.lastDy) return;
        drag.lastDx = dx;
        drag.lastDy = dy;
      }
      redrawSelectionDrag();
      return;
    }

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
    if (panRef.current && panRef.current.pointerId === e.pointerId) {
      panRef.current = null;
      if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
        canvasRef.current.releasePointerCapture(e.pointerId);
      }
      return;
    }

    if (moveRef.current && moveRef.current.pointerId === e.pointerId) {
      const move = moveRef.current;
      moveRef.current = null;
      if (move.lastDx !== 0 || move.lastDy !== 0) {
        history.set(shiftPattern(move.basePattern, move.lastDx, move.lastDy));
      }
      if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
        canvasRef.current.releasePointerCapture(e.pointerId);
      }
      return;
    }

    if (selectDragRef.current && selectDragRef.current.pointerId === e.pointerId) {
      const drag = selectDragRef.current;
      selectDragRef.current = null;
      setSelection(drag.mode === "drawing" ? liftSelection(drag.basePattern, drag.rect) : moveSelection(drag.selection, drag.lastDx, drag.lastDy));
      if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
        canvasRef.current.releasePointerCapture(e.pointerId);
      }
      return;
    }

    if (!strokeRef.current) return;
    history.set(strokeRef.current.pattern);
    strokeRef.current = null;
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
  }

  /** Owner request (2026-09-12): double-clicking with Brush active flood-fills the cell's same-colored region, the same action the Fill tool's own click already does -- a shortcut so switching tools isn't needed for an occasional fill while painting. */
  function handleCanvasDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return;
    if (activeTool !== "brush" || activeColorIndex === null) return;
    const cellIndex = cellIndexFromEvent(e, canvas, cellSize, pattern.width, pattern.height);
    if (cellIndex === null) return;
    // Flood-fill from the state *before* the double-click's own two
    // incidental single-cell paints (each already committed to history by
    // this point) -- not the current `pattern`, which by now only shows a
    // single already-repainted cell and would make the fill a no-op beyond
    // what those two clicks already did. Falls back to `pattern` itself in
    // the unlikely event no pre-click snapshot was captured.
    const basePattern = preDoubleClickPatternRef.current ?? pattern;
    history.set(fillClusterDiagonal(basePattern, cellIndex, activeColorIndex));
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
      // A merge remaps every palette index above the removed source, so any
      // previously-highlighted indices could now point at the wrong colors
      // entirely -- clearing outright (rather than trying to remap the set)
      // is the safe choice here.
      if (highlightedColorIndices.size > 0) setHighlightedColorIndices(new Set());
    };
  }

  function openColorEditor(paletteIndex: number) {
    if (!pattern) return;
    setEditingColorIndex(paletteIndex);
    setEditingDraftHex(rgbToHex(pattern.palette[paletteIndex].rgb));
    // A dmcMode pattern is DMC-only, no switcher; a free-form pattern
    // defaults to "Full range" but can switch to DMC for this one color.
    setEditColorMode(pattern.dmcMode ? "dmc" : "full");
    setEditDmcFilter("");
  }

  function commitEditDmcColor(code: string) {
    if (editingColorIndex === null || !pattern) return;
    history.set(editColorToDmc(pattern, editingColorIndex, code));
    setEditingColorIndex(null);
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

  function commitAddDmcColor(code: string) {
    if (!pattern) return;
    history.set(addDmcColor(pattern, code));
    setAddingColor(false);
    setAddDmcFilter("");
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

  function pickSymbol(symbol: string) {
    if (editingSymbolIndex === null || !pattern) return;
    history.set(setColorSymbol(pattern, editingSymbolIndex, symbol));
    setEditingSymbolIndex(null);
  }

  function baseFileName(): string {
    return pattern?.name ?? "cross-stitch-pattern";
  }

  function commitNameChange() {
    if (!pattern) return;
    history.set(renamePattern(pattern, nameDraft));
  }

  /**
   * Shared by "Open editable pattern" and the on-mount auto-restore (G-015)
   * -- both need to land a freshly-loaded `StitchPattern` into every piece
   * of state that depends on it, including re-decoding an embedded source
   * photo so Regenerate/Move/photo-underlay keep working (G-012).
   */
  async function loadPatternIntoWorkspace(loaded: StitchPattern, fallbackName: string) {
    const withName = { ...loaded, name: loaded.name ?? fallbackName };
    history.reset(withName);
    setActiveColorIndex(null);
    setZoomLevel(1);
    setHighlightedColorIndices(new Set());
    setSelection(null);
    setShowResizePanel(false);
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
  }

  function handleOpenFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOpenError(null);
    loadPatternFromFile(file)
      .then(async (loaded) => {
        const fallbackName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]editable$/, "");
        await loadPatternIntoWorkspace(loaded, fallbackName);
      })
      .catch((err) => setOpenError(err instanceof Error ? err.message : "Couldn't open that file."));
  }

  /** Fetches the embedded PDF font on demand (not bundled in the app's JS) -- shared by the single-export PDF kinds and "Export all". */
  async function fetchPdfFontBytes(): Promise<Uint8Array> {
    const fontResponse = await fetch("/fonts/DejaVuSans.ttf");
    if (!fontResponse.ok) throw new Error("Couldn't load the PDF font.");
    return new Uint8Array(await fontResponse.arrayBuffer());
  }

  /** Every single-file export format lives behind this one dropdown (G-027) -- picking `exportKind` and clicking "Export" is the only way to reach any of them now. */
  function handleExport() {
    if (!pattern) return;
    setIsExporting(true);
    setExportError(null);
    setTimeout(async () => {
      try {
        const compacted = compactUnusedColors(pattern);
        switch (exportKind) {
          case "png-color":
          case "png-bw": {
            const mode: RenderMode = exportKind === "png-color" ? "color" : "bw";
            const canvas = renderPatternToCanvas(compacted, mode, { aidaCount, sizeUnit, authorName });
            await downloadCanvasAsPng(canvas, `${baseFileName()}_${mode}.png`);
            break;
          }
          case "png-realistic": {
            const canvas = await renderStitchPreviewToCanvas(compacted);
            await downloadCanvasAsPng(canvas, `${baseFileName()}_preview.png`);
            break;
          }
          case "editable": {
            const json = serializePattern(pattern);
            downloadBlob(new Blob([json], { type: "application/json" }), `${baseFileName()}_editable.json`);
            break;
          }
          case "a4-color":
          case "a4-bw": {
            const mode: RenderMode = exportKind === "a4-color" ? "color" : "bw";
            const result = await generateA4Export(compacted, mode, {
              overlapCells: a4Overlap,
              baseName: baseFileName(),
              aidaCount,
              sizeUnit,
              authorName,
            });
            downloadBlob(result.blob, result.filename);
            break;
          }
          case "pdf-color":
          case "pdf-bw": {
            const mode: RenderMode = exportKind === "pdf-color" ? "color" : "bw";
            const fontBytes = await fetchPdfFontBytes();
            const pdfBytes = await buildPatternKeeperPdf(compacted, mode, fontBytes, {
              overlapCells: a4Overlap,
              aidaCount,
              sizeUnit,
              authorName,
            });
            downloadBlob(new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }), `${baseFileName()}_patternkeeper.pdf`);
            break;
          }
        }
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "Couldn't complete that export.");
      } finally {
        setIsExporting(false);
      }
    }, 0);
  }

  /** Bundles every export format into one .cspzip (G-027, Owner request 2026-09-12). */
  function handleExportAll() {
    if (!pattern) return;
    setIsExportingAll(true);
    setExportError(null);
    setTimeout(async () => {
      try {
        const compacted = compactUnusedColors(pattern);
        const fontBytes = await fetchPdfFontBytes();
        const result = await generateExportAllZip(compacted, {
          baseName: baseFileName(),
          aidaCount,
          sizeUnit,
          authorName,
          overlapCells: a4Overlap,
          fontBytes,
        });
        downloadBlob(result.blob, result.filename);
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "Couldn't build the export-all bundle.");
      } finally {
        setIsExportingAll(false);
      }
    }, 0);
  }

  function openResizePanel() {
    setResizeDelta({ left: 0, right: 0, top: 0, bottom: 0 });
    setResizeFillHex("#ffffff");
    setResizeError(null);
    setShowResizePanel(true);
  }

  function handleApplyResize() {
    if (!pattern) return;
    try {
      history.set(resizeCanvas(pattern, resizeDelta, hexToRgb(resizeFillHex)));
      setShowResizePanel(false);
    } catch (err) {
      setResizeError(err instanceof Error ? err.message : "Couldn't resize the canvas.");
    }
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
            title="Ctrl+Z"
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={history.redo}
            disabled={!history.canRedo}
            title="Ctrl+Y"
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
          >
            Redo
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => openEditableInputRef.current?.click()}
            title="Accepts a .json pattern file, or a .cspzip/.zip export-all bundle -- searched for a valid pattern inside"
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
          >
            Open pattern…
          </button>
          <input ref={openEditableInputRef} type="file" accept=".json,.zip,.cspzip,application/json,application/zip" onChange={handleOpenFile} className="hidden" />
          <button
            type="button"
            onClick={() => setShowOptionsPanel((v) => !v)}
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
          >
            Options…
          </button>
          <button
            type="button"
            onClick={openResizePanel}
            disabled={!pattern}
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
          >
            Resize canvas…
          </button>

          <div className="mx-1 h-5 w-px shrink-0 bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />

          <select
            aria-label="Export"
            value={exportKind}
            onChange={(e) => setExportKind(e.target.value as ExportKind)}
            className="min-w-[190px] rounded-full border border-zinc-300 px-3 py-1 text-sm transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-white/[.08]"
          >
            {EXPORT_KIND_TOP_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            {EXPORT_KIND_GROUPS.map(({ heading, options }) => (
              <optgroup key={heading} label={heading}>
                {options.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExport}
            disabled={!pattern || isExporting || isExportingAll}
            className="rounded-full bg-foreground px-3 py-1 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {isExporting ? "Preparing…" : "Export"}
          </button>
          <button
            type="button"
            onClick={handleExportAll}
            disabled={!pattern || isExporting || isExportingAll}
            title="One .cspzip with everything: editable JSON, color/B&W/realistic PNGs, the Pattern Keeper PDF, and A4_color/A4_bw subfolders of A4 page PNGs"
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
          >
            {isExportingAll ? "Building…" : "Export all"}
          </button>
        </div>
      </header>
      {openError && <p className="border-b border-red-300 bg-red-50 px-4 py-1 text-xs text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">{openError}</p>}
      {exportError && <p className="border-b border-red-300 bg-red-50 px-4 py-1 text-xs text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">{exportError}</p>}
      {paginatesAsA4(exportKind) && a4LayoutPreview && (
        <p className="border-b border-zinc-300 bg-white px-4 py-1 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          {a4LayoutPreview.columns} × {a4LayoutPreview.rows} pages — {a4LayoutPreview.pages.length + 2}+ total (incl. simple + extended legend). Overlap in Options.
        </p>
      )}

      {showOptionsPanel && (
        <div className="flex flex-wrap items-center gap-4 border-b border-zinc-300 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-sm font-medium">Options</span>
          <label className="flex items-center gap-1.5 text-sm">
            Fabric count
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
          </label>
          <div className="flex items-center gap-1.5 text-sm">
            Unit
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
          <label className="flex items-center gap-1.5 text-sm">
            Author name
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="(shown on exported charts)"
              className="w-56 rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm" title="How many stitches of overlap the A4/PDF page exports repeat between adjacent pages, so they can be lined up when printed">
            A4/PDF overlap
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
          <span className="text-xs text-zinc-500">Saved automatically in this browser.</span>
          <button
            type="button"
            onClick={() => setShowOptionsPanel(false)}
            className="ml-auto rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium dark:border-zinc-700"
          >
            Close
          </button>
        </div>
      )}

      {activeTool === "select" && pattern && (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-300 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-sm font-medium">Selection</span>
          <span className="text-xs text-zinc-500">
            {selection ? "Drag inside it to move, or drag elsewhere to start a new selection." : "Drag a rectangle on the Image window to select it."}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={commitCopySelection}
              disabled={!selection}
              className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={commitPasteSelection}
              disabled={!clipboard}
              className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
            >
              Paste
            </button>
            <button
              type="button"
              onClick={commitFlipSelectionHorizontal}
              disabled={!selection}
              className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
            >
              Flip horizontal
            </button>
            <button
              type="button"
              onClick={commitFlipSelectionVertical}
              disabled={!selection}
              className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
            >
              Flip vertical
            </button>
            <button
              type="button"
              onClick={mergeCurrentSelection}
              disabled={!selection}
              className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
            >
              Deselect
            </button>
          </div>
        </div>
      )}

      {showResizePanel && pattern && (
        <div className="flex flex-wrap items-center gap-4 border-b border-zinc-300 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-sm font-medium">Resize canvas</span>
          {(
            [
              { key: "top" as const, label: "Top" },
              { key: "bottom" as const, label: "Bottom" },
              { key: "left" as const, label: "Left" },
              { key: "right" as const, label: "Right" },
            ]
          ).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 text-sm">
              {label}
              <input
                type="number"
                value={resizeDelta[key]}
                onChange={(e) => setResizeDelta((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                className="w-16 rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          ))}
          <span className="text-xs text-zinc-500">(positive expands, negative crops)</span>
          {(resizeDelta.left > 0 || resizeDelta.right > 0 || resizeDelta.top > 0 || resizeDelta.bottom > 0) && (
            <label className="flex items-center gap-1.5 text-sm">
              Fill color
              <input
                type="color"
                value={resizeFillHex}
                onChange={(e) => setResizeFillHex(e.target.value)}
                className="h-6 w-8 rounded border border-zinc-300 dark:border-zinc-700"
              />
            </label>
          )}
          <span className="text-xs text-zinc-500">
            → {pattern.width + resizeDelta.left + resizeDelta.right} × {pattern.height + resizeDelta.top + resizeDelta.bottom} stitches
          </span>
          <button
            type="button"
            onClick={handleApplyResize}
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setShowResizePanel(false)}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium dark:border-zinc-700"
          >
            Cancel
          </button>
          {resizeError && <p className="w-full text-sm text-red-600 dark:text-red-400">{resizeError}</p>}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Tools dock (left) */}
        <aside className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-zinc-300 bg-white py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Tools</span>
          {TOOL_GROUPS.map((group, groupIndex) => (
            <Fragment key={groupIndex}>
              {groupIndex > 0 && <div className="my-1 h-px w-8 shrink-0 bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />}
              {group.map(({ tool, label, title, Icon }) => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => switchTool(tool)}
                  disabled={!pattern}
                  title={title}
                  aria-label={label}
                  aria-pressed={activeTool === tool}
                  className={`flex h-10 w-10 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-50 ${
                    activeTool === tool ? "border-foreground bg-black/[.06] dark:bg-white/[.1]" : "border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  <Icon />
                </button>
              ))}
            </Fragment>
          ))}
        </aside>

        {/* Center: Image window + Processing-params dock */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-zinc-300 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-sm font-medium">
              {pattern ? `${pattern.width} × ${pattern.height} stitches, ${pattern.palette.length} colors` : "No pattern yet"}
            </span>
            {pattern && (
              <div className="ml-auto flex items-center gap-3 text-sm">
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
                <label
                  className={`flex items-center gap-1.5 ${!pattern.sourceImage ? "opacity-50" : ""}`}
                  title={pattern.sourceImage ? undefined : "No source photo is associated with this pattern"}
                >
                  <input
                    type="radio"
                    name="view-mode"
                    checked={viewMode === "photo"}
                    disabled={!pattern.sourceImage}
                    onChange={() => setViewMode("photo")}
                  />
                  Grid + photo
                </label>
                <label
                  className={`flex items-center gap-1.5 ${!pattern.sourceImage ? "opacity-50" : ""}`}
                  title={pattern.sourceImage ? undefined : "No source photo is associated with this pattern"}
                >
                  <input
                    type="radio"
                    name="view-mode"
                    checked={viewMode === "photo-only"}
                    disabled={!pattern.sourceImage}
                    onChange={() => setViewMode("photo-only")}
                  />
                  Original photo
                </label>
                <label
                  className="ml-2 flex items-center gap-1.5 border-l border-zinc-300 pl-3 dark:border-zinc-700"
                  title="Shown behind empty stitches in Color/B&W view and behind the realistic preview -- display only, never affects any export"
                >
                  Canvas color
                  <input
                    type="color"
                    value={canvasColor}
                    onChange={(e) => setCanvasColor(e.target.value)}
                    className="h-6 w-8 cursor-pointer rounded border border-zinc-300 bg-transparent p-0 dark:border-zinc-700"
                  />
                </label>
                <div className="ml-2 flex items-center gap-1 border-l border-zinc-300 pl-3 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => zoomBy(1 / ZOOM_STEP)}
                    className="rounded border border-zinc-300 px-2 py-0.5 text-sm hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
                    aria-label="Zoom out"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomLevel(1)}
                    className="min-w-[3.5rem] rounded border border-zinc-300 px-2 py-0.5 text-center text-xs hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
                    aria-label="Reset zoom to 100%"
                    title="Reset zoom to 100%"
                  >
                    {Math.round(zoomLevel * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => zoomBy(ZOOM_STEP)}
                    className="rounded border border-zinc-300 px-2 py-0.5 text-sm hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>

          <div
            ref={scrollerRef}
            // `grid place-items-center`, not `flex items-center
            // justify-center` -- flexbox's "unsafe" centering makes the
            // overflow that pokes out the *start* edge (top/left)
            // unreachable by scrolling once the zoomed content is bigger
            // than the container (scrollTop/scrollLeft can't go negative),
            // while the end edge (bottom/right) stays reachable normally.
            // That's exactly "can't pan to the top when zoomed in" -- CSS
            // Grid's centering is scroll-safe in both directions instead.
            className="grid flex-1 place-items-center overflow-auto p-4"
          >
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
            {pattern && viewMode === "photo-only" && pattern.sourceImage && (
              // eslint-disable-next-line @next/next/no-img-element -- data URL, not a static asset next/image can optimize
              <img
                src={pattern.sourceImage.dataUrl}
                alt="Original uploaded photo"
                className="max-h-full max-w-full border border-zinc-300 dark:border-zinc-700"
              />
            )}
            {pattern && viewMode !== "realistic" && viewMode !== "photo-only" && (
              <canvas
                ref={canvasRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                onDoubleClick={handleCanvasDoubleClick}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleCanvasDrop}
                className={`touch-none border border-zinc-300 dark:border-zinc-700 ${
                  activeTool === "pan"
                    ? "cursor-grab active:cursor-grabbing"
                    : activeTool === "zoom"
                      ? "cursor-zoom-in"
                      : activeTool === "select" || activeTool === "fill" || activeColorIndex !== null
                        ? "cursor-crosshair"
                        : ""
                }`}
              />
            )}
            {pattern && viewMode === "realistic" && realisticPreviewUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- data URL, not a static asset next/image can optimize
              <img
                src={realisticPreviewUrl}
                alt="Cross-stitch pattern preview"
                // The Owner's "canvas color" (2026-09-12) shown as a backdrop
                // behind this PNG's own transparent background -- display
                // only, via inline style on the <img> itself: the downloaded
                // file (a separate render via downloadCanvasAsPng) is
                // untouched and stays transparent regardless.
                style={{ backgroundColor: canvasColor }}
                className="border border-zinc-300 dark:border-zinc-700"
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
                {(["small", "medium", "large", "xl", "xxl"] as const).map((preset) => (
                  <label key={preset} className="flex items-center gap-1">
                    <input type="radio" name="size-preset" checked={sizePreset === preset} onChange={() => setSizePreset(preset)} />
                    {SIZE_PRESET_LABELS[preset]} ({SIZE_PRESETS[preset]})
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
                ≈ {formatFinishedDimension(longerSideStitches, aidaCount, sizeUnit)} on the longer side at {aidaCount}-count Aida (change fabric count/unit in Options)
              </p>
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
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Algorithm</span>
                  <div className="flex items-center overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
                    {(
                      [
                        { mode: "latest", label: "Latest", title: "The current color-picking algorithm" },
                        { mode: "original", label: "Original", title: "The algorithm this project first shipped with" },
                      ] as const
                    ).map(({ mode, label, title }) => (
                      <button
                        key={mode}
                        type="button"
                        title={title}
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
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Palette</span>
                  <div className="flex items-center overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
                    {(
                      [
                        { mode: "full", label: "Full range", title: "Whatever colors the chosen algorithm finds" },
                        {
                          mode: "dmc",
                          label: "DMC",
                          title:
                            'Snaps the palette to real, buyable DMC thread colors (G-013) -- colors are named "code - name" and similar shades may merge into one',
                        },
                      ] as const
                    ).map(({ mode, label, title }) => (
                      <button
                        key={mode}
                        type="button"
                        title={title}
                        onClick={() => setPaletteMode(mode)}
                        className={`px-2 py-0.5 text-sm transition-colors ${
                          paletteMode === mode ? "bg-foreground text-background" : "hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Edges</span>
                  <div className="flex items-center overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
                    {(
                      [
                        { mode: "standard", label: "Standard", title: "Today's default -- averages colors across a boundary" },
                        {
                          mode: "crisp",
                          label: "Crisp",
                          title: "Preserves hard color boundaries instead of blending them into a manufactured intermediate color (G-024)",
                        },
                      ] as const
                    ).map(({ mode, label, title }) => (
                      <button
                        key={mode}
                        type="button"
                        title={title}
                        onClick={() => setEdgeMode(mode)}
                        className={`px-2 py-0.5 text-sm transition-colors ${
                          edgeMode === mode ? "bg-foreground text-background" : "hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
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
          {pattern && (
            <div className="flex flex-col gap-1 border-b border-zinc-300 pb-2 dark:border-zinc-800">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Navigator</span>
              <div
                className="overflow-auto rounded border border-zinc-300 dark:border-zinc-700"
                style={{ maxWidth: NAVIGATOR_MAX_SIZE_PX, maxHeight: NAVIGATOR_MAX_SIZE_PX }}
              >
                <canvas ref={navigatorCanvasRef} style={{ imageRendering: "pixelated" }} className="block" />
              </div>
              <p className="text-[11px] text-zinc-500">
                {pattern.width} × {pattern.height} px, true scale
              </p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Colors</span>
            <button
              type="button"
              onClick={() => {
                setAddColorDraftHex("#808080");
                setAddDmcFilter("");
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

          {pattern && (
            <div
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", String(EMPTY_CELL))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleLegendDrop(EMPTY_CELL)}
              onClick={() => setActiveColorIndex(activeColorIndex === EMPTY_CELL ? null : EMPTY_CELL)}
              title="No stitch -- marks cells that shouldn't be stitched at all. Never appears in the legend or exports' stitch counts. Drag a color here to merge it into empty (its stitches become empty and it's removed from the palette)."
              className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm transition-colors ${
                activeColorIndex === EMPTY_CELL
                  ? "border-foreground bg-black/[.04] dark:bg-white/[.08]"
                  : "border-transparent hover:bg-black/[.04] dark:hover:bg-white/[.08]"
              }`}
            >
              <span
                className="h-5 w-5 shrink-0 rounded border border-zinc-400 bg-[repeating-conic-gradient(#9ca3af_0_25%,transparent_0_50%)] bg-[length:8px_8px] dark:border-zinc-600"
                aria-hidden
              />
              <span className="flex-1 text-zinc-500 dark:text-zinc-400">Empty (no stitch)</span>
            </div>
          )}

          {pattern &&
            [...pattern.palette]
              .sort((a, b) => b.count - a.count)
              .map((color) => (
                <div
                  key={color.index}
                  draggable
                  data-testid="legend-color-row"
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", String(color.index))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleLegendDrop(color.index)}
                  onClick={() => {
                    if (activeTool === "highlight") {
                      setHighlightedColorIndices((prev) => {
                        const next = new Set(prev);
                        if (next.has(color.index)) next.delete(color.index);
                        else next.add(color.index);
                        return next;
                      });
                    } else {
                      setActiveColorIndex(activeColorIndex === color.index ? null : color.index);
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm transition-colors ${
                    activeTool === "highlight"
                      ? highlightedColorIndices.has(color.index)
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-transparent hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                      : activeColorIndex === color.index
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
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSymbolIndex(editingSymbolIndex === color.index ? null : color.index);
                    }}
                    className={`w-5 shrink-0 rounded text-center hover:bg-black/[.08] dark:hover:bg-white/[.12] ${
                      editingSymbolIndex === color.index ? "bg-black/[.08] dark:bg-white/[.12]" : ""
                    }`}
                    title="Click to change this color's symbol"
                  >
                    {color.symbol}
                  </button>
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
                  <span className="shrink-0 text-xs text-zinc-500" title="Estimated floss needed, biased to overestimate -- see docs/domain-reference.md">
                    {color.count} sts · {formatSkeinEstimate(color.count, aidaCount)}
                  </span>
                </div>
              ))}

          {editingSymbolIndex !== null && pattern && (
            <div className="flex flex-col gap-2 rounded border border-zinc-300 p-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">
                Picking a symbol already used by another color swaps the two colors&apos; symbols.
              </p>
              <div className="grid grid-cols-10 gap-1">
                {SYMBOL_SET.map((symbol) => {
                  const holder = pattern.palette.find((c) => c.symbol === symbol);
                  const isCurrent = holder?.index === editingSymbolIndex;
                  return (
                    <button
                      key={symbol}
                      type="button"
                      onClick={() => pickSymbol(symbol)}
                      title={holder && !isCurrent ? `Swap with ${holder.name}` : undefined}
                      className={`flex h-7 w-7 items-center justify-center rounded border text-sm ${
                        isCurrent
                          ? "border-foreground bg-black/[.08] dark:bg-white/[.12]"
                          : holder
                            ? "border-dashed border-zinc-400 dark:border-zinc-600"
                            : "border-zinc-300 hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
                      }`}
                    >
                      {symbol}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setEditingSymbolIndex(null)}
                className="self-start rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium dark:border-zinc-700"
              >
                Close
              </button>
            </div>
          )}

          {editingColorIndex !== null && (
            <div className="flex flex-col gap-2 rounded border border-zinc-300 p-3 dark:border-zinc-700">
              {pattern?.dmcMode ? (
                <p className="text-xs text-zinc-500">This pattern is in DMC mode -- pick a real DMC thread color.</p>
              ) : (
                <div className="flex items-center overflow-hidden self-start rounded border border-zinc-300 dark:border-zinc-700">
                  {(
                    [
                      { mode: "full" as const, label: "Full range" },
                      { mode: "dmc" as const, label: "DMC" },
                    ]
                  ).map(({ mode, label }) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setEditColorMode(mode)}
                      className={`px-2 py-0.5 text-sm transition-colors ${
                        editColorMode === mode ? "bg-foreground text-background" : "hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {editColorMode === "dmc" ? (
                <>
                  <input
                    type="text"
                    value={editDmcFilter}
                    onChange={(e) => setEditDmcFilter(e.target.value)}
                    placeholder="Search by code or name…"
                    autoFocus
                    className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <div className="grid max-h-64 grid-cols-10 gap-1 overflow-y-auto">
                    {filteredEditDmcColors.map((dmc) => (
                      <button
                        key={dmc.code}
                        type="button"
                        onClick={() => commitEditDmcColor(dmc.code)}
                        title={`${dmc.code} - ${dmc.name}`}
                        style={{ backgroundColor: rgbToHex(dmc.rgb) }}
                        className="h-7 w-7 shrink-0 rounded border border-zinc-400 dark:border-zinc-600"
                      />
                    ))}
                    {filteredEditDmcColors.length === 0 && (
                      <p className="col-span-10 text-xs text-zinc-500">No DMC colors match that search.</p>
                    )}
                  </div>
                </>
              ) : (
                <HexColorPicker color={editingDraftHex} onChange={setEditingDraftHex} />
              )}

              <div className="flex gap-2">
                {editColorMode === "full" && (
                  <button type="button" onClick={commitColorEdit} className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background">
                    Done
                  </button>
                )}
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

          {addingColor && pattern?.dmcMode && (
            <div className="flex flex-col gap-2 rounded border border-zinc-300 p-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">This pattern is in DMC mode -- pick a real DMC thread color.</p>
              <input
                type="text"
                value={addDmcFilter}
                onChange={(e) => setAddDmcFilter(e.target.value)}
                placeholder="Search by code or name…"
                autoFocus
                className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="grid max-h-64 grid-cols-10 gap-1 overflow-y-auto">
                {filteredDmcColors.map((dmc) => (
                  <button
                    key={dmc.code}
                    type="button"
                    onClick={() => commitAddDmcColor(dmc.code)}
                    title={`${dmc.code} - ${dmc.name}`}
                    style={{ backgroundColor: rgbToHex(dmc.rgb) }}
                    className="h-7 w-7 shrink-0 rounded border border-zinc-400 dark:border-zinc-600"
                  />
                ))}
                {filteredDmcColors.length === 0 && <p className="col-span-10 text-xs text-zinc-500">No DMC colors match that search.</p>}
              </div>
              <button
                type="button"
                onClick={() => setAddingColor(false)}
                className="self-start rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium dark:border-zinc-700"
              >
                Cancel
              </button>
            </div>
          )}

          {addingColor && !pattern?.dmcMode && (
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
    </div>
  );
}
