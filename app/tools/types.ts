import type { FeatureDeclaration } from "@/lib/features/features";
import type { ComponentType, DragEvent, MouseEvent, PointerEvent, ReactNode, RefObject } from "react";
import type { StampOffset } from "@/lib/editor/brush-stamp";
import type { CommandDefinition, CommandState } from "@/lib/editor/commands";
import type { ShapeFill } from "@/lib/editor/shape-raster";
import type { OptionValue, ToolOptionSpec } from "@/lib/editor/tool-options";
import type { SymmetryAxes } from "@/lib/editor/symmetry";
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
 * Select and Lasso, whose piece in hand survives swapping between the two.
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
  /** It lays stitches, so it follows the stitch type choice (G-082). */
  laysStitches?: boolean;
  /** The keyboard cell cursor can drive it (G-080). */
  keyboardCursor?: boolean;
  /** It hands over a piece in hand (G-072). */
  piece?: boolean;
  /** It moves the view, not the chart: it works in the looking-only views, and a tool suspended behind it keeps its state. */
  navigation?: boolean;
  /** The outline the cursor carries: the brush's stamp, one stitch, or the stamp a press of this shape would make. */
  outline?: "brush" | "one" | "press";
  /** The options it offers, in the order they are drawn (G-093). Declared with the tool, drawn by the options area. */
  options?: readonly ToolOption[];
  /** The pointer over the chart: a hand, a magnifier, always a cross; without it, a cross once a colour is in hand. */
  cursor?: "grab" | "zoom" | "cross";
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
  pattern: StitchPattern | null;
  cellSize: number;
  /** The tool in hand. A module compares it only with its own tools' ids. */
  activeTool: string;
  /** The chart is only being looked at, in a looking-only view or outside the Edit workspace: nothing may change it. */
  viewOnly: boolean;
  /** The start screen covers the chart. */
  startingNew: boolean;
  /** Pushes one undoable step. */
  commit: (next: StitchPattern) => void;
  /** Replaces the steps since `anchor` with one (the brush's double-press fill, D138). */
  replaceSince: (anchor: StitchPattern, since: readonly StitchPattern[], next: StitchPattern) => void;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  /** The colour a press paints with: the foreground for the main button, the background for the other. */
  colorForPointer: (button: number) => number | null;
  activeColorIndex: number | null;
  /** One press's footprint, from the brush size and shape. */
  stamp: readonly StampOffset[];
  symmetry: SymmetryAxes;
  options: {
    lockTransparency: boolean;
    stitchKind: 0 | 1 | 2;
    shapeFill: ShapeFill;
    doubleClickFill: boolean;
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
}

/**
 * What a tool may ask of the shell when something happens: it is handed over with the event, because it reaches the other
 * tools, which do not exist yet while a tool's own runtime is being built.
 */
export interface ToolShell {
  /** Puts a ready-made piece in hand, with a tool in hand that can act on it. */
  takePiece: (piece: FloatingSelection) => void;
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
  /** Puts a ready-made piece in hand, as Paste does. */
  insert: (piece: FloatingSelection) => void;
}

export interface ToolRuntime {
  /** A press on the chart with one of this module's tools in hand. */
  onPointerDown?(e: PointerEvent<HTMLDivElement>, frame: HTMLDivElement, shell: ToolShell): void;
  /** True when the event belonged to a gesture of this module. Every module is asked, so a gesture outlives a tool change. */
  onPointerMove?(e: PointerEvent<HTMLDivElement>): boolean;
  onPointerUp?(e: PointerEvent<HTMLDivElement>): boolean;
  onDoubleClick?(e: MouseEvent<HTMLDivElement>, frame: HTMLDivElement): void;
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

/** Re-exported for modules that take a dropped item; kept here so tools import their event types from one place. */
export type ChartDragEvent = DragEvent<HTMLDivElement>;
