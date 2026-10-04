import { useMemo, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { ONE_STITCH_STAMP, stampOutline, type StampEdge } from "@/lib/editor/brush-stamp";
import { stampForPress } from "@/lib/editor/shape-raster";
import type { Command, CommandDefinition } from "@/lib/editor/commands";
import type { BackstitchLine, FloatingSelection } from "@/lib/types";
import { DEFAULT_TOOL, moduleIndexOf, TOOL_DEFINITIONS, TOOL_MODULES, toolDefinition, type Tool } from "./registry";
import { SHAPE_FILL, type ToolOption } from "./options";
import type { EditorApi, PieceService, ToolModule, ToolRuntime } from "./types";

/**
 * The editor shell's side of the tool registry (G-092, D284): which tool is in hand, and the routing of the pointer and the
 * keys to it. There is no per-tool code here; what a tool does is in its module, and what it is in its definition.
 */

/** What the shell knows before the tools exist: everything in `EditorApi` but the tool in hand, which lives here. */
export type ToolsInputs = Omit<EditorApi, "activeTool">;

const NO_PIECE: PieceService = {
  selection: null,
  isDragging: () => false,
  merge: () => {},
  clear: () => {},
  release: () => {},
  invalidateClipboard: () => {},
  insert: () => {},
};

export interface Tools {
  activeTool: Tool;
  /** Changes the tool in hand, telling every module so each can put down what it held. */
  switchTool: (tool: Tool) => void;
  /** Puts a tool in hand with no side effects: the way back from a temporary Pan. */
  restoreTool: (tool: Tool) => void;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (e: MouseEvent<HTMLDivElement>) => void;
  /** The commands the tool modules declare, with what each does now (G-093). Escape, Enter and Delete reach the tools as these. */
  commands: readonly Command[];
  /** Another chart has arrived. */
  documentReplaced: () => void;
  /** The tool's own controls, when it has any to show in place of the drawing options. */
  bar: ReactNode;
  overlay: ReactNode;
  piece: PieceService;
  /** Takes a ready-made piece in hand, with a tool that can act on it. */
  takePiece: (piece: FloatingSelection) => void;
  highlightBackstitch: ((line: BackstitchLine) => boolean) | undefined;
  /** The options the tool in hand declares, in the order they are drawn (G-093). */
  options: readonly ToolOption[];
  /** The outline the cursor carries for the tool in hand, or null when it paints nothing or nothing can be painted. */
  hoverOutline: readonly StampEdge[] | null;
}

/** One command a module declares, with what its runtime says it does now. */
function commandOf(definition: CommandDefinition, runtime: ToolRuntime): Command {
  const state = runtime.commands?.[definition.id];
  // A declared command with nothing behind it is a mistake in the module; say which, rather than list a dead command.
  if (!state) throw new Error(`The tool module that declares the command "${definition.id}" gives it nothing to run.`);
  return { ...definition, ...state };
}

export function useTools(inputs: ToolsInputs): Tools {
  const [activeTool, setActiveTool] = useState<Tool>(DEFAULT_TOOL);
  const api: EditorApi = { ...inputs, activeTool };

  // One hook per module, in the registry's order. The registry is a module constant, so the order never changes between
  // renders, which is all the rule against hooks in loops exists to guarantee.
  const runtimes: ToolRuntime[] = [];
  const commands: Command[] = [];
  for (const toolModule of TOOL_MODULES as readonly ToolModule[]) {
    const runtime = toolModule.useRuntime(api);
    runtimes.push(runtime);
    for (const definition of toolModule.commands ?? []) commands.push(commandOf(definition, runtime));
  }

  const definition = toolDefinition(activeTool);
  const current = runtimes[moduleIndexOf(activeTool)];
  const piece = runtimes.find((runtime) => runtime.piece)?.piece ?? NO_PIECE;

  function switchTool(tool: Tool) {
    const next = toolDefinition(tool);
    for (const runtime of runtimes) runtime.onToolChange?.(definition, next);
    setActiveTool(tool);
  }

  const { viewOnly, stamp } = inputs;
  const { stitchKind } = inputs.options;
  const shapeFill = inputs.option(SHAPE_FILL);
  const outlineKind = definition.outline;
  const laysStitches = definition.laysStitches === true;
  const hoverOutline = useMemo(() => {
    if (viewOnly || !outlineKind) return null;
    // The outline is the shape of the stitch in hand: a half stitch is outlined as its cell with the corners cut (G-082).
    const kind = laysStitches ? stitchKind : 0;
    if (outlineKind === "one") return stampOutline(ONE_STITCH_STAMP, kind);
    if (outlineKind === "brush") return stampOutline(stamp, kind);
    return stampOutline(stampForPress(shapeFill, stamp), kind);
  }, [viewOnly, outlineKind, laysStitches, stitchKind, stamp, shapeFill]);

  const firstTaker = (act: (runtime: ToolRuntime) => boolean | undefined) => runtimes.some((runtime) => act(runtime) === true);

  return {
    activeTool,
    switchTool,
    restoreTool: setActiveTool,
    onPointerDown: (e) => {
      const frame = inputs.frameRef.current;
      if (!frame || !inputs.pattern) return;
      // The looking-only views only show the chart: there, it pans and zooms but never edits (D121).
      if (viewOnly && !definition.navigation) return;
      current.onPointerDown?.(e, frame);
    },
    onPointerMove: (e) => void firstTaker((runtime) => runtime.onPointerMove?.(e)),
    onPointerUp: (e) => void firstTaker((runtime) => runtime.onPointerUp?.(e)),
    onDoubleClick: (e) => {
      const frame = inputs.frameRef.current;
      if (frame) current.onDoubleClick?.(e, frame);
    },
    commands,
    documentReplaced: () => runtimes.forEach((runtime) => runtime.onDocumentReplaced?.()),
    bar: runtimes.find((runtime) => runtime.bar)?.bar ?? null,
    overlay: runtimes.find((runtime) => runtime.overlay)?.overlay ?? null,
    piece,
    takePiece: (taken) => {
      if (!definition.piece) {
        const pieceTool = TOOL_DEFINITIONS.find((tool) => tool.piece);
        if (pieceTool) switchTool(pieceTool.id);
      }
      piece.insert(taken);
    },
    highlightBackstitch: runtimes.find((runtime) => runtime.highlightBackstitch)?.highlightBackstitch,
    options: definition.options ?? [],
    hoverOutline,
  };
}
