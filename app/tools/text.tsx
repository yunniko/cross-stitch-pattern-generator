import { STITCH_KINDS } from "@/lib/editor/tool-layer";
import { useRef, useState } from "react";
import { letteringSelection, letteringStart } from "@/lib/editor/text-selection";
import type { LetteringBitmap } from "@/lib/editor/text-raster";
import { TextPane } from "../components/text-pane";
import { cellIndexFromEvent } from "../editor-geometry";
import { TextIcon } from "./icons";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";

/**
 * Text (G-081 as a tab; a tool since G-095, D296): one line of lettering turned into stitches. Everything it has is in the
 * tab it brings to the panel, which is the first tool to use that part of the contract.
 *
 * The lettering goes on the chart as a piece in hand, as a Paste does: by Add in the tab, at the corner of the part of
 * the chart in view, or by a press on the chart, with its top left corner at the stitch pressed. Either way the piece is
 * then Select's to move, turn and apply, so Text is put down and its tab goes with it.
 */

/** The lettering as the tab last drew it, and the thread it is in: what a press on the chart puts down. */
export interface ReadyLettering {
  bitmap: LetteringBitmap;
  colour: number;
}

export const textModule = {
  definitions: [
    {
      id: "text",
      layerKinds: STITCH_KINDS,
      drawsOnLayer: true,
      label: "Text",
      title: "Turn a line of text into stitches: set it up in the Text tab, then Add, or press on the chart where it should go",
      group: 0,
      Icon: TextIcon,
      cursor: "cross",
      tab: { label: "Text" },
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    // Kept here, not in the tab: the tab leaves the page while another is shown, and what was typed must not go with it.
    const [text, setText] = useState("");
    const [picked, setPicked] = useState<number | null>(null);
    const ready = useRef<ReadyLettering | null>(null);
    const { pattern } = api;

    return {
      onPointerDown: (e, frame, shell) => {
        const lettering = ready.current;
        if (!pattern || !lettering || lettering.colour >= pattern.palette.length) return;
        const { bitmap } = lettering;
        if (bitmap.width > pattern.width || bitmap.height > pattern.height) return;
        const cell = cellIndexFromEvent(e, frame, api.cellSize, pattern.width, pattern.height);
        if (cell === null) return;
        // Its corner at the stitch pressed, brought back inside the chart where it would overhang.
        const x = Math.min(cell % pattern.width, pattern.width - bitmap.width);
        const y = Math.min(Math.floor(cell / pattern.width), pattern.height - bitmap.height);
        shell.takePiece(letteringSelection(bitmap, lettering.colour, x, y));
      },
      // The thread picked for the text belonged to the chart that was open.
      onDocumentReplaced: () => setPicked(null),
      panel: (shell) => (
        <TextPane
          pattern={pattern}
          settings={api.text}
          onChange={api.text.change}
          activeColorIndex={api.activeColorIndex}
          text={text}
          onTextChange={setText}
          pickedColor={picked}
          onPickColor={setPicked}
          viewOnly={api.viewOnly}
          readyRef={ready}
          onAdd={(bitmap, colour) => {
            const corner = api.view.corner();
            if (!pattern || !corner) return;
            const at = letteringStart(null, corner, bitmap, pattern);
            shell.takePiece(letteringSelection(bitmap, colour, at.x, at.y));
          }}
        />
      ),
    };
  },
} as const satisfies ToolModule;
