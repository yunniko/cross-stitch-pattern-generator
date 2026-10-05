import { useRef } from "react";
import { TOOL_DEFINITIONS, type Tool } from "../tools/registry";

/** The tool Space borrows: the first that moves the view by dragging. */
const PAN_TOOL = TOOL_DEFINITIONS.find((tool) => tool.cursor === "grab")!.id;

/**
 * Space held to pan (out of the workspace in G-098): the tool that drags the view is borrowed for as long as the key is
 * down, and the tool that was in hand is given back with none of a tool change's side effects, so what it held stays held.
 * A key repeat while held borrows nothing more.
 */
export function useHeldPan(activeTool: Tool, switchTool: (tool: Tool) => void, restoreTool: (tool: Tool) => void) {
  const putDown = useRef<Tool | null>(null);
  return {
    hold: () => {
      if (putDown.current !== null) return;
      putDown.current = activeTool;
      switchTool(PAN_TOOL);
    },
    release: () => {
      const back = putDown.current;
      putDown.current = null;
      if (back !== null) restoreTool(back);
    },
  };
}
