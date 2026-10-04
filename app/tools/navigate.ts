import { ZOOM_STEP } from "../hooks/use-pan-zoom";
import { PanIcon, ZoomIcon } from "./icons";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";

/** Pan and Zoom: the two tools that move the view and never the chart, so they work in every view. */
export const panModule = {
  definitions: [
    {
      id: "pan",
      label: "Pan",
      title: "Drag to scroll the chart (H), or hold Space with any tool in hand",
      key: "h",
      group: 2,
      Icon: PanIcon,
      navigation: true,
      cursor: "grab",
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    return {
      onPointerDown: (e, frame) => api.view.beginPan(e, frame),
      onPointerMove: (e) => api.view.movePan(e),
      onPointerUp: (e) => api.view.endPan(e, api.frameRef.current),
    };
  },
} as const satisfies ToolModule;

export const zoomModule = {
  definitions: [
    {
      id: "zoom",
      label: "Zoom",
      title: "Click to zoom in, Shift-click to zoom out (Z); the wheel always zooms too",
      key: "z",
      group: 2,
      Icon: ZoomIcon,
      navigation: true,
      cursor: "zoom",
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    return {
      onPointerDown: (e) => api.view.zoomBy(e.shiftKey || e.altKey ? 1 / ZOOM_STEP : ZOOM_STEP, { clientX: e.clientX, clientY: e.clientY }),
    };
  },
} as const satisfies ToolModule;
