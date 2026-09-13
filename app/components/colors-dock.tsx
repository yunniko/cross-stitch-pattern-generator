import { useMemo, useState, type DragEvent, type RefObject } from "react";
import { HexColorPicker } from "react-colorful";
import { hexToRgb, rgbToHex } from "@/lib/color/color";
import { SYMBOL_SET } from "@/lib/color/symbols";
import { addBrandColor, addColor, editColorRgb, editColorToBrandColor, renameColor, setColorSymbol } from "@/lib/editor/pattern-edit";
import { formatSkeinEstimate } from "@/lib/threads/floss-estimate";
import { THREAD_BRANDS, THREAD_BRAND_IDS, formatThreadName, type ThreadBrand, type ThreadColor } from "@/lib/threads/thread-brands";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";
import type { Tool } from "../editor-types";
import { PillButton, SegmentedControl } from "./ui";

/** Large enough to orient by, small enough to stay a glance; the canvas inside is true 1 px per stitch and scrolls if larger. */
const NAVIGATOR_MAX_SIZE_PX = 180;

const PANEL = "flex flex-col gap-2 rounded border border-zinc-300 p-3 dark:border-zinc-700";
const ROW_IDLE = "border-transparent hover:bg-black/[.04] dark:hover:bg-white/[.08]";
const ROW_ACTIVE = "border-foreground bg-black/[.04] dark:bg-white/[.08]";

/** A brand's thread line filtered by code or name substring, case-insensitive. */
function filterBrandColors(query: string, brand: ThreadBrand): readonly ThreadColor[] {
  const q = query.trim().toLowerCase();
  const colors = THREAD_BRANDS[brand].colors;
  if (!q) return colors;
  return colors.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
}

function BrandNotice({ brand }: { brand: ThreadBrand }) {
  const { label, derivationNote } = THREAD_BRANDS[brand];
  return (
    <p className="text-xs text-zinc-500">
      This pattern is in {label} mode -- pick a real {label} thread color.
      {derivationNote && ` (${derivationNote}.)`}
    </p>
  );
}

/** Searchable swatch grid of one brand's threads, shared by the color editor and "+ Add" (G-016, G-017). */
function BrandColorPicker({ brand, query, onQueryChange, onPick }: { brand: ThreadBrand; query: string; onQueryChange: (q: string) => void; onPick: (code: string) => void }) {
  const colors = useMemo(() => filterBrandColors(query, brand), [query, brand]);
  return (
    <>
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search by code or name…"
        autoFocus
        className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="grid max-h-64 grid-cols-10 gap-1 overflow-y-auto">
        {colors.map((thread) => (
          <button
            key={thread.code}
            type="button"
            onClick={() => onPick(thread.code)}
            title={formatThreadName(thread)}
            style={{ backgroundColor: rgbToHex(thread.rgb) }}
            className="h-7 w-7 shrink-0 rounded border border-zinc-400 dark:border-zinc-600"
          />
        ))}
        {colors.length === 0 && <p className="col-span-10 text-xs text-zinc-500">No colors match that search.</p>}
      </div>
    </>
  );
}

export interface ColorsDockProps {
  pattern: StitchPattern | null;
  navigatorCanvasRef: RefObject<HTMLCanvasElement | null>;
  activeTool: Tool;
  activeColorIndex: number | null;
  onActiveColorChange: (index: number | null) => void;
  highlightedColorIndices: ReadonlySet<number>;
  onToggleHighlight: (index: number) => void;
  aidaCount: number;
  /** Pushes an edited pattern as an undoable step. */
  onChange: (next: StitchPattern) => void;
  onMergeColors: (sourceIndex: number, targetIndex: number) => void;
}

/**
 * The right-hand dock: navigator, legend (select, highlight, drag to merge or fill, rename, re-symbol) and the color
 * editor and "+ Add" panels. Its editing state stays mounted across document changes, as it did inside the workspace.
 */
