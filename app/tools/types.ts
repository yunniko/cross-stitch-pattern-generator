import type { FeatureDeclaration } from "@/lib/features/features";
import type { ActiveLayerInfo } from "@/lib/editor/tool-layer";
import type { ChartTransform } from "@/lib/document/layer-kinds";
import type { ComponentType, MouseEvent, PointerEvent, ReactNode, RefObject } from "react";
import type { StampOffset } from "@/lib/editor/brush-stamp";
import type { CommandDefinition, CommandState } from "@/lib/editor/commands";
import type { ShapeFill } from "@/lib/editor/shape-raster";
import type { OptionValue, ToolOptionSpec } from "@/lib/editor/tool-options";
import type { SymmetryAxes } from "@/lib/editor/symmetry";
import type { SelectionMode } from "@/lib/editor/selection-area";
import type { PhotoWandRule } from "@/lib/photo/photo-mask";
import type { SizeUnit } from "@/lib/export/finished-size";
import type { BackstitchLine, FloatingSelection, StitchPattern } from "@/lib/types";
import type { ChartRenderer } from "../hooks/use-chart-renderer";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import type { Workspace } from "@/lib/editor/workspaces";
import type { ToolOption } from "./options";

/**
 * The tool registry's contract (G-092, D284). A tool is a module: what it is called and how it is offered
 * (`ToolDefinition`), and what it does with the pointer and the keys (`ToolRuntime`), built from the one thing it is
 * allowed to touch, the `EditorApi`. The shell (`use-tools.tsx`) routes events to the tool in hand and has no per-tool code.
 *
 * A module may offer several tools that share one gesture and one state: Line, Rectangle and Oval are one module, as are
 * Select, Lasso and Magic wand, whose piece in hand survives swapping between them.
 */

export interface ToolDefinition {
  /** The identity a chart's code and the crash report name the tool by. */
  id: string;
  label: string;
  /** The longer explanation, with the key where there is one. */
  title: string;
  /** The key that chooses it, lower case; none for a tool chosen only from the list. */
  key?: string;
  /** Where it sits in the list: 0 the tools that lay stitches and lines, 1 the ones that take a piece, 2 the ways of moving about. */
  group: 0 | 1 | 2;
  /**
   * The feature switch it is under (G-102). Left out, the tool is a feature of its own, `tool.<id>`; `null` is core, never
   * switched (Pan, Zoom); a string names another tool's feature it belongs to.
   */
  feature?: FeatureDeclaration;
  /** The workspace that offers it (G-095, D297); Edit when it names none. A tool that only moves the view is offered in all three. */
  workspace?: Workspace;
  /**
   * The drawing options every tool shares that this one reads, shown with it and with no tool that ignores them (G-095):
   * the two drawing colours, the symmetry axes, the transparency lock.
   */
  shares?: readonly SharedOption[];
  Icon: ComponentType;
  /**
   * Holding Alt with it in hand borrows the colour picker (G-104, D318): a tool that paints with the colour in hand. Zoom
   * does not carry it, so Alt with Zoom still zooms out.
   */
  heldPicker?: boolean;
  /** It lays stitches, so it follows the stitch type choice (G-082). */
  laysStitches?: boolean;
  /** The keyboard cell cursor can drive it (G-080). */
  keyboardCursor?: boolean;
  /** It hands over a piece in hand (G-072). */
  piece?: boolean;
  /** It moves the view, not the chart: it works in the looking-only views, and a tool suspended behind it keeps its state. */
  navigation?: boolean;
  /**
   * The kinds of layer it works on (G-130, D392); left out, any: it changes no layer, or every layer alike. On a kind it does
   * not name, the active layer is refused to it (`lib/editor/tool-layer.ts`).
   */
  layerKinds?: readonly string[];
  /** It changes the active layer's own stitches, so it is refused while that layer is hidden. */
  drawsOnLayer?: boolean;
  /** The outline the cursor carries: the brush's stamp, one stitch, or the stamp a press of this shape would make. */
  outline?: "brush" | "one" | "press";
  /** The options it offers, in the order they are drawn (G-093). Declared with the tool, drawn by the options area. */
  options?: readonly ToolOption[];
  /** The pointer over the chart: a hand, a magnifier, a dropper, always a cross; without it, a cross once a colour is in hand. */
  cursor?: "grab" | "zoom" | "pick" | "cross";
  /**
   * It brings a tab of its own to the panel (G-095, D296): the first tab, there only while the tool is in hand, for what
   * does not fit among the quick options. What the tab holds is the runtime's `panel`.
   */
  tab?: { label: string };
}

