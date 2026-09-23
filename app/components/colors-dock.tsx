import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { hexToRgb, luminance, rgbToHex } from "@/lib/color/color";
import { swatchComparisonParts } from "@/lib/color/swatch-comparison";
import { SYMBOL_SET } from "@/lib/color/symbols";
import { addBrandColor, addColor, editColorRgb, editColorToBrandColor, renameColor, restoreColor, setColorSymbol } from "@/lib/editor/pattern-edit";
import { THREAD_BRANDS, THREAD_BRAND_IDS, formatThreadName, type ThreadBrand, type ThreadColor } from "@/lib/threads/thread-brands";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";
import { DISMISS_RETARGET_ATTRIBUTE, useDismissOnOutsidePointer } from "../hooks/use-dismiss-on-outside-pointer";
import { useLatest } from "../hooks/use-latest";
import { ThreadRows, threadsSummary } from "./threads-pane";
import { PillButton, SegmentedControl } from "./ui";

const PANEL = "flex flex-col gap-2 rounded-lg border border-line p-3";
const COMPARE_HINT = "Hover or focus a swatch to compare it with the current color on screen.";

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
    <p className="text-xs text-muted">
      This pattern is in {label} mode -- pick a real {label} thread color.
      {derivationNote && ` (${derivationNote}.)`}
    </p>
  );
}

interface BrandColorPickerProps {
  brand: ThreadBrand;
  query: string;
  onQueryChange: (q: string) => void;
  onPick: (code: string) => void;
  /** The edited color's thread in this brand: marked, and centred in the grid when shown (G-033). */
  currentCode?: string;
  /** The edited color's RGB as shown, compared with a hovered or focused swatch (G-033). */
  compareWith?: RGB;
}

/** Searchable swatch grid of one brand's threads, shared by the color editor and "+ Add" (G-016, G-017, G-033). */
function BrandColorPicker({ brand, query, onQueryChange, onPick, currentCode, compareWith }: BrandColorPickerProps) {
  const colors = useMemo(() => filterBrandColors(query, brand), [query, brand]);
  const gridRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [inspected, setInspected] = useState<ThreadColor | null>(null);
  const label = THREAD_BRANDS[brand].label;

  // Focus the search without scrolling the dock, then centre the current swatch inside the grid's own scroll area:
  // `scrollTop` on the grid, since scrollIntoView would also move the dock. Runs when the grid opens on a brand.
  useLayoutEffect(() => {
    searchRef.current?.focus({ preventScroll: true });
    const grid = gridRef.current;
    const current = grid?.querySelector<HTMLElement>('[data-current="true"]');
    if (grid && current) grid.scrollTop = current.offsetTop - grid.clientHeight / 2 + current.offsetHeight / 2;
    // Keyed on the brand only: re-centring after every pick would move the grid under the pointer.
  }, [brand]);

  return (
    <>
      <input
        ref={searchRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search by code or name…"
        aria-label={`Search ${label} threads`}
        className="rounded border border-line px-2 py-1 text-sm bg-sunken"
      />
      <div ref={gridRef} data-testid="swatch-grid" className="relative grid max-h-64 grid-cols-10 gap-1 overflow-y-auto p-1">
        {colors.map((thread) => {
          const threadLabel = `${label} ${formatThreadName(thread)}`;
          const isCurrent = currentCode !== undefined && thread.code === currentCode;
          return (
            <button
              key={thread.code}
              type="button"
              onClick={() => onPick(thread.code)}
              onPointerEnter={() => setInspected(thread)}
              onPointerLeave={() => setInspected((shown) => (shown === thread ? null : shown))}
              onFocus={() => setInspected(thread)}
              onBlur={() => setInspected((shown) => (shown === thread ? null : shown))}
              aria-label={threadLabel}
              aria-pressed={compareWith !== undefined ? isCurrent : undefined}
              data-current={isCurrent || undefined}
              style={{ backgroundColor: rgbToHex(thread.rgb) }}
              className={`relative h-7 w-7 shrink-0 rounded border ${isCurrent ? "border-accent ring-2 ring-accent ring-offset-1" : "border-line"}`}
            >
              {isCurrent && (
                <span aria-hidden className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: luminance(thread.rgb) > 140 ? "#000000" : "#ffffff" }}>
                  ✓
                </span>
              )}
            </button>
          );
        })}
        {colors.length === 0 && <p className="col-span-10 text-xs text-muted">No colors match that search.</p>}
      </div>
      {compareWith && (
        // A fixed line rather than a native tooltip: tooltips are delayed and never shown for keyboard focus (G-033).
        <p data-testid="swatch-comparison" aria-live="polite" className="min-h-[2.5em] text-xs text-muted">
          {inspected ? (
            // Real spaces between the parts, not a flex gap: the gap spaces them on screen but leaves the read-aloud
            // and copied text running together ("Dark7% lighter").
            swatchComparisonParts(formatThreadName(inspected), compareWith, inspected.rgb).map((part, i) =>
              i === 0 ? (
                <span key={part} className="font-medium text-ink">
                  {part}
                </span>
              ) : (
                <span key={part}>{` ${part}`}</span>
              )
            )
          ) : (
            <span>{COMPARE_HINT}</span>
          )}
        </p>
      )}
    </>
  );
}

