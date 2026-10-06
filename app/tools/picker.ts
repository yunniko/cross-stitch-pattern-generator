import { colorAt } from "@/lib/editor/pick-color";
import { preciseCornerFromEvent } from "../editor-geometry";
import { PickerIcon } from "./icons";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";

/**
 * The colour picker (G-104): a press takes the colour under the pointer into the square that button paints with, and
 * changes nothing else. Holding Alt lends it to a drawing tool (D318), so it is also the tool of `tools.pick-held`.
 */
export const pickerModule = {
  definitions: [
    {
      id: "picker",
      label: "Color picker",
      title: "Click a stitch or a backstitch line to take its color (I); right-click takes it as the second color. With a drawing tool, hold Alt to pick without changing tools.",
      key: "i",
      group: 0,
      shares: ["colours"],
      Icon: PickerIcon,
      cursor: "pick",
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    return {
      onPointerDown: (e, frame) => {
        const { pattern } = api;
        if (!pattern) return;
        const at = preciseCornerFromEvent(e, frame, api.cellSize, pattern.width, pattern.height);
        api.takeColor(colorAt(pattern, at.x, at.y), e.button);
      },
    };
  },
} as const satisfies ToolModule;
