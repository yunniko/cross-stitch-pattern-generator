"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { rgbToHex } from "@/lib/color/color";
import { createCanvas } from "@/lib/export/canvas-backend";
import { letteringWarnings } from "@/lib/editor/lettering-warnings";
import { bestSize, bundledFamilies, bundledFont, pixelSizeHint } from "@/lib/editor/bundled-fonts";
import { familyByName, fallbackFamilies, listFonts, loadFace, type FontListing } from "@/lib/editor/local-fonts";
import {
  inkCount,
  letteringCells,
  MAX_SIZE,
  DEFAULT_WEIGHT,
  MAX_TEXT_LENGTH,
  MIN_SIZE,
  type LetteringBitmap,
  type TextFace,
} from "@/lib/editor/text-raster";
import type { StitchPattern } from "@/lib/types";
import type { ReadyLettering } from "../tools/text";
import type { ChangeTextSetting, TextSettings } from "../tools/types";
import { PillButton } from "./ui";

/**
 * The Text tool's tab (G-081; the tool's own tab since G-095): one line of lettering from a font on the Owner's own computer, shown cell by cell before it goes on
 * the chart. The fonts are read, loaded and drawn in this browser and go nowhere else; what is added to the chart is stitches.
 *
 * The preview is the lettering at one pixel to one cell, each stitch a square in the chosen thread on the canvas colour, so
 * what is seen is what will be stitched. The warnings under it come from the legibility review.
 */

const GROUP_LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted";
const FIELD = "w-full rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-[13px] text-ink";
const STEP = "h-7 w-7 rounded-md border border-line text-sm text-ink hover:bg-sunken disabled:opacity-40";
const WEIGHT_STEP = 5;
const PREVIEW_WIDTH = 316;
const PREVIEW_HEIGHT = 168;
const MAX_CELL_PX = 14;

export interface TextPaneProps {
  pattern: StitchPattern | null;
  /** The lettering's settings and the canvas colour the preview sits on. */
  settings: TextSettings & { canvasColor: string };
  onChange: ChangeTextSetting;
  /** The thread in the brush's hand, which the lettering starts in. */
  activeColorIndex: number | null;
  /**
   * The text and the thread picked for it are kept by the workspace: the tab is gone from the page while another is open, and
   * what was typed must not go with it.
   */
  text: string;
  onTextChange: (text: string) => void;
  pickedColor: number | null;
  onPickColor: (index: number) => void;
  /** Stitched and Photo-only are for looking: nothing is added to the chart there. */
  viewOnly?: boolean;
  /** Puts the lettering on the chart as a piece in hand; absent, Add is not offered yet. */
  onAdd?: (lettering: LetteringBitmap, paletteIndex: number) => void;
  /** Where the tab leaves the lettering it could add now, for a press on the chart to put down; null while it could add none. */
  readyRef?: RefObject<ReadyLettering | null>;
}

/** How big one stitch is drawn in the preview: as large as fits, a whole number of pixels. */
export function previewScale(width: number, height: number): number {
  return Math.max(1, Math.min(MAX_CELL_PX, Math.floor(PREVIEW_WIDTH / width), Math.floor(PREVIEW_HEIGHT / height)));
}