/** The color editor's state (G-033). */
interface ColorEditorState {
  index: number;
  /** The color as it was when the editor opened, which Cancel restores. */
  initial: Pick<PaletteColor, "rgb" | "name" | "source">;
  mode: "full" | ThreadBrand;
  query: string;
  /** A Full range color being dragged, previewed but not yet committed. */
  draftHex: string | null;
  /** The editor closes when its color can no longer be the same one: the palette changed size, or the document changed. */
  paletteLength: number;
  documentId: number;
}

function sameAppearance(color: Pick<PaletteColor, "rgb" | "name" | "source">, other: Pick<PaletteColor, "rgb" | "name" | "source">): boolean {
  return (
    color.rgb.every((v, i) => v === other.rgb[i]) &&
    color.name === other.name &&
    color.source?.brand === other.source?.brand &&
    color.source?.code === other.source?.code
  );
}

export interface ColorsDockProps {
  pattern: StitchPattern | null;
  /** Dimmed while a floating selection is in hand, as 1b draws its select state. */
  dimmed?: boolean;
  activeColorIndex: number | null;
  onActiveColorChange: (index: number | null) => void;
  /** A right click on a thread loads the background square, without changing which square is active (G-064). */
  onBackgroundColorChange: (index: number) => void;
  /** The threads lit for Isolate. Lighting one is independent of which colour is selected for painting. */
  litColorIndices: ReadonlySet<number>;
  onToggleLit: (index: number) => void;
  aidaCount: number;
  /** Pushes an edited pattern as an undoable step. */
  onChange: (next: StitchPattern) => void;
  /** Shows (or clears) a draft of `base` on the chart without recording it. */
  onPreviewChange: (preview: { base: StitchPattern; next: StitchPattern } | null) => void;
  /** Changes when the palette is replaced wholesale; an open color editor closes. */
  documentId: number;
  onMergeColors: (sourceIndex: number, targetIndex: number) => void;
}

/**
 * The right-hand dock: navigator, legend (select, highlight, drag to merge or fill, rename, re-symbol) and the color
 * editor and "+ Add" panels. The color editor opens under its row on the color's own swatch; picks apply at once and
 * the editor stays open until Done, Cancel, Escape or a click outside it (G-033).
 */
