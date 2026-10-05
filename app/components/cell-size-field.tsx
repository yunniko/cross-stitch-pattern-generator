"use client";

import { useState } from "react";
import { MAX_EXPORT_CELL_MM, MIN_EXPORT_CELL_MM, normalCellMm } from "@/lib/export/export-cell-size";

/**
 * The A4 pages' cell size in millimetres (G-083): typed freely, kept within the limits when it is left. Offered where
 * the A4 export is chosen and among the preferences; both are the one setting.
 */
export function CellSizeField({ value, onChange }: { value: number; onChange: (mm: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit(raw: string) {
    const mm = normalCellMm(Number(raw));
    if (raw.trim() !== "" && mm !== null) onChange(mm);
    setDraft(null);
  }
  return (
    <label
      className="flex min-h-8 items-center justify-between gap-3 text-[13px]"
      title="How big one stitch is printed on the A4 pages, in millimetres. The symbol and the lines grow with it. The full-size chart picture is not affected."
    >
      A4 cell size, mm
      <input
        type="number"
        aria-label="A4 cell size in millimetres"
        min={MIN_EXPORT_CELL_MM}
        max={MAX_EXPORT_CELL_MM}
        step={0.25}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
        className="w-20 rounded-md border border-line bg-sunken px-2 py-1 font-mono text-xs text-ink"
      />
    </label>
  );
}
