import { useEffect, type RefObject } from "react";
import { useLatest } from "./use-latest";

/** Marks elements whose pointerdown retargets the panel instead of dismissing it (a legend row's color button). */
export const DISMISS_RETARGET_ATTRIBUTE = "data-dismiss-retarget";

export interface DismissOptions {
  /** Called on a pointerdown outside the panel. The event isn't stopped, so the click still acts (close and paint). */
  onOutsidePointer: () => void;
  /** Called on Escape anywhere while the panel is open. */
  onEscape: () => void;
}

/**
 * Light dismissal for a floating editor panel (G-033): a capture-phase pointerdown listener on the document, so it
 * runs before the target's own handlers, and an Escape listener. Pointers inside the panel, or on an element marked
 * with `DISMISS_RETARGET_ATTRIBUTE`, are ignored. Active only while `enabled`.
 */
export function useDismissOnOutsidePointer(panelRef: RefObject<HTMLElement | null>, enabled: boolean, options: DismissOptions) {
  const latest = useLatest(options);

  useEffect(() => {
    if (!enabled) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(`[${DISMISS_RETARGET_ATTRIBUTE}]`)) return;
      latest.current.onOutsidePointer();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") latest.current.onEscape();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, panelRef, latest]);
}
