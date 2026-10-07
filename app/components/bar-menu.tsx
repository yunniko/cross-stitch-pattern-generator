"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A button on the quick bar that opens a small panel of controls under it (G-118): a compact option's choices, or More.
 * The panel is drawn over the page, not inside the bar, which scrolls and would cut it off.
 *
 * It is a non-modal dialog: on opening, the focus goes to the panel's first control; Escape, a press outside, or the focus
 * leaving the panel closes it, and Escape gives the focus back to the button. `close` is handed to the panel's content so a
 * choice can close it.
 */

const MARGIN = 8;

export interface BarMenuProps {
  /** The button's accessible name, and the panel's. */
  label: string;
  title?: string;
  /** What the button shows. */
  trigger: ReactNode;
  testId?: string;
  children: (close: () => void) => ReactNode;
}

export function BarMenu({ label, title, trigger, testId, children }: BarMenuProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const id = useId();
  // Escape and a choice hand the focus back to the button; a press elsewhere leaves it where it went.
  const [refocus, setRefocus] = useState(false);

  const close = (giveBack: boolean) => {
    setOpen(false);
    setAt(null);
    setRefocus(giveBack);
  };

  useEffect(() => {
    if (open || !refocus) return;
    button.current?.focus();
  }, [open, refocus]);

  // Placed under the button, kept inside the window.
  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return;
    const b = button.current.getBoundingClientRect();
    const width = panel.current.offsetWidth;
    const left = Math.max(MARGIN, Math.min(b.left, window.innerWidth - width - MARGIN));
    setAt({ left, top: b.bottom + 4 });
  }, [open]);

  useEffect(() => {
    if (!open || !at) return;
    panel.current?.querySelector<HTMLElement>("button:not([disabled]), select, input")?.focus();
  }, [open, at]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close(false);
    };
    const away = () => close(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", away);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={title ?? label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-testid={testId}
        onClick={() => {
          if (open) return close(false);
          setRefocus(false);
          setOpen(true);
        }}
        className={`flex h-7 shrink-0 items-center gap-1 rounded-lg border px-1.5 text-xs transition-colors ${
          open ? "border-accent bg-raised text-ink" : "border-line text-muted hover:bg-raised hover:text-ink"
        }`}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={label}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close(true);
              }
            }}
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (next && !panel.current?.contains(next) && !button.current?.contains(next)) close(false);
            }}
            style={{ left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? "visible" : "hidden" }}
            className="fixed z-50 flex max-w-[calc(100vw-16px)] flex-col gap-2 rounded-lg border border-line bg-surface p-2 shadow-lg"
          >
            {children(() => close(true))}
          </div>,
          document.body
        )}
    </>
  );
}