export function ColorsDock({ pattern, navigatorCanvasRef, activeTool, activeColorIndex, onActiveColorChange, highlightedColorIndices, onToggleHighlight, aidaCount, onChange, onMergeColors }: ColorsDockProps) {
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [editingDraftHex, setEditingDraftHex] = useState("#000000");
  // "Full range" or one brand for the editor; a brand-matched pattern is locked to its own brand (G-017, D92).
  const [editColorMode, setEditColorMode] = useState<"full" | ThreadBrand>("full");
  const [editBrandQuery, setEditBrandQuery] = useState("");
  const [addingColor, setAddingColor] = useState(false);
  const [addColorDraftHex, setAddColorDraftHex] = useState("#808080");
  const [addBrandQuery, setAddBrandQuery] = useState("");
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingSymbolIndex, setEditingSymbolIndex] = useState<number | null>(null);

  function dropOnto(targetIndex: number) {
    return (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("text/plain");
      if (raw !== "") onMergeColors(Number(raw), targetIndex);
    };
  }

  function openColorEditor(index: number) {
    if (!pattern) return;
    setEditingColorIndex(index);
    setEditingDraftHex(rgbToHex(pattern.palette[index].rgb));
    setEditColorMode(pattern.threadBrand ?? "full");
    setEditBrandQuery("");
  }

  function commitEditToBrandColor(code: string) {
    if (editingColorIndex === null || !pattern || editColorMode === "full") return;
    onChange(editColorToBrandColor(pattern, editingColorIndex, code, editColorMode));
    setEditingColorIndex(null);
  }

  function commitColorEdit() {
    if (editingColorIndex === null || !pattern) return;
    onChange(editColorRgb(pattern, editingColorIndex, hexToRgb(editingDraftHex)));
    setEditingColorIndex(null);
  }

  function commitAddColor() {
    if (!pattern) return;
    onChange(addColor(pattern, hexToRgb(addColorDraftHex)));
    setAddingColor(false);
  }

  function commitAddBrandColor(code: string) {
    if (!pattern?.threadBrand) return;
    onChange(addBrandColor(pattern, code, pattern.threadBrand));
    setAddingColor(false);
    setAddBrandQuery("");
  }

  function commitRename() {
    if (renamingIndex !== null && pattern) onChange(renameColor(pattern, renamingIndex, renameDraft));
    setRenamingIndex(null);
  }

  function pickSymbol(symbol: string) {
    if (editingSymbolIndex === null || !pattern) return;
    onChange(setColorSymbol(pattern, editingSymbolIndex, symbol));
    setEditingSymbolIndex(null);
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto border-l border-zinc-300 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      {pattern && (
        <div className="flex flex-col gap-1 border-b border-zinc-300 pb-2 dark:border-zinc-800">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Navigator</span>
          <div className="overflow-auto rounded border border-zinc-300 dark:border-zinc-700" style={{ maxWidth: NAVIGATOR_MAX_SIZE_PX, maxHeight: NAVIGATOR_MAX_SIZE_PX }}>
            <canvas ref={navigatorCanvasRef} style={{ imageRendering: "pixelated" }} className="block" />
          </div>
          <p className="text-[11px] text-zinc-500">
            {pattern.width} × {pattern.height} px, true scale
          </p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Colors</span>
        <PillButton
          size="xs"
          onClick={() => {
            setAddColorDraftHex("#808080");
            setAddBrandQuery("");
            setAddingColor(true);
          }}
          disabled={!pattern}
        >
          + Add
        </PillButton>
      </div>
      <p className="text-xs text-zinc-500">
        Drag a color onto another to merge them. Drag a color onto the picture to fill that region. Click a color to select it (Brush), then click or drag
        across the picture to paint. Double-click a name to rename it.
      </p>

      {pattern && (
        <div
          draggable
          onDragStart={(e) => e.dataTransfer.setData("text/plain", String(EMPTY_CELL))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={dropOnto(EMPTY_CELL)}
          onClick={() => onActiveColorChange(activeColorIndex === EMPTY_CELL ? null : EMPTY_CELL)}
          title="No stitch -- marks cells that shouldn't be stitched at all. Never appears in the legend or exports' stitch counts. Drag a color here to merge it into empty (its stitches become empty and it's removed from the palette)."
          className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm transition-colors ${activeColorIndex === EMPTY_CELL ? ROW_ACTIVE : ROW_IDLE}`}
        >
          <span
            className="h-5 w-5 shrink-0 rounded border border-zinc-400 bg-[repeating-conic-gradient(#9ca3af_0_25%,transparent_0_50%)] bg-[length:8px_8px] dark:border-zinc-600"
            aria-hidden
          />
          <span className="flex-1 text-zinc-500 dark:text-zinc-400">Empty (no stitch)</span>
        </div>
      )}

      {pattern &&
        [...pattern.palette]
          .sort((a, b) => b.count - a.count)
          .map((color) => {
            const rowState =
              activeTool === "highlight"
                ? highlightedColorIndices.has(color.index)
                  ? "border-amber-500 bg-amber-500/10"
                  : ROW_IDLE
                : activeColorIndex === color.index
                  ? ROW_ACTIVE
                  : ROW_IDLE;
            return (
              <div
                key={color.index}
                draggable
                data-testid="legend-color-row"
                onDragStart={(e) => e.dataTransfer.setData("text/plain", String(color.index))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={dropOnto(color.index)}
                onClick={() => (activeTool === "highlight" ? onToggleHighlight(color.index) : onActiveColorChange(activeColorIndex === color.index ? null : color.index))}
                className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm transition-colors ${rowState}`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openColorEditor(color.index);
                  }}
                  style={{ backgroundColor: rgbToHex(color.rgb) }}
                  className="h-5 w-5 shrink-0 rounded border border-zinc-400 dark:border-zinc-600"
                  aria-label={`Edit ${color.name}`}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingSymbolIndex(editingSymbolIndex === color.index ? null : color.index);
                  }}
                  className={`w-5 shrink-0 rounded text-center hover:bg-black/[.08] dark:hover:bg-white/[.12] ${editingSymbolIndex === color.index ? "bg-black/[.08] dark:bg-white/[.12]" : ""}`}
                  title="Click to change this color's symbol"
                >
                  {color.symbol}
                </button>
                {renamingIndex === color.index ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setRenamingIndex(null);
                    }}
                    className="w-0 min-w-0 flex-1 rounded border border-zinc-400 bg-transparent px-1 dark:border-zinc-600"
                  />
                ) : (
                  <span
                    className="flex-1 truncate"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenameDraft(color.name);
                      setRenamingIndex(color.index);
                    }}
                    title="Double-click to rename"
                  >
                    {color.name}
                  </span>
                )}
                <span className="shrink-0 text-xs text-zinc-500" title="Estimated floss needed, biased to overestimate -- see docs/domain-reference.md">
                  {color.count} sts · {formatSkeinEstimate(color.count, aidaCount)}
                </span>
              </div>
            );
          })}

      {editingSymbolIndex !== null && pattern && (
        <div className={PANEL}>
          <p className="text-xs text-zinc-500">Picking a symbol already used by another color swaps the two colors&apos; symbols.</p>
          <div className="grid grid-cols-10 gap-1">
            {SYMBOL_SET.map((symbol) => {
              const holder = pattern.palette.find((c) => c.symbol === symbol);
              const isCurrent = holder?.index === editingSymbolIndex;
              return (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => pickSymbol(symbol)}
                  title={holder && !isCurrent ? `Swap with ${holder.name}` : undefined}
                  className={`flex h-7 w-7 items-center justify-center rounded border text-sm ${
                    isCurrent
                      ? "border-foreground bg-black/[.08] dark:bg-white/[.12]"
                      : holder
                        ? "border-dashed border-zinc-400 dark:border-zinc-600"
                        : "border-zinc-300 hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
                  }`}
                >
                  {symbol}
                </button>
              );
            })}
          </div>
          <PillButton size="md" onClick={() => setEditingSymbolIndex(null)} className="self-start">
            Close
          </PillButton>
        </div>
      )}

      {editingColorIndex !== null && (
        <div className={PANEL}>
          {pattern?.threadBrand ? (
            <BrandNotice brand={pattern.threadBrand} />
          ) : (
            <SegmentedControl
              className="self-start"
              options={[{ value: "full" as const, label: "Full range" }, ...THREAD_BRAND_IDS.map((brand) => ({ value: brand, label: THREAD_BRANDS[brand].label }))]}
              value={editColorMode}
              onChange={setEditColorMode}
            />
          )}

          {editColorMode !== "full" ? (
            <BrandColorPicker brand={editColorMode} query={editBrandQuery} onQueryChange={setEditBrandQuery} onPick={commitEditToBrandColor} />
          ) : (
            <HexColorPicker color={editingDraftHex} onChange={setEditingDraftHex} />
          )}

          <div className="flex gap-2">
            {editColorMode === "full" && (
              <PillButton variant="primary" size="md" onClick={commitColorEdit}>
                Done
              </PillButton>
            )}
            <PillButton size="md" onClick={() => setEditingColorIndex(null)}>
              Cancel
            </PillButton>
          </div>
        </div>
      )}

      {addingColor && pattern?.threadBrand && (
        <div className={PANEL}>
          <BrandNotice brand={pattern.threadBrand} />
          <BrandColorPicker brand={pattern.threadBrand} query={addBrandQuery} onQueryChange={setAddBrandQuery} onPick={commitAddBrandColor} />
          <PillButton size="md" onClick={() => setAddingColor(false)} className="self-start">
            Cancel
          </PillButton>
        </div>
      )}

      {addingColor && !pattern?.threadBrand && (
        <div className={PANEL}>
          <HexColorPicker color={addColorDraftHex} onChange={setAddColorDraftHex} />
          <div className="flex gap-2">
            <PillButton variant="primary" size="md" onClick={commitAddColor}>
              Add
            </PillButton>
            <PillButton size="md" onClick={() => setAddingColor(false)}>
              Cancel
            </PillButton>
          </div>
        </div>
      )}
    </aside>
  );
}
