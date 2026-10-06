import { useMemo, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { ONE_STITCH_STAMP, stampOutline, type StampEdge } from "@/lib/editor/brush-stamp";
import { stampForPress } from "@/lib/editor/shape-raster";
import type { Command, CommandDefinition } from "@/lib/editor/commands";
import type { BackstitchLine, FloatingSelection } from "@/lib/types";
import { firstTools, toolOffered, type Workspace } from "@/lib/editor/workspaces";
import { moduleIndexOf, TOOL_DEFINITIONS, TOOL_MODULES, toolDefinition, type Tool } from "./registry";
import { SHAPE_FILL, type ToolOption } from "./options";
import type { EditorApi, PieceService, SharedOption, ToolModule, ToolRuntime, ToolShell } from "./types";
import { useFeatures } from "../features/features-context";
import { firstUsableTool, toolUsable } from "../features/registry";

/**
 * The editor shell's side of the tool registry (G-092, D284): which tool is in hand, and the routing of the pointer and the
 * keys to it. There is no per-tool code here; what a tool does is in its module, and what it is in its definition.
 */

/**
 * What the shell knows before the tools exist: everything in `EditorApi` but the tool in hand, which lives here, and the
 * workspace shown, which decides which tools are offered and has its own tool in hand (G-095, D297).
 */
export type ToolsInputs = Omit<EditorApi, "activeTool"> & { workspace: Workspace };

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
  /** A tool's own controls for what it holds, drawn after the options of the tool in hand. */
  quick: ReactNode;
  /** The shared drawing options the tool in hand reads. */
  shares: readonly SharedOption[];
  overlay: ReactNode;
  piece: PieceService;
  /** Takes a ready-made piece in hand, with a tool that can act on it. */
  takePiece: (piece: FloatingSelection) => void;
  highlightBackstitch: ((line: BackstitchLine) => boolean) | undefined;
  /** The options the tool in hand declares, in the order they are drawn (G-093). */
  options: readonly ToolOption[];
  /** The tab the tool in hand brings to the panel, or null for a tool without one (G-095). */
  tab: { label: string; pane: ReactNode } | null;
  /** Counts the times a tool was picked: what the panel reads to open a tool's tab afresh each time (G-095). */
  activation: number;
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
  const { workspace } = inputs;
  // One tool in hand for each workspace: changing workspace neither picks a tool up nor puts one down.
  const [inHand, setInHand] = useState<Record<Workspace, Tool>>(() => firstTools(TOOL_DEFINITIONS));
  // Under the feature switches (G-102): a tool that is not usable is never the one in hand, whatever was held before.
  const features = useFeatures();
  const usable = (tool: Tool) => toolUsable(features, tool);
  const held = inHand[workspace];
  const activeTool = usable(held) ? held : (firstUsableTool(features, workspace) ?? held);
  const setActiveTool = (tool: Tool) => setInHand((held) => ({ ...held, [workspace]: tool }));
  const [activation, setActivation] = useState(0);
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
    // A tool the workspace does not offer, or that is locked or hidden, cannot be picked up, by whatever road the request came.
    if (!toolOffered(next, workspace) || !usable(tool)) return;
    // Looked up afresh, not taken from the render: this function is handed to the tools, which must not hold the definition.
    const previous = toolDefinition(activeTool);
    for (const runtime of runtimes) runtime.onToolChange?.(previous, next);
    setActiveTool(tool);
    setActivation((count) => count + 1);
  }

  function takePiece(taken: FloatingSelection) {
    if (!toolDefinition(activeTool).piece) {
      const pieceTool = TOOL_DEFINITIONS.find((tool) => tool.piece);
      if (pieceTool) switchTool(pieceTool.id);
    }
    piece.insert(taken);
  }
  const shell: ToolShell = { takePiece };

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
      current.onPointerDown?.(e, frame, shell);
    },
    onPointerMove: (e) => void firstTaker((runtime) => runtime.onPointerMove?.(e)),
    onPointerUp: (e) => void firstTaker((runtime) => runtime.onPointerUp?.(e)),
    onDoubleClick: (e) => {
      const frame = inputs.frameRef.current;
      if (frame) current.onDoubleClick?.(e, frame);
    },
    commands,
    documentReplaced: () => runtimes.forEach((runtime) => runtime.onDocumentReplaced?.()),
    quick: runtimes.find((runtime) => runtime.quick)?.quick ?? null,
    shares: definition.shares ?? [],
    overlay: runtimes.find((runtime) => runtime.overlay)?.overlay ?? null,
    piece,
    takePiece,
    highlightBackstitch: runtimes.find((runtime) => runtime.highlightBackstitch)?.highlightBackstitch,
    options: definition.options ?? [],
    tab: definition.tab && current.panel ? { label: definition.tab.label, pane: current.panel(shell) } : null,
    activation,
    hoverOutline,
  };
}
