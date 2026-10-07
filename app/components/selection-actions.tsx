import type { ReactNode } from "react";
import { GROUP_LABEL, PillButton } from "./ui";
import { PINNED_END } from "./panels";
import { SkinIcon } from "../skin/skin";
import type { InterfaceIconName } from "../skin/icons";

/**
 * What can be done to the selection, for Select, Lasso and the Magic wand alike (G-116, D333): declared once, drawn twice.
 * The top bar keeps the committing pair, Apply here and Cancel; the tool's Selection tab in the panel holds every action,
 * grouped by what it does (Owner, 2026-10-07: the bar had no room for them beside the wand's switches).
 */

export interface SelectionActionsProps {
  hasSelection: boolean;
  hasClipboard: boolean;
  /** Selects everything the selection leaves out; with nothing selected, the whole chart (G-116). */
  onInvert: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  /** Paints the selected area in the brush's colour (G-063). */
  onFill: () => void;
  /** False when the brush is holding no colour, which leaves nothing to fill with. */
  canFill: boolean;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onRotateClockwise: () => void;
  onRotateAnticlockwise: () => void;
  onCrop: () => void;
  onCancel: () => void;
  onDeselect: () => void;
}

interface Action {
  label: string;
  title: string;
  icon: InterfaceIconName;
  onClick: () => void;
  disabled: boolean;
}

/** The actions in their groups, in the order the tab draws them; the last group is the committing pair. */
function groups(p: SelectionActionsProps): ReadonlyArray<{ name: string; actions: readonly Action[] }> {
  const none = !p.hasSelection;
  return [
    {
      name: "Select",
      actions: [
        {
          label: "Invert selection",
          title: "Select everything the selection leaves out, backstitch included; with nothing selected, the whole chart",
          icon: "invert-selection",
          onClick: p.onInvert,
          disabled: false,
        },
      ],
    },
    {
      name: "Copy and paste",
      actions: [
        { label: "Copy", title: "Copy the selected piece", icon: "copy", onClick: p.onCopy, disabled: none },
        {
          label: "Paste",
          title: "Paste the copied piece as a new floating selection",
          icon: "paste",
          onClick: p.onPaste,
          disabled: !p.hasClipboard,
        },
        {
          label: "Duplicate",
          title: "Leave this piece where it is and take a copy of it in hand",
          icon: "duplicate",
          onClick: p.onDuplicate,
          disabled: none,
        },
      ],
    },
    {
      name: "Paint",
      actions: [
        // "Fill selection", not "Fill": the tool rail has a Fill of its own, and both are on screen at once.
        {
          label: "Fill selection",
          title: p.canFill
            ? "Paint the whole selected area in the brush's colour"
            : "Pick a thread in the list first — there is no colour to fill with",
          icon: "fill-piece",
          onClick: p.onFill,
          disabled: none || !p.canFill,
        },
      ],
    },
    {
      name: "Flip and turn",
      actions: [
        {
          label: "Flip horizontal",
          title: "Mirror the piece left to right",
          icon: "flip-horizontal",
          onClick: p.onFlipHorizontal,
          disabled: none,
        },
        {
          label: "Flip vertical",
          title: "Mirror the piece top to bottom",
          icon: "flip-vertical",
          onClick: p.onFlipVertical,
          disabled: none,
        },
        {
          label: "Rotate right",
          title: "Turn the piece a quarter turn clockwise",
          icon: "rotate-right",
          onClick: p.onRotateClockwise,
          disabled: none,
        },
        {
          label: "Rotate left",
          title: "Turn the piece a quarter turn anticlockwise",
          icon: "rotate-left",
          onClick: p.onRotateAnticlockwise,
          disabled: none,
        },
      ],
    },
    {
      name: "Chart",
      actions: [
        {
          label: "Crop to selection",
          title: "Cut the chart down to the box around the selection, discarding everything outside it",
          icon: "crop-to-piece",
          onClick: p.onCrop,
          disabled: none,
        },
      ],
    },
    {
      name: "Finish",
      actions: [
        // Apply here sits before Cancel, and the committing pair carry their names (Owner, 2026-09-18).
        {
          label: "Apply here",
          title: "Merge the piece into the picture where it sits — Enter",
          icon: "apply",
          onClick: p.onDeselect,
          disabled: none,
        },
        {
          label: "Cancel",
          title: "Put the chart back as it was when this selection started, discarding its changes — Escape",
          icon: "cancel",
          onClick: p.onCancel,
          disabled: none,
        },
      ],
    },
  ];
}

function ActionButton({ action, wide }: { action: Action; wide: boolean }): ReactNode {
  return (
    <PillButton
      aria-label={action.label}
      title={action.title}
      onClick={action.onClick}
      disabled={action.disabled}
      className={`flex items-center gap-1.5 px-2.5 whitespace-nowrap ${wide ? "justify-start" : ""}`}
    >
      <SkinIcon name={action.icon} />
      {action.label}
    </PillButton>
  );
}

/** The top bar's end: Apply here and Cancel, in view however narrow the window. */
export function SelectionFinish(props: SelectionActionsProps) {
  const finish = groups(props).at(-1)!;
  return (
    <div className={`ml-auto ${PINNED_END}`} data-testid="selection-bar">
      {finish.actions.map((action) => (
        <ActionButton key={action.label} action={action} wide={false} />
      ))}
    </div>
  );
}

/** The Selection tab: every action, in its group. */
export function SelectionPanel(props: SelectionActionsProps) {
  return (
    <div className="flex flex-col gap-5 p-4" data-testid="selection-panel">
      {groups(props).map(({ name, actions }) => (
        <section key={name} className="flex flex-col gap-2" aria-label={name}>
          <span className={GROUP_LABEL}>{name}</span>
          <div className="grid grid-cols-2 gap-1.5">
            {actions.map((action) => (
              <ActionButton key={action.label} action={action} wide />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
