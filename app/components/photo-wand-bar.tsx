"use client";

import { PillButton } from "./ui";
import { PinnedEnd } from "./pinned-end";

export interface PhotoWandBarProps {
  hasSelection: boolean;
  busy: boolean;
  onDelete: () => void;
  onInvert: () => void;
  onDeselect: () => void;
}

/**
 * What the Photo wand does with what it selected (G-124): Delete takes the pixels out of the photo with hard edges (Owner,
 * 2026-10-07), Invert turns the selection inside out, Deselect lets it go. Pinned to the bar's end, as Crop's Apply is.
 */
export function PhotoWandBar({ hasSelection, busy, onDelete, onInvert, onDeselect }: PhotoWandBarProps) {
  return (
    <PinnedEnd>
      <PillButton size="xs" onClick={onInvert} disabled={busy} title="Select everything that is not selected, or the whole photo">
        Invert
      </PillButton>
      <PillButton size="xs" onClick={onDeselect} disabled={!hasSelection || busy} title="Let the selection go (Escape)">
        Deselect
      </PillButton>
      <PillButton
        size="xs"
        variant="primary"
        onClick={onDelete}
        disabled={!hasSelection || busy}
        title="Take the selected pixels out of the photo (Delete). Undo puts them back"
      >
        {busy ? "Working…" : "Delete"}
      </PillButton>
    </PinnedEnd>
  );
}
