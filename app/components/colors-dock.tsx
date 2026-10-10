import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { hexToRgb, luminance, rgbToHex } from "@/lib/color/color";
import { swatchComparisonParts } from "@/lib/color/swatch-comparison";
import { SYMBOL_SET } from "@/lib/color/symbols";
import {
  addBrandColor,
  addColor,
  editColorRgb,
  editColorToBrandColor,
  renameColor,
  restoreColor,
  setColorSymbol,
  setColorThread,
} from "@/lib/editor/pattern-edit";
import {
  THREAD_BRANDS,
  THREAD_BRAND_IDS,
  formatThreadName,
  isLoadedSystem,
  type ThreadBrand,
  type ThreadColor,
} from "@/lib/threads/thread-brands";
import { MAX_COLORS, type PaletteColor, type RGB, type StitchPattern } from "@/lib/types";
import { DISMISS_RETARGET_ATTRIBUTE, useDismissOnOutsidePointer } from "../hooks/use-dismiss-on-outside-pointer";
import { useLatest } from "../hooks/use-latest";
import { ThreadRows, threadsSummary } from "./threads-pane";
import { ThreadFields } from "./thread-fields";
import { PaletteLibrary } from "./palette-library";
import { appendPalette, missingColors } from "@/lib/editor/palette-load";
import { setFromPattern, type PaletteSet } from "@/lib/editor/palette-set";
import { PillButton, SegmentedControl } from "./ui";
import { SkinIcon } from "../skin/skin";
import { useGatedOptions } from "../features/features-context";
import { brandFeature } from "../features/registry";

const PANEL = "flex flex-col gap-2 rounded-lg border border-line p-3";
const COMPARE_HINT = "Hover or focus a swatch to compare it with the current color on screen.";

/** A brand's thread line filtered by code or name substring, case-insensitive. */
function filterBrandColors(query: string, brand: ThreadBrand): readonly ThreadColor[] {
  const q = query.trim().toLowerCase();
  const colors = THREAD_BRANDS[brand].colors;
  if (!q) return colors;
  return colors.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
}

/** Anchor's colours are derived, and says so wherever its threads are chosen (G-029 AC4). */
function DerivationNote({ brand }: { brand: ThreadBrand }) {
  const { label, derivationNote } = THREAD_BRANDS[brand];
  return derivationNote ? <p className="text-xs text-muted">{`${label} colors are ${derivationNote}.`}</p> : null;
}

function countOf(n: number): string {
  return n === 1 ? "1 colour" : `${n} colours`;
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
  /** Threads already chosen elsewhere (a palette being set up, G-087): marked like the current one, without moving the grid. */
  chosenCodes?: ReadonlySet<string>;
}