/** A drawing option that belongs to no one tool: each tool says which of them it reads. */
export type SharedOption = "colours" | "symmetry" | "lock";

/** The settings the Text tool keeps, under the names they have had among the saved settings since G-081. */
export type TextSettings = Pick<WorkspaceOptions, "textFamily" | "textStyle" | "textSize" | "textWeight">;
export type ChangeTextSetting = <K extends keyof TextSettings>(key: K, value: WorkspaceOptions[K]) => void;

/** What a tool may read and do. Narrow on purpose: this is all a tool, or later a plugin, can touch (D281). */
export interface EditorApi {
  frameRef: RefObject<HTMLDivElement | null>;
  rendererRef: RefObject<ChartRenderer | null>;
  /** The active layer's view: what a tool edits and hands back to `commit`. */
  pattern: StitchPattern | null;
  /** The chart as shown, every visible layer with the topmost stitch at each cell (G-130): what is looked at, never edited. */
  shown: StitchPattern | null;
  cellSize: number;
  /** The tool in hand. A module compares it only with its own tools' ids. */
  activeTool: string;
  /** The chart is only being looked at, in a looking-only view or outside the Edit workspace: nothing may change it. */
  viewOnly: boolean;
  /** The layer the tools work on: its name, kind and visibility (G-130); null while there is no chart. */
  activeLayer: ActiveLayerInfo | null;
  /** How many layers the chart has; 0 while there is no chart. */
  layerCount: number;
  /** The start screen covers the chart. */
  startingNew: boolean;
  /** Pushes one undoable step: `next` is the active layer's view (`pattern`), edited. */
  commit: (next: StitchPattern) => void;
  /**
   * Crops, expands or moves the whole chart, every layer of it, as one undoable step (G-130). `edited`, the active layer's
   * view as an edit left it, is written in first, in the same step: a crop to a piece puts the piece down, then crops.
   */
  transformChart: (transform: ChartTransform, edited?: StitchPattern) => void;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  /** The colour a press paints with: the foreground for the main button, the background for the other. */
  colorForPointer: (button: number) => number | null;
  /**
   * Takes a colour into the square a button paints with: the left button's foreground, the right button's background
   * (G-104). The empty stitch is taken as any colour is. The one way a tool changes the colours in hand.
   */
  takeColor: (index: number, button: number) => void;
  activeColorIndex: number | null;
  /** One press's footprint, from the brush size and shape. */
  stamp: readonly StampOffset[];
  symmetry: SymmetryAxes;
  options: {
    lockTransparency: boolean;
    stitchKind: 0 | 1 | 2;
    shapeFill: ShapeFill;
    aidaCount: number;
    sizeUnit: SizeUnit;
  };
  /** The value of an option, the tool's own or a shared one (G-093). */
  option: <V extends OptionValue>(option: ToolOptionSpec<V>) => V;
  view: {
    beginPan: (e: PointerEvent<HTMLDivElement>, frame: HTMLDivElement) => void;
    movePan: (e: PointerEvent<HTMLDivElement>) => boolean;
    endPan: (e: PointerEvent<HTMLDivElement>, frame: HTMLDivElement | null) => boolean;
    zoomBy: (factor: number, at?: { clientX: number; clientY: number }) => void;
    /** The stitch at the top left of the part of the chart in view; null with no chart on screen. */
    corner: () => { x: number; y: number } | null;
  };
  /** The lettering's settings, and the canvas colour its preview is drawn on. */
  text: TextSettings & { canvasColor: string; change: ChangeTextSetting };
  /** The photo in hand, for the tools of the Photo workspace (G-124). */
  photo: PhotoApi;
  /** Keeping a piece with the account as a stamp (G-119). */
  stamps: StampsApi;
}

/** Saving the piece in hand as a stamp (G-119): a name is asked for, then the stamp is kept with the person's account. */
export interface StampsApi {
  /** Null while the feature is hidden for this person: there is no control for it at all. */
  save: {
    run: (piece: FloatingSelection) => void;
    /** The note while the feature is locked for this person: the control is greyed and says so. */
    locked?: string;
    /** Stamps are kept with an account: signed out, the control is greyed and says to sign in. */
    signedIn: boolean;
    /** A save is on its way. */
    busy: boolean;
  } | null;
}

