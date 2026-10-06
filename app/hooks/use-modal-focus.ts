import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]';

/**
 * The focus of a dialog that stands over the editor: it starts on the control named by `first`, Tab goes round inside the
 * dialog and never reaches the page behind, Escape is the way out, and the focus returns to where it was when the dialog
 * goes. Found missing by the G-095 QA pass: Tab walked out of Preferences into the bar behind it.
 */
export function useModalFocus(panelRef: RefObject<HTMLElement | null>, first: string, onEscape: () => void): void {
  // The handler of the latest render, so that a new one does not move the focus again.
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(first)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // A dialog open inside (a colour picker) takes the press; the next one closes this.
        if (!panel?.querySelector('[role="dialog"]')) escape.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const stops = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (stops.length === 0) return;
      const at = stops.indexOf(document.activeElement as HTMLElement);
      // From the last stop on to the first, from the first back to the last, and in from anywhere outside.
      if (at === -1 || (e.shiftKey ? at === 0 : at === stops.length - 1)) {
        e.preventDefault();
        stops[e.shiftKey ? stops.length - 1 : 0].focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Only if what had the focus is still there to take it.
      if (before?.isConnected) before.focus();
    };
  }, [panelRef, first]);
}