export function TextPane({
  pattern,
  settings: options,
  onChange,
  activeColorIndex,
  text,
  onTextChange,
  pickedColor: picked,
  onPickColor,
  viewOnly = false,
  onAdd,
  readyRef,
}: TextPaneProps) {
  const [listing, setListing] = useState<FontListing | null>(null);
  const [asking, setAsking] = useState(false);
  const [loaded, setLoaded] = useState<{ key: string; face: TextFace } | null>(null);
  const [sizeDraft, setSizeDraft] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const families = useMemo(() => {
    const base = [...bundledFamilies(), ...(listing?.families ?? fallbackFamilies())];
    return base.some((f) => f.family === options.textFamily) ? base : [...base, familyByName(options.textFamily)];
  }, [listing, options.textFamily]);
  const family = families.find((f) => f.family === options.textFamily) ?? families[0];
  const chosen = family.faces.find((f) => f.style === options.textStyle) ?? family.faces[0];

  // The face to draw: read and given to the browser, here, under a private name. A face loaded for another choice is ignored.
  const chosenKey = `${chosen.family}|${chosen.postscriptName}|${chosen.style}`;
  useEffect(() => {
    let cancelled = false;
    loadFace(chosen)
      .then((face) => !cancelled && setLoaded({ key: chosenKey, face }))
      .catch(
        () =>
          !cancelled &&
          setLoaded({
            key: chosenKey,
            face: { family: chosen.family, weight: chosen.weight, style: chosen.slant, stretch: chosen.stretch },
          })
      );
    return () => {
      cancelled = true;
    };
  }, [chosen, chosenKey]);
  const face = loaded && loaded.key === chosenKey ? loaded.face : null;

  const palette = useMemo(() => pattern?.palette ?? [], [pattern]);
  const colourIndex =
    picked !== null && picked < palette.length
      ? picked
      : activeColorIndex !== null && activeColorIndex < palette.length
        ? activeColorIndex
        : palette.length > 0
          ? 0
          : null;

  const lettering = useMemo((): { bitmap: LetteringBitmap | null; error: string | null } => {
    if (!face || text.trim().length === 0) return { bitmap: null, error: null };
    try {
      return {
        bitmap: letteringCells([text], { face, size: options.textSize, weight: options.textWeight }, (w, h) => createCanvas(w, h).ctx),
        error: null,
      };
    } catch (error) {
      return { bitmap: null, error: error instanceof Error ? error.message : "That text could not be drawn." };
    }
  }, [face, text, options.textSize, options.textWeight]);
  const bitmap = lettering.bitmap;
  const scale = bitmap ? previewScale(bitmap.width, bitmap.height) : 1;
  const ink = bitmap ? inkCount(bitmap) : 0;

  // The preview: one square per stitch, in the thread's colour on the canvas colour.
  useEffect(() => {
    const canvas = previewRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !bitmap) return;
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;
    ctx.fillStyle = options.canvasColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colourIndex !== null ? rgbToHex(palette[colourIndex].rgb) : "#000000";
    // A hairline between stitches once they are big enough to show it.
    const gap = scale >= 6 ? 1 : 0;
    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        if (bitmap.ink[y * bitmap.width + x]) ctx.fillRect(x * scale, y * scale, scale - gap, scale - gap);
      }
    }
  }, [bitmap, scale, colourIndex, palette, options.canvasColor]);

  const warnings = letteringWarnings(text, options.textSize, options.textWeight);
  const tooLarge = !!bitmap && !!pattern && (bitmap.width > pattern.width || bitmap.height > pattern.height);
  const problem = !pattern
    ? "Open a chart first."
    : viewOnly
      ? "Text is added in Color or B&W, with the pattern at least 5 % visible."
      : palette.length === 0
        ? "This chart has no threads yet. Add one in the Threads tab."
        : text.trim().length === 0
          ? "Type some text."
          : lettering.error
            ? lettering.error
            : !bitmap
              ? "That text has nothing to draw."
              : tooLarge
                ? `The text is ${bitmap.width} × ${bitmap.height} stitches; this chart is ${pattern.width} × ${pattern.height}.`
                : null;

  // What a press on the chart would put down: the lettering exactly as Add would add it, or nothing.
  useEffect(() => {
    if (!readyRef) return;
    readyRef.current = bitmap && colourIndex !== null && problem === null ? { bitmap, colour: colourIndex } : null;
  }, [readyRef, bitmap, colourIndex, problem]);

  async function useMyFonts() {
    setAsking(true);
    setListing(await listFonts());
    setAsking(false);
  }

  function commitSize(raw: string) {
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && raw.trim() !== "") onChange("textSize", Math.max(MIN_SIZE, Math.min(MAX_SIZE, n)));
    setSizeDraft(null);
  }

  const fallback = listing === null || listing.kind === "fallback";
  const pixelHint = pixelSizeHint(bundledFont(options.textFamily), options.textSize);
  const best = bestSize(bundledFont(options.textFamily));

  return (
    <div className="flex flex-col gap-5 p-4">
      <section className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>Font</span>
        {listing === null && (
          <PillButton
            size="md"
            onClick={useMyFonts}
            disabled={asking}
            title="Your browser asks first. The fonts are read here and never leave this computer."
          >
            {asking ? "Reading your fonts…" : "Use the fonts on my computer"}
          </PillButton>
        )}
        {listing?.kind === "fallback" && (
          <p role="status" data-testid="fonts-fallback" className="text-xs leading-4 text-muted">
            {listing.message}
          </p>
        )}
        <select
          aria-label="Font"
          value={family.family}
          onChange={(e) => {
            onChange("textFamily", e.target.value);
            onChange("textStyle", "Regular");
          }}
          className={FIELD}
        >
          {(["pixel", "outline"] as const).map((group) => (
            <optgroup key={group} label={group === "pixel" ? "Pixel fonts, bundled" : "Other fonts, bundled"}>
              {families
                .filter((f) => f.group === group)
                .map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.label ?? f.family}
                  </option>
                ))}
            </optgroup>
          ))}
          <optgroup label={listing?.kind === "local" ? "On this computer" : "Generic families"}>
            {families
              .filter((f) => !f.group)
              .map((f) => (
                <option key={f.family} value={f.family}>
                  {f.label ?? f.family}
                </option>
              ))}
          </optgroup>
        </select>
        {pixelHint && (
          <p data-testid="pixel-hint" className="text-xs leading-4 text-muted">
            A pixel font: its letters come out cleanest at {pixelHint.clean.join(" or ")} stitches.
          </p>
        )}
        {fallback && (
          <input
            type="text"
            aria-label="Font name"
            placeholder="or type the name of an installed font"
            maxLength={100}
            defaultValue=""
            onChange={(e) => {
              const name = e.target.value.trim();
              if (name) {
                onChange("textFamily", name);
                onChange("textStyle", "Regular");
              }
            }}
            className={FIELD}
          />
        )}
        <select aria-label="Font type" value={chosen.style} onChange={(e) => onChange("textStyle", e.target.value)} className={FIELD}>
          {family.faces.map((f) => (
            <option key={f.postscriptName || f.style} value={f.style}>
              {f.style}
            </option>
          ))}
        </select>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="flex items-center gap-2">
            <span>Size, in stitches</span>
            <button
              type="button"
              aria-label="Reset size"
              title={`Reset to ${best}, the size this font reads best at`}
              disabled={options.textSize === best}
              onClick={() => onChange("textSize", best)}
              className="rounded-md border border-line px-2 py-0.5 text-xs text-ink hover:bg-sunken disabled:opacity-40"
            >
              Reset
            </button>
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Smaller size"
              disabled={options.textSize <= MIN_SIZE}
              onClick={() => onChange("textSize", Math.max(MIN_SIZE, options.textSize - 1))}
              className={STEP}
            >
              −
            </button>
            <input
              type="number"
              aria-label="Font size in stitches"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={sizeDraft ?? options.textSize}
              onChange={(e) => {
                setSizeDraft(e.target.value);
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE) onChange("textSize", n);
              }}
              onBlur={(e) => commitSize(e.target.value)}
              className="w-16 rounded-md border border-line bg-sunken px-2 py-1 text-center font-mono text-xs text-ink"
            />
            <button
              type="button"
              aria-label="Larger size"
              disabled={options.textSize >= MAX_SIZE}
              onClick={() => onChange("textSize", Math.min(MAX_SIZE, options.textSize + 1))}
              className={STEP}
            >
              +
            </button>
          </span>
        </div>
        <div className="flex flex-col gap-1.5" title="Lighter letters cut at a higher coverage, heavier ones at a lower.">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span>
              Weight{" "}
              <output data-testid="weight-value" className="ml-1 font-mono text-xs text-muted">
                {options.textWeight}
              </output>
            </span>
            <button
              type="button"
              aria-label="Reset weight"
              disabled={options.textWeight === DEFAULT_WEIGHT}
              onClick={() => onChange("textWeight", DEFAULT_WEIGHT)}
              className="rounded-md border border-line px-2 py-0.5 text-xs text-ink hover:bg-sunken disabled:opacity-40"
            >
              Reset
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Lighter"
              disabled={options.textWeight <= 0}
              onClick={() => onChange("textWeight", Math.max(0, options.textWeight - WEIGHT_STEP))}
              className={STEP}
            >
              −
            </button>
            <input
              type="range"
              aria-label="Weight"
              min={0}
              max={100}
              value={options.textWeight}
              onChange={(e) => onChange("textWeight", Number(e.target.value))}
              className="min-w-0 flex-1 accent-[var(--at-accent)]"
            />
            <button
              type="button"
              aria-label="Heavier"
              disabled={options.textWeight >= 100}
              onClick={() => onChange("textWeight", Math.min(100, options.textWeight + WEIGHT_STEP))}
              className={STEP}
            >
              +
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>Colour</span>
        {palette.length === 0 ? (
          <p className="text-xs text-muted">The chart has no threads yet.</p>
        ) : (
          <div role="radiogroup" aria-label="Text colour" className="flex flex-wrap gap-1.5">
            {palette.map((color, index) => (
              <button
                key={color.index}
                type="button"
                role="radio"
                aria-checked={index === colourIndex}
                aria-label={`Thread ${color.symbol} ${color.name}`}
                title={`${color.symbol} ${color.name}`}
                onClick={() => onPickColor(index)}
                style={{ backgroundColor: rgbToHex(color.rgb) }}
                className={`h-6 w-6 rounded-md border ${index === colourIndex ? "border-accent outline outline-2 outline-offset-1 outline-[var(--at-accent)]" : "border-line"}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <label className="flex flex-col gap-1.5 text-xs text-muted">
          Text
          <input
            type="text"
            aria-label="Text"
            value={text}
            maxLength={MAX_TEXT_LENGTH}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="One line of text"
            className={FIELD}
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>Preview, one square a stitch</span>
        <div className="max-h-[200px] overflow-auto rounded-lg border border-line bg-sunken p-2">
          {bitmap ? (
            <canvas
              ref={previewRef}
              data-testid="text-preview"
              data-width={bitmap.width}
              data-height={bitmap.height}
              data-ink={ink}
              data-scale={scale}
              role="img"
              aria-label={`Lettering, ${bitmap.width} by ${bitmap.height} stitches`}
              className="block"
            />
          ) : (
            <p className="py-6 text-center text-xs text-muted">{text.trim() ? "Nothing to show yet." : "Your text appears here."}</p>
          )}
        </div>
        {bitmap && (
          <p className="font-mono text-xs text-muted" data-testid="text-size">
            {bitmap.width} × {bitmap.height} stitches, {ink} stitched
          </p>
        )}
        {warnings.length > 0 && (
          <ul data-testid="text-warnings" className="flex flex-col gap-1 text-xs leading-4 text-warning">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-3.5">
        <PillButton
          variant="primary"
          size="md"
          disabled={!onAdd || problem !== null}
          onClick={() => bitmap && colourIndex !== null && onAdd?.(bitmap, colourIndex)}
        >
          Add
        </PillButton>
        {problem && <p className="text-xs leading-4 text-muted">{problem}</p>}
      </section>
    </div>
  );
}
