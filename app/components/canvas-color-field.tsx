"use client";

import { useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { DISMISS_RETARGET_ATTRIBUTE, useDismissOnOutsidePointer } from "../hooks/use-dismiss-on-outside-pointer";

/**
 * The canvas colour (G-079): a swatch that opens the same colour picker the thread colour editor uses (`react-colorful`),
 * with the hex beside it for typing or pasting. A pick applies right away, as the thread editor's does, and the picker
 * closes on Escape or a press outside it.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface CanvasColorFieldProps {
  value: string;
  onChange: (hex: string) => void;
}

export function CanvasColorField({ value, onChange }: CanvasColorFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissOnOutsidePointer(panelRef, open, { onOutsidePointer: () => setOpen(false), onEscape: () => setOpen(false) });

  function type(text: string) {
    const hex = text.startsWith("#") ? text : `#${text}`;
    setDraft(text);
    if (HEX.test(hex)) onChange(hex.toLowerCase());
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Canvas color"
        aria-expanded={open}
        // The press that opens or closes the picker is this button's own, not an outside press that would close it first.
        {...{ [DISMISS_RETARGET_ATTRIBUTE]: "" }}
        onClick={() => {
          setDraft(null);
          setOpen((wasOpen) => !wasOpen);
        }}
        style={{ backgroundColor: value }}
        className="h-6 w-9 cursor-pointer rounded-md border border-line"
      />
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Canvas color picker"
          className="absolute right-0 z-30 mt-2 flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 shadow-[0_12px_32px_rgba(0,0,0,.45)]"
        >
          <HexColorPicker color={value} onChange={(hex) => onChange(hex)} />
          <input
            type="text"
            aria-label="Canvas color hex"
            value={draft ?? value}
            onChange={(e) => type(e.target.value)}
            onBlur={() => setDraft(null)}
            spellCheck={false}
            maxLength={7}
            className="rounded-md border border-line bg-sunken px-2 py-1 font-mono text-xs text-ink"
          />
        </div>
      )}
    </div>
  );
}