/** What a Photo tool may read and do to the photo in hand: its selection and the edits made of it (G-124). */
export interface PhotoApi {
  /** The photo itself is on screen, in Photo, to be pressed on. */
  shown: boolean;
  /** Part of the photo is selected. */
  hasSelection: boolean;
  /** An edit is being worked; presses wait for it. */
  busy: boolean;
  wand: (x: number, y: number, rule: PhotoWandRule, mode: SelectionMode) => void;
  deleteSelected: () => void;
  deselect: () => void;
  invert: () => void;
}

/**
 * What a tool may ask of the shell when something happens: it is handed over with the event, because it reaches the other
 * tools, which do not exist yet while a tool's own runtime is being built.
 */
export interface ToolShell {
  /**
   * Puts a ready-made piece in hand, with a tool in hand that can act on it. `chart` is the chart the piece's threads are
   * in when that is not the open one: a stamp's threads added to its palette (G-119), committed with the piece.
   */
  takePiece: (piece: FloatingSelection, chart?: StitchPattern) => void;
}

/** The piece in hand, which the Text tab, the quick mirrors and a colour merge also act on. */
export interface PieceService {
  selection: FloatingSelection | null;
  isDragging: () => boolean;
  /** Applies the piece where it sits. */
  merge: () => void;
  /** Drops it and the copied piece: another chart has arrived. */
  clear: () => void;
  /** Drops it without applying: an edit has already applied it. */
  release: () => void;
  /** Forgets the copied piece: the palette was renumbered under it. */
  invalidateClipboard: () => void;
  /** Puts a ready-made piece in hand, as Paste does; with `chart`, that chart is committed first (see `ToolShell.takePiece`). */
  insert: (piece: FloatingSelection, chart?: StitchPattern) => void;
}

export interface ToolRuntime {
  /** A press on the chart with one of this module's tools in hand. */
  onPointerDown?(e: PointerEvent<HTMLDivElement>, frame: HTMLDivElement, shell: ToolShell): void;
  /** True when the event belonged to a gesture of this module. Every module is asked, so a gesture outlives a tool change. */
  onPointerMove?(e: PointerEvent<HTMLDivElement>): boolean;
  onPointerUp?(e: PointerEvent<HTMLDivElement>): boolean;
  onDoubleClick?(e: MouseEvent<HTMLDivElement>, frame: HTMLDivElement): void;
  /** A press on the photo in Photo, at one of its pixels (G-124), with one of this module's tools in hand. */
  onPhotoPress?(pixel: { x: number; y: number }): void;
  /** What each command the module declares does now, by the command's id (G-093). Escape, Enter and Delete reach a tool this way. */
  commands?: Readonly<Record<string, CommandState>>;
  /** The tool in hand is changing; every module is told, whichever tool it owns. */
  onToolChange?(previous: ToolDefinition, next: ToolDefinition): void;
  /** Another chart has arrived. */
  onDocumentReplaced?(): void;
  /**
   * Its own controls for what it holds (the piece, the lines, the crop frame), drawn after its options. They add to the
   * bar and replace nothing in it: Undo, the views and the other tools' places stay where they are (G-095, D297).
   */
  quick?: ReactNode;
  /** The same controls in less room, for a quick bar that cannot fit `quick` whole (G-118, D340). */
  quickCompact?: ReactNode;
  /** What its tab holds, for a tool whose definition declares one. */
  panel?: (shell: ToolShell) => ReactNode;
  /** Drawn over the chart. */
  overlay?: ReactNode;
  /** The piece in hand, for the module that owns it. */
  piece?: PieceService;
  /** Which backstitch lines are in hand, for the renderer's thicker stroke. */
  highlightBackstitch?: (line: BackstitchLine) => boolean;
}

export interface ToolModule {
  definitions: readonly ToolDefinition[];
  /** The commands it adds for what it holds: their names, keys and conditions (G-093). What each does is in the runtime. */
  commands?: readonly CommandDefinition[];
  /** A hook: called once per render, in the registry's fixed order. */
  useRuntime(api: EditorApi): ToolRuntime;
}
