"use client";

import type { ReactNode } from "react";
import { rgbToHex } from "@/lib/color/color";
import { estimateSkeins, formatSkeinEstimate } from "@/lib/threads/floss-estimate";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";

/**
 * The Threads pane's list (G-045 M3, direction 1b): one row per colour, ordered by how much of the chart it covers.
 * A row carries its swatch, its symbol, its name over a bar showing its share, and its stitch and skein counts in the
 * mono face so the columns line up as they change.
 *
 * The bar is the row's share of the most-used colour rather than of the whole chart: at nine colours a share-of-total
 * bar is a row of stubs, while share-of-largest reads as the ranking it actually is.
 */

export interface ThreadRowsProps {
  pattern: StitchPattern;
  aidaCount: number;
  /** Which colour is selected for painting; the empty-stitch row uses `EMPTY_CELL`. */
  activeColorIndex: number | null;
  /** Called with the row's own index. The parent decides what activating a row means. */
  onRowActivate: (index: number) => void;
  /** A right click loads the background square instead, and leaves the brush holding what it holds (G-064). */
  onRowActivateBackground: (index: number) => void;
  onEditColor: (index: number) => void;
  onEditSymbol: (index: number) => void;
  editingSymbolIndex: number | null;
  editingColorIndex: number | null;
  onMergeColors: (sourceIndex: number, targetIndex: number) => void;
  /** Rendered after the swatch. M4 puts each thread's own light here. */
  renderLight?: (color: PaletteColor) => ReactNode;
  /** Dimmed while a floating selection is in hand, as 1b draws its select state. */
  dimmed?: boolean;
  /** Spread onto the swatch button, so a click on it does not dismiss the editor it opens. */
  swatchProps?: Record<string, string>;
  /** The same, for the symbol button: its picker opens under the row too (Owner, 2026-09-18). */
  symbolProps?: Record<string, string>;
  /** Rendered under a row, which is where the colour editor opens. */
  renderUnderRow?: (color: PaletteColor) => ReactNode;
  renameDraft: string;
  renamingIndex: number | null;
  onRenameDraftChange: (value: string) => void;
  onStartRename: (index: number, name: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}

/** "9 threads · 14 skeins", the header 1b puts above the list. */
export function threadsSummary(pattern: StitchPattern, aidaCount: number): string {
  const threads = pattern.palette.length;
  // `estimateSkeins` already returns whole skeins per colour (at least one), so the total is their plain sum.
  const skeins = pattern.palette.reduce((total, color) => total + estimateSkeins(color.count, aidaCount), 0);
  return `${threads} ${threads === 1 ? "thread" : "threads"} · ${skeins} ${skeins === 1 ? "skein" : "skeins"}`;
}

export function ThreadRows({
  pattern,
  aidaCount,
  activeColorIndex,
  onRowActivate,
  onRowActivateBackground,
  onEditColor,
  onEditSymbol,
  editingSymbolIndex,
  editingColorIndex,
  onMergeColors,
  renderLight,
  dimmed = false,
  swatchProps,
  symbolProps,
  renderUnderRow,
  renameDraft,
  renamingIndex,
  onRenameDraftChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
}: ThreadRowsProps) {
  const sorted = [...pattern.palette].sort((a, b) => b.count - a.count);
  const busiest = sorted[0]?.count ?? 0;

  function dropOnto(targetIndex: number) {
    return (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("text/plain");
      if (raw !== "") onMergeColors(Number(raw), targetIndex);
    };
  }

  return (
    <div className={`flex flex-col px-2 pb-2 ${dimmed ? "opacity-[.78]" : ""}`}>
      {sorted.map((color) => {
        const active = activeColorIndex === color.index;
        // A hairline of bar for a colour used once, so every thread still reads as present.
        const share = busiest > 0 ? Math.max(0.04, color.count / busiest) : 0;
        return (
          <div key={color.index}>
            <div
              draggable
              data-testid="legend-color-row"
              onDragStart={(e) => e.dataTransfer.setData("text/plain", String(color.index))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={dropOnto(color.index)}
              onClick={() => onRowActivate(color.index)}
              onContextMenu={(e) => {
                e.preventDefault(); // the row's own meaning for a right click, so no browser menu over it
                onRowActivateBackground(color.index);
              }}
              className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors ${
                active ? "bg-raised shadow-[inset_2px_0_0_var(--at-accent)]" : "hover:bg-raised"
              }`}
            >
              <button
                type="button"
                {...swatchProps}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditColor(color.index);
                }}
                style={{ backgroundColor: rgbToHex(color.rgb) }}
                className="h-5 w-5 shrink-0 rounded shadow-[inset_0_0_0_1px_rgba(232,236,239,.22)]"
                aria-label={`Edit ${color.name}`}
                aria-expanded={editingColorIndex === color.index}
              />
              <button
                type="button"
                {...symbolProps}
                aria-expanded={editingSymbolIndex === color.index}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditSymbol(color.index);
                }}
                className={`w-3.5 shrink-0 rounded text-center font-mono text-xs hover:bg-raised ${
                  editingSymbolIndex === color.index ? "bg-raised text-ink" : "text-muted"
                }`}
                title="Click to change this color's symbol"
              >
                {color.symbol}
              </button>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                {renamingIndex === color.index ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => onRenameDraftChange(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={onCommitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") onCancelRename();
                    }}
                    className="w-full min-w-0 rounded border border-line bg-sunken px-1 text-[13px]"
                  />
                ) : (
                  <span
                    className="truncate text-[13px]"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onStartRename(color.index, color.name);
                    }}
                    title="Double-click to rename"
                  >
                    {color.name}
                  </span>
                )}
                <span aria-hidden className="block h-[3px] w-full rounded-sm bg-line">
                  <span className="block h-full rounded-sm bg-accent/70" style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-px font-mono text-[11px]">
                <span data-testid="legend-color-count" className="text-muted">
                  {color.count}
                </span>
                <span className="text-faint" title="Estimated floss needed, biased to overestimate -- see docs/domain-reference.md">
                  {formatSkeinEstimate(color.count, aidaCount)}
                </span>
              </span>
              {/* The light sits at the right-hand end of the row (Owner, 2026-09-18); 1b draws it beside the swatch. */}
              {renderLight?.(color)}
            </div>
            {renderUnderRow?.(color)}
          </div>
        );
      })}

      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/plain", String(EMPTY_CELL))}
        onDragOver={(e) => e.preventDefault()}
        onDrop={dropOnto(EMPTY_CELL)}
        onClick={() => onRowActivate(EMPTY_CELL)}
        onContextMenu={(e) => {
          e.preventDefault();
          onRowActivateBackground(EMPTY_CELL);
        }}
        title="No stitch -- marks cells that shouldn't be stitched at all. Never appears in the legend or exports' stitch counts. Drag a color here to merge it into empty (its stitches become empty and it's removed from the palette)."
        className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors ${
          activeColorIndex === EMPTY_CELL ? "bg-raised shadow-[inset_2px_0_0_var(--at-accent)]" : "hover:bg-raised"
        }`}
      >
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 rounded bg-[repeating-conic-gradient(rgba(232,236,239,.22)_0_25%,transparent_0_50%)] bg-[length:8px_8px] shadow-[inset_0_0_0_1px_rgba(232,236,239,.22)]"
        />
        <span className="flex-1 text-[13px] text-muted">Empty (no stitch)</span>
      </div>
    </div>
  );
}
