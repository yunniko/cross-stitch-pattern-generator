import { useRef } from "react";
import { borrow, giveBack, type Borrowed } from "@/lib/editor/held-tool";
import { TOOL_DEFINITIONS, type Tool } from "../tools/registry";
import { useLatest } from "./use-latest";

/** The tool Space borrows: the first that moves the view by dragging. */
export const PAN_TOOL = TOOL_DEFINITIONS.find((tool) => tool.cursor === "grab")!.id;

/**
 * A tool held on a key (G-104, D319; Space's Pan since G-098), by the rules in `lib/editor/held-tool.ts`. The tool that was
 * in hand is given back with none of a tool change's side effects, so what it held stays held.
 */
export function useHeldTool(activeTool: Tool, switchTool: (tool: Tool) => void, restoreTool: (tool: Tool) => void) {
  const borrowed = useRef<Borrowed<Tool> | null>(null);
  const inHand = useLatest(activeTool);
  return {
    hold: (key: string, tool: Tool) => {
      if (borrowed.current !== null) return;
      borrowed.current = borrow(null, key, tool, inHand.current);
      switchTool(tool);
    },
    /** True when this key was holding a tool. */
    release: (key: string): boolean => {
      const result = giveBack(borrowed.current, key, inHand.current);
      borrowed.current = result.borrowed;
      if (result.restore !== null) restoreTool(result.restore);
      return result.wasHolding;
    },
  };
}
