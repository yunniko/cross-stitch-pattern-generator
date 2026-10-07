import { PhotoWandBar } from "../components/photo-wand-bar";
import { WandIcon } from "./icons";
import { PHOTO_WAND_CONTIGUOUS, PHOTO_WAND_DIAGONAL, PHOTO_WAND_OPTIONS, PHOTO_WAND_SENSITIVITY, SELECTION_MODE } from "./options";
import { act } from "./shared";
import type { EditorApi, ToolModule, ToolRuntime } from "./types";

/**
 * The Photo wand (G-124): a press on the photo selects the colour pressed, in the touching area or across the whole photo,
 * replacing, joining or leaving the selection as Select's modes do; Delete takes the selected pixels out. The pixels and
 * the selection live with the photo (`use-photo-edits.ts`); this module turns presses, keys and options into calls on them.
 */
export const photoWandModule = {
  definitions: [
    {
      id: "photo-wand",
      label: "Photo wand",
      title:
        "Select a colour on the photo by pressing it (W): its touching area, or every pixel like it. Sensitivity sets how alike; Delete takes the selection out of the photo.",
      key: "w",
      group: 1,
      workspace: "photo",
      Icon: WandIcon,
      cursor: "cross",
      options: PHOTO_WAND_OPTIONS,
    },
  ],
  commands: [
    {
      id: "photo.delete",
      name: "Delete the selected part of the photo",
      group: "Photo",
      when: "Part of the photo selected",
      keys: ["Delete", "Backspace"],
    },
    {
      id: "photo.deselect",
      name: "Let the photo's selection go",
      group: "Photo",
      when: "Part of the photo selected",
      keys: ["Escape"],
    },
    {
      id: "photo.invert",
      name: "Invert the photo's selection",
      group: "Photo",
      when: "The photo on screen",
    },
  ],
  useRuntime(api: EditorApi): ToolRuntime {
    const photo = api.photo;
    const inHand = api.activeTool === "photo-wand" && photo.shown;
    const selected = photo.shown && photo.hasSelection && !photo.busy;
    const bar = inHand ? (
      <PhotoWandBar
        hasSelection={photo.hasSelection}
        busy={photo.busy}
        onDelete={photo.deleteSelected}
        onInvert={photo.invert}
        onDeselect={photo.deselect}
      />
    ) : undefined;
    return {
      commands: {
        "photo.delete": act(selected, photo.deleteSelected),
        "photo.deselect": act(selected, photo.deselect),
        "photo.invert": act(photo.shown && !photo.busy, photo.invert),
      },
      onPhotoPress: ({ x, y }) => {
        if (photo.busy) return;
        photo.wand(
          x,
          y,
          {
            tolerance: api.option(PHOTO_WAND_SENSITIVITY),
            contiguous: api.option(PHOTO_WAND_CONTIGUOUS) === "on",
            diagonal: api.option(PHOTO_WAND_DIAGONAL) === "on",
          },
          api.option(SELECTION_MODE)
        );
      },
      quick: bar,
      quickCompact: bar,
    };
  },
} as const satisfies ToolModule;