export function ColorsDock({ pattern, dimmed = false, activeColorIndex, onActiveColorChange, onBackgroundColorChange, litColorIndices, onToggleLit, aidaCount, onChange, onPreviewChange, documentId, onMergeColors }: ColorsDockProps) {
  const [editor, setEditor] = useState<ColorEditorState | null>(null);
  const [addingColor, setAddingColor] = useState(false);
  const [addColorDraftHex, setAddColorDraftHex] = useState("#808080");
  const [addBrandQuery, setAddBrandQuery] = useState("");
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingSymbolIndex, setEditingSymbolIndex] = useState<number | null>(null);
  const editorPanelRef = useRef<HTMLDivElement>(null);
  const symbolPanelRef = useRef<HTMLDivElement>(null);

  const editing =
    editor && pattern && editor.documentId === documentId && editor.index < pattern.palette.length && editor.paletteLength === pattern.palette.length ? editor : null;
  // Adjusting state during render: once invalid, the editor stays closed even if an undo restores the palette size.
  if (editor && !editing) setEditor(null);

  const latest = useLatest({ editing, pattern });

  /** Commits a pending Full range draft as one undo step and clears the preview. Reads the latest state, so window listeners can call it. */
  function commitDraft() {
    const { editing: current, pattern: base } = latest.current;
    if (!current || !base || current.draftHex === null) return;
    onPreviewChange(null);
    setEditor((state) => (state ? { ...state, draftHex: null } : state));
    const rgb = hexToRgb(current.draftHex);
    if (!rgb.every((v, i) => v === base.palette[current.index].rgb[i])) onChange(editColorRgb(base, current.index, rgb));
  }

  function openColorEditor(index: number) {
    if (!pattern || editing?.index === index) return;
    setEditingSymbolIndex(null); // one panel under a row at a time
    if (editing) commitDraft();
    const color = pattern.palette[index];
    setEditor({
      index,
      initial: { rgb: color.rgb, name: color.name, source: color.source },
      mode: color.source?.brand ?? pattern.threadBrand ?? "full",
      query: "",
      draftHex: null,
      paletteLength: pattern.palette.length,
      documentId,
    });
  }

  /** Done, and a click outside the editor: keep the current color. */
  function finishEditing() {
    commitDraft();
    setEditor(null);
  }

  /** Cancel, and Escape: return the color to how it was when the editor opened, as one undo step. */
  function cancelEditing() {
    const { editing: current, pattern: base } = latest.current;
    onPreviewChange(null);
    if (current && base && !sameAppearance(base.palette[current.index], current.initial)) {
      onChange(restoreColor(base, current.index, current.initial));
    }
    setEditor(null);
  }

  useDismissOnOutsidePointer(editorPanelRef, editing !== null, { onOutsidePointer: finishEditing, onEscape: cancelEditing });
  // The symbol picker is the same kind of panel, so it dismisses the same way (Owner, 2026-09-18).
  useDismissOnOutsidePointer(symbolPanelRef, editingSymbolIndex !== null, {
    onOutsidePointer: () => setEditingSymbolIndex(null),
    onEscape: () => setEditingSymbolIndex(null),
  });

  function pickThread(code: string) {
    if (!editing || !pattern || editing.mode === "full") return;
    const current = pattern.palette[editing.index].source;
    // Re-picking the current thread is a no-op: it must not reset an RGB that differs from the table (Anchor carries DMC RGB).
    if (current?.brand === editing.mode && current.code === code) return;
    onChange(editColorToBrandColor(pattern, editing.index, code, editing.mode));
  }

  function changeDraft(hex: string) {
    if (!editing || !pattern) return;
    setEditor((state) => (state ? { ...state, draftHex: hex } : state));
    onPreviewChange({ base: pattern, next: editColorRgb(pattern, editing.index, hexToRgb(hex)) });
  }

  /** One undo step per drag: the draft commits when the pointer is released, wherever that happens. */
  function beginDraftGesture() {
    window.addEventListener("pointerup", commitDraft, { once: true });
  }

  function changeMode(mode: "full" | ThreadBrand) {
    commitDraft();
    setEditor((state) => (state ? { ...state, mode, query: "" } : state));
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

  function renderSymbolPicker() {
    if (editingSymbolIndex === null || !pattern) return null;
    return (
      <div ref={symbolPanelRef} role="dialog" aria-label={`Change symbol for ${pattern.palette[editingSymbolIndex].name}`} className={PANEL}>
        <p className="text-xs text-muted">Picking a symbol already used by another color swaps the two colors&apos; symbols.</p>
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
                  isCurrent ? "border-accent bg-raised" : holder ? "border-dashed border-line" : "border-line hover:bg-raised"
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
    );
  }

  function renderColorEditor() {
    if (!editing || !pattern) return null;
    const current = pattern.palette[editing.index];
    const brandMode = editing.mode === "full" ? null : editing.mode;
    return (
      <div ref={editorPanelRef} role="dialog" aria-label={`Edit color ${current.name}`} className={PANEL}>
        {pattern.threadBrand ? (
          <BrandNotice brand={pattern.threadBrand} />
        ) : (
          <SegmentedControl
            className="self-start"
            options={[{ value: "full" as const, label: "Full range" }, ...THREAD_BRAND_IDS.map((brand) => ({ value: brand, label: THREAD_BRANDS[brand].label }))]}
            value={editing.mode}
            onChange={changeMode}
          />
        )}

        {brandMode ? (
          <BrandColorPicker
            key={brandMode}
            brand={brandMode}
            query={editing.query}
            onQueryChange={(query) => setEditor((state) => (state ? { ...state, query } : state))}
            onPick={pickThread}
            currentCode={current.source?.brand === brandMode ? current.source.code : undefined}
            compareWith={current.rgb}
          />
        ) : (
          <div onPointerDown={beginDraftGesture} onKeyUp={commitDraft}>
            <HexColorPicker color={editing.draftHex ?? rgbToHex(current.rgb)} onChange={changeDraft} />
          </div>
        )}

        <p className="text-xs text-muted">Picks apply right away. Done keeps this color; Cancel returns it to how it was when you opened the editor.</p>
        <div className="flex gap-2">
          <PillButton variant="primary" size="md" onClick={finishEditing}>
            Done
          </PillButton>
          <PillButton size="md" onClick={cancelEditing}>
            Cancel
          </PillButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <span className="font-mono text-xs text-muted">{pattern ? threadsSummary(pattern, aidaCount) : "No threads yet"}</span>
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

      {pattern && pattern.palette.length === 0 && (
        <p className="px-4 pb-2 text-xs text-muted">
          <span data-testid="empty-palette-note">This chart has no colors yet. Press &quot;+ Add&quot; to pick the first one, then click it and paint on the picture.</span>
        </p>
      )}

      {pattern && (
        <ThreadRows
          pattern={pattern}
          aidaCount={aidaCount}
          activeColorIndex={activeColorIndex}
          // Selecting a colour to paint with and lighting it for Isolate are different intentions, so the row does
          // the first and the eye does the second. Neither disables the other (G-045 M4).
          onRowActivate={(index) => onActiveColorChange(activeColorIndex === index ? null : index)}
          onRowActivateBackground={onBackgroundColorChange}
          onEditColor={openColorEditor}
          onEditSymbol={(index) => {
            if (editing) finishEditing(); // the colour editor gives the row up to the symbol picker
            setEditingSymbolIndex(editingSymbolIndex === index ? null : index);
          }}
          editingSymbolIndex={editingSymbolIndex}
          editingColorIndex={editing?.index ?? null}
          onMergeColors={onMergeColors}
          dimmed={dimmed}
          swatchProps={{ [DISMISS_RETARGET_ATTRIBUTE]: "" }}
          symbolProps={{ [DISMISS_RETARGET_ATTRIBUTE]: "" }}
          renderLight={(color) => {
            const lit = litColorIndices.has(color.index);
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLit(color.index);
                }}
                aria-pressed={lit}
                aria-label={`Show only ${color.name}`}
                title={lit ? "Lit — shown at full strength while Isolate is on" : "Light this thread while Isolate is on"}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${lit ? "bg-accent/20 text-accent" : "text-faint hover:bg-raised hover:text-muted"}`}
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
              </button>
            );
          }}
          renderUnderRow={(color) => (editing?.index === color.index ? renderColorEditor() : editingSymbolIndex === color.index ? renderSymbolPicker() : null)}
          renameDraft={renameDraft}
          renamingIndex={renamingIndex}
          onRenameDraftChange={setRenameDraft}
          onStartRename={(index, name) => {
            setRenameDraft(name);
            setRenamingIndex(index);
          }}
          onCommitRename={commitRename}
          onCancelRename={() => setRenamingIndex(null)}
        />
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
    </div>
  );
}
