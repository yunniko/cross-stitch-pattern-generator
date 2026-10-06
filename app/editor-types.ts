import { toolDefinition, type Tool } from "./tools/registry";

/**
 * The tools are the registry's (`app/tools/registry.ts`, G-092): this type is every registered tool's id.
 *
 * Isolate is not a tool on purpose (G-045 M4): dimming the threads you are not working on is a way of *looking* at the
 * chart, not a thing you do to it, so it stays on while you paint with any of these.
 */
export type { Tool } from "./tools/registry";

/** The tools that hand over a piece in hand (G-072): what they hand over is the same selection with the same bar. */
export function isSelectTool(tool: Tool): boolean {
  return toolDefinition(tool).piece === true;
}

/** The tools that lay stitches down and so follow the Stitch type choice (G-082). */
export function usesStitchKind(tool: Tool): boolean {
  return toolDefinition(tool).laysStitches === true;
}

/** The tools the keyboard cell cursor can drive (G-080): the ones a press of the pen paints or draws with. */
export function isKeyboardCursorTool(tool: Tool): boolean {
  return toolDefinition(tool).keyboardCursor === true;
}