/** Searchable swatch grid of one brand's threads, shared by the color editor and "+ Add" (G-016, G-017, G-033). */
export function BrandColorPicker({ brand, query, onQueryChange, onPick, currentCode, compareWith, chosenCodes }: BrandColorPickerProps) {
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
          const isCurrent = (currentCode !== undefined && thread.code === currentCode) || (chosenCodes?.has(thread.code) ?? false);
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
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center text-xs font-bold"
                  style={{ color: luminance(thread.rgb) > 140 ? "#000000" : "#ffffff" }}
                >
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

function sameAppearance(
  color: Pick<PaletteColor, "rgb" | "name" | "source">,
  other: Pick<PaletteColor, "rgb" | "name" | "source">
): boolean {
  return (
    color.rgb.every((v, i) => v === other.rgb[i]) &&
    color.name === other.name &&
    color.source?.brand === other.source?.brand &&
    color.source?.code === other.source?.code
  );
}

export interface ColorsDockProps {
  /** The active layer's view (G-130): what the editors change. */
  pattern: StitchPattern | null;
  /** The chart as shown, every visible layer's top stitch: what the list counts. The palette is shared, so the rows are the same. */
  counted?: StitchPattern | null;
  /** Dimmed while a floating selection is in hand, as 1b draws its select state. */
  dimmed?: boolean;
  activeColorIndex: number | null;
  onActiveColorChange: (index: number | null) => void;
  /** A right click on a thread loads the background square, without changing which square is active (G-064). */
  onBackgroundColorChange: (index: number) => void;
  /** The threads lit for Isolate. Lighting one is independent of which colour is selected for painting. */
  litColorIndices: ReadonlySet<number>;
  onToggleLit: (index: number) => void;
  /** The threads whose backstitch is lit; its own set, so an outline lights without its fill. */
  litBackstitchIndices: ReadonlySet<number>;
  onToggleLitBackstitch: (index: number) => void;
  aidaCount: number;
  /** Pushes an edited pattern as an undoable step. */
  onChange: (next: StitchPattern) => void;
  /** Shows (or clears) a draft of `base` on the chart without recording it. */
  onPreviewChange: (preview: { base: StitchPattern; next: StitchPattern } | null) => void;
  /** Changes when the palette is replaced wholesale; an open color editor closes. */
  documentId: number;
  onMergeColors: (sourceIndex: number, targetIndex: number) => void;
  /** A loaded palette replaces the chart's, every layer remapped onto it (G-131). */
  onReplacePalette: (set: PaletteSet) => void;
}

/**
 * The right-hand dock: navigator, legend (select, highlight, drag to merge or fill, rename, re-symbol) and the color
 * editor and "+ Add" panels. The color editor opens under its row on the color's own swatch; picks apply at once and
 * the editor stays open until Done, Cancel, Escape or a click outside it (G-033).
 */
export function ColorsDock({
  pattern,
  counted,
  dimmed = false,
  activeColorIndex,
  onActiveColorChange,
  onBackgroundColorChange,
  litColorIndices,
  onToggleLit,
  litBackstitchIndices,
  onToggleLitBackstitch,
  aidaCount,
  onChange,
  onPreviewChange,
  documentId,
  onMergeColors,
  onReplacePalette,
}: ColorsDockProps) {
  const [editor, setEditor] = useState<ColorEditorState | null>(null);
  const [addingColor, setAddingColor] = useState(false);
  const [addColorDraftHex, setAddColorDraftHex] = useState("#808080");
  const [addBrandQuery, setAddBrandQuery] = useState("");
  const [addMode, setAddMode] = useState<"full" | ThreadBrand>("full");
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingSymbolIndex, setEditingSymbolIndex] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ set: PaletteSet; name: string } | null>(null);
  const [paletteNote, setPaletteNote] = useState<string | null>(null);
  // Under the feature switches (G-102): each brand is a feature.
  const modeOptions = useGatedOptions(
    [
      { value: "full" as const, label: "Full range" },
      ...THREAD_BRAND_IDS.map((brand) => ({ value: brand, label: THREAD_BRANDS[brand].label })),
    ],
    brandFeature
  );
  const editorPanelRef = useRef<HTMLDivElement>(null);
  const symbolPanelRef = useRef<HTMLDivElement>(null);

  const editing =
    editor &&
    pattern &&
    editor.documentId === documentId &&
    editor.index < pattern.palette.length &&
    editor.paletteLength === pattern.palette.length
      ? editor
      : null;
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
      // A system not loaded here has no list to pick from: its colour opens in the common picker (G-132).
      mode: color.source ? (isLoadedSystem(color.source.brand) ? color.source.brand : "full") : (pattern.threadBrand ?? "full"),
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
    if (!pattern || addMode === "full") return;
    onChange(addBrandColor(pattern, code, addMode));
    setAddingColor(false);
    setAddBrandQuery("");
  }

  /** Append (G-131): the loaded colours the chart lacks, at the end of its palette, as one undo step. */
  function appendLoaded() {
    if (!pattern || !loaded) return;
    const result = appendPalette(pattern, loaded.set);
    if (result.added > 0) onChange(result.pattern);
    setPaletteNote(
      `Added ${countOf(result.added)} from “${loaded.name}”.` +
        (result.skipped > 0 ? ` ${countOf(result.skipped)} did not fit: a chart holds at most ${MAX_COLORS} colours.` : "")
    );
    setLoaded(null);
  }

  /** Replace (G-131, D397): the loaded palette becomes the chart's, each chart colour mapped onto it. */
  function replaceWithLoaded() {
    if (!loaded) return;
    onReplacePalette(loaded.set);
    setPaletteNote(`The chart now uses “${loaded.name}”: ${countOf(loaded.set.colors.length)}.`);
    setLoaded(null);
  }

  function renderPaletteBlock() {
    if (!paletteOpen || !pattern) return null;
    const missing = loaded ? missingColors(pattern, loaded.set).length : 0;
    return (
      <div className="mx-4 mb-2 flex flex-col gap-1.5 rounded-md border border-line p-2" data-testid="chart-palette">
        <PaletteLibrary
          palette={setFromPattern(pattern)}
          onNote={setPaletteNote}
          onLoad={(set, name) => {
            setLoaded(set.colors.length > 0 ? { set, name } : null);
            setPaletteNote(set.colors.length > 0 ? null : `“${name}” holds no colours.`);
          }}
        />
        {loaded && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-1.5" data-testid="palette-load-choice">
            <p className="text-[11px] leading-4 text-muted">
              “{loaded.name}”: {countOf(loaded.set.colors.length)},{" "}
              {missing === 0 ? "all of them in this chart already" : `${missing} not in this chart`}. Append adds those; Replace makes the
              chart use this palette, each colour taking the same thread or else the nearest.
            </p>
            <div className="flex gap-1.5">
              <PillButton size="xs" disabled={missing === 0} onClick={appendLoaded}>
                Append
              </PillButton>
              <PillButton size="xs" onClick={replaceWithLoaded}>
                Replace
              </PillButton>
              <PillButton size="xs" onClick={() => setLoaded(null)}>
                Cancel
              </PillButton>
            </div>
          </div>
        )}
        {paletteNote && (
          <p className="text-[11px] leading-4 text-muted" role="status" data-testid="chart-palette-note">
            {paletteNote}
          </p>
        )}
      </div>
    );
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
      <div
        ref={symbolPanelRef}
        role="dialog"
        aria-label={`Change symbol for ${pattern.palette[editingSymbolIndex].name}`}
        className={PANEL}
      >
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
        {/* Any system's thread may be any colour of any chart (G-131): the chart's own system only opens the editor on it. */}
        <SegmentedControl className="self-start" options={modeOptions} value={editing.mode} onChange={changeMode} />
        {brandMode && <DerivationNote brand={brandMode} />}

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

        <ThreadFields
          source={current.source}
          onCommit={(thread) => {
            const next = setColorThread(pattern, editing.index, thread);
            if (next !== pattern) onChange(next);
          }}
        />

        <p className="text-xs text-muted">
          Picks apply right away. Done keeps this color; Cancel returns it to how it was when you opened the editor.
        </p>
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
        <span className="font-mono text-xs text-muted">{pattern ? threadsSummary(counted ?? pattern, aidaCount) : "No threads yet"}</span>
        <div className="flex gap-1.5">
          <PillButton
            size="xs"
            aria-expanded={paletteOpen}
            disabled={!pattern}
            onClick={() => {
              setPaletteOpen(!paletteOpen);
              setLoaded(null);
              setPaletteNote(null);
            }}
          >
            Palette
          </PillButton>
          <PillButton
            size="xs"
            onClick={() => {
              setAddColorDraftHex("#808080");
              setAddBrandQuery("");
              setAddMode(
                modeOptions.some((option) => option.value === pattern?.threadBrand && !option.disabled) ? pattern!.threadBrand! : "full"
              );
              setAddingColor(true);
            }}
            disabled={!pattern}
          >
            + Add
          </PillButton>
        </div>
      </div>
      {renderPaletteBlock()}

      {pattern && pattern.palette.length === 0 && (
        <p className="px-4 pb-2 text-xs text-muted">
          <span data-testid="empty-palette-note">
            This chart has no colors yet. Press &quot;+ Add&quot; to pick the first one, then click it and paint on the picture.
          </span>
        </p>
      )}

      {pattern && (
        <ThreadRows
          pattern={counted ?? pattern}
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
          renderLight={(color) => (
            <ThreadLight
              lit={litColorIndices.has(color.index)}
              label={`Show only ${color.name}`}
              title={
                litColorIndices.has(color.index)
                  ? "Lit — these stitches stay at full strength while Isolate is on"
                  : "Light this thread's stitches while Isolate is on"
              }
              onToggle={() => onToggleLit(color.index)}
            />
          )}
          renderBackstitchLight={(color) => (
            <ThreadLight
              lit={litBackstitchIndices.has(color.index)}
              label={`Show only ${color.name} backstitch`}
              title={
                litBackstitchIndices.has(color.index)
                  ? "Lit — these lines stay at full strength while Isolate is on"
                  : "Light this thread's backstitch while Isolate is on"
              }
              onToggle={() => onToggleLitBackstitch(color.index)}
            />
          )}
          renderUnderRow={(color) =>
            editing?.index === color.index ? renderColorEditor() : editingSymbolIndex === color.index ? renderSymbolPicker() : null
          }
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

      {addingColor && (
        <div className={PANEL} data-testid="add-color-panel">
          <SegmentedControl
            className="self-start"
            options={modeOptions}
            value={addMode}
            onChange={(mode) => {
              setAddMode(mode);
              setAddBrandQuery("");
            }}
          />
          {addMode !== "full" ? (
            <>
              <DerivationNote brand={addMode} />
              <BrandColorPicker
                key={addMode}
                brand={addMode}
                query={addBrandQuery}
                onQueryChange={setAddBrandQuery}
                onPick={commitAddBrandColor}
              />
              <PillButton size="md" onClick={() => setAddingColor(false)} className="self-start">
                Cancel
              </PillButton>
            </>
          ) : (
            <>
              <HexColorPicker color={addColorDraftHex} onChange={setAddColorDraftHex} />
              <div className="flex gap-2">
                <PillButton variant="primary" size="md" onClick={commitAddColor}>
                  Add
                </PillButton>
                <PillButton size="md" onClick={() => setAddingColor(false)}>
                  Cancel
                </PillButton>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The eye that lights one layer of one thread while Isolate is on.
 *
 * Each section of the list lights its own layer (Owner, 2026-09-25): the cross row lights that thread's
 * stitches, the backstitch row lights its lines. A thread used for both has an eye in each, so “show me
 * this outline” does not bring its fill up with it.
 */
function ThreadLight({ lit, label, title, onToggle }: { lit: boolean; label: string; title: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={lit}
      aria-label={label}
      title={title}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${lit ? "bg-accent/20 text-accent" : "text-faint hover:bg-raised hover:text-muted"}`}
    >
      <SkinIcon name="eye" className="h-3.5 w-3.5" />
    </button>
  );
}
