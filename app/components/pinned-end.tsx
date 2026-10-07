"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The quick bar's end (G-118): the controls that commit what the tool holds — Apply here and Cancel, Crop's pair, the
 * backstitch edit's Deselect. They are drawn beside the scrolling options rather than over them, so an option is never
 * hidden underneath (it was, while they were pinned inside the track with `sticky`). A tool's own controls stay one
 * piece of JSX; only this part is carried to the slot the bar keeps for it.
 */

const PinnedSlot = createContext<HTMLElement | null>(null);

export const PinnedSlotProvider = PinnedSlot.Provider;

const CLASS = "flex shrink-0 items-center gap-1.5";

export function PinnedEnd({ children, testId }: { children: ReactNode; testId?: string }) {
  const slot = useContext(PinnedSlot);
  const content = (
    <div className={CLASS} data-testid={testId}>
      {children}
    </div>
  );
  // Before the bar has its slot (the first render), or anywhere outside the bar, it is drawn where it stands.
  return slot ? createPortal(content, slot) : content;
}
