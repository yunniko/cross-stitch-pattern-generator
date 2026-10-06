import { ZOOM_STEP } from "../hooks/use-pan-zoom";
import { PanIcon, ZoomIcon } from "./icons";
import { ZOOM_DIRECTION } from "./options";
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
      feature: null,
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
      title: "Click to zoom the way chosen, right-click or Shift-click the other way (Z); the wheel always zooms too",
      key: "z",
      group: 2,
      Icon: ZoomIcon,
      navigation: true,
      feature: null,
      cursor: "zoom",
      options: [ZOOM_DIRECTION],
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    return {
      onPointerDown: (e) => {
        // A right press, and Shift or Alt with a press, each turn the chosen way round; both together turn it back (D324).
        const turned = (e.button === 2) !== (e.shiftKey === true || e.altKey === true);
        const zoomIn = (api.option(ZOOM_DIRECTION) === "in") !== turned;
        api.view.zoomBy(zoomIn ? ZOOM_STEP : 1 / ZOOM_STEP, { clientX: e.clientX, clientY: e.clientY });
      },
    };
  },
} as const satisfies ToolModule;
