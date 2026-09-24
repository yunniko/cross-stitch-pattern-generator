"use client";
import { useState } from "react";
import { describeBlankSizeProblem } from "@/lib/editor/blank-pattern";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { STANDARD_AIDA_COUNTS, formatFinishedSize } from "@/lib/export/finished-size";
import { MAX_STITCHES, MIN_STITCHES } from "@/lib/types";
import { DISABLED_TEXT, PillButton } from "./ui";

/**
 * The first-run screen (direction 1b): the three ways into a chart, offered where the chart will appear rather than
 * only behind the rail's mark.
 *
 * The empty-grid card owns its own settings (D165): choosing it opens a panel inside the card rather than a strip
 * above the chart, so the size, the fabric and the finished measurement are read in the same place the choice is
 * made. Opening it replaces nothing, so the confirm that guards the one autosaved chart sits on Create.
 */

const CARD = "flex items-center gap-4 rounded-[10px] border px-[18px] py-4 text-left transition-colors";
const STEP =
  "border-line px-[9px] py-1.5 text-[13px] leading-none text-muted transition-colors enabled:hover:bg-raised enabled:hover:text-ink";

function PhotoIcon({ selected }: { selected: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-[22px] w-[22px] shrink-0 ${selected ? "text-accent" : "text-muted"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M4 18l5-5 4 4 3-3 4 4" />
    </svg>
  );
}

function GridIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-[22px] w-[22px] shrink-0 ${open ? "text-accent" : "text-muted"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
  );
}

/** Four stitches of a sprite: the import that keeps every pixel. */
function PixelArtIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="shrink-0 text-muted">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" fill="currentColor" opacity="0.85" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px] shrink-0 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h5l2 3h6A1.5 1.5 0 0 1 20 8.5v10A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5Z" />
    </svg>
  );
}

/** One labelled size stepper: the buttons step by a stitch, and the field still takes a typed number. */
function SizeField({
  label,
  value,
  onChange,
  down,
  up,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  down: string;
  up: string;
}) {
  const clamp = (n: number) => Math.min(MAX_STITCHES, Math.max(MIN_STITCHES, n));
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      {label}
      <span className="flex items-center overflow-hidden rounded-md border border-line">
        <button type="button" aria-label={down} onClick={() => onChange(clamp(value - 1))} className={`border-r ${STEP}`}>
          &minus;
        </button>
        <input
          type="number"
          min={MIN_STITCHES}
          max={MAX_STITCHES}
          value={value}
          aria-label={`${label} in stitches`}
          onChange={(e) => onChange(Math.round(Number(e.target.value)))}
          className="w-[52px] min-w-0 box-border border-none bg-transparent py-1.5 text-center font-mono text-xs text-ink"
        />
        <button type="button" aria-label={up} onClick={() => onChange(clamp(value + 1))} className={`border-l ${STEP}`}>
          +
        </button>
      </span>
    </label>
  );
}

export interface FirstRunProps {
  onChoosePhoto: () => void;
  onOpenPattern: () => void;
  /** Create the blank chart. The caller decides whether replacing an open chart needs confirming first. */
  onCreateBlank: (width: number, height: number) => void;
  /** Opens an image whose pixels are already stitches (G-049). */
  onImportPixelArt: () => void;
  options: WorkspaceOptions;
  onAidaCountChange: (count: number) => void;
  /** A photo is still decoding, so choosing another would be ignored. */
  busy: boolean;
}

export function FirstRun({
  onChoosePhoto,
  onOpenPattern,
  onCreateBlank,
  onImportPixelArt,
  options,
  onAidaCountChange,
  busy,
}: FirstRunProps) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(100);
  const problem = describeBlankSizeProblem(width, height);

  return (
    <div className="flex w-[620px] max-w-full flex-col gap-[26px]">
      <h2 className="m-0 text-[32px] leading-[38px] font-medium tracking-[-0.02em] text-ink">A photo in, a stitchable chart out.</h2>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onChoosePhoto();
          }}
          disabled={busy}
          className={`${CARD} text-ink ${DISABLED_TEXT} ${
            open ? "border-line bg-raised enabled:hover:bg-sunken" : "border-accent bg-accent/[.08] enabled:hover:bg-accent/[.14]"
          }`}
        >
          <PhotoIcon selected={!open} />
          <span className="flex-1">
            <span className="block text-[15px] font-medium">Choose a photo</span>
            <span className="block text-xs leading-[17px] text-muted">
              JPEG, PNG or WebP · uploaded to this site&apos;s server to be charted
            </span>
          </span>
        </button>

        <div className={`flex flex-col rounded-[10px] border ${open ? "border-accent bg-accent/[.06]" : "border-line bg-raised"}`}>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            className={`${CARD} rounded-[10px] border-transparent bg-transparent text-ink ${open ? "" : "hover:bg-sunken"}`}
          >
            <GridIcon open={open} />
            <span className="flex-1">
              <span className="block text-[15px] font-medium">Start an empty grid</span>
              <span className="block text-xs leading-[17px] text-muted">No photo behind it — draw stitch by stitch</span>
            </span>
          </button>

          {open && (
            <div className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3.5">
              <SizeField label="Width" value={width} onChange={setWidth} down="Narrower" up="Wider" />
              <SizeField label="Height" value={height} onChange={setHeight} down="Shorter" up="Taller" />
              <label className="flex items-center gap-2 text-xs text-muted">
                Fabric
                <select
                  value={options.aidaCount}
                  onChange={(e) => onAidaCountChange(Number(e.target.value))}
                  aria-label="Fabric count"
                  className="rounded-md border border-line bg-sunken px-2 py-[5px] text-xs text-ink"
                >
                  {STANDARD_AIDA_COUNTS.map((count) => (
                    <option key={count} value={count}>
                      {count}-count
                    </option>
                  ))}
                </select>
              </label>
              <PillButton
                variant="primary"
                size="md"
                className="ml-auto"
                onClick={() => onCreateBlank(width, height)}
                disabled={problem !== null}
              >
                Create
              </PillButton>
              <p className="m-0 w-full font-mono text-[11px] leading-4 text-muted" data-testid="new-chart-size">
                {problem === null
                  ? `${width} × ${height} stitches · ≈ ${formatFinishedSize(width, height, options.aidaCount, options.sizeUnit)} finished`
                  : "Enter a size to see the finished fabric size"}
              </p>
              {problem && <p className="m-0 w-full text-xs text-red-300">{problem}</p>}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onImportPixelArt();
          }}
          className={`${CARD} border-line bg-raised text-ink hover:bg-sunken`}
        >
          <PixelArtIcon />
          <span className="flex-1">
            <span className="block text-[15px] font-medium">Import pixel art</span>
            <span className="block text-xs leading-[17px] text-muted">
              PNG, GIF or WebP · one pixel becomes one stitch, in its own colour
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onOpenPattern();
          }}
          className={`${CARD} border-line bg-raised text-ink hover:bg-sunken`}
        >
          <FolderIcon />
          <span className="flex-1">
            <span className="block text-[15px] font-medium">Open a saved pattern</span>
            <span className="block text-xs leading-[17px] text-muted">.json, .cspzip, or an .oxs chart from another program</span>
          </span>
        </button>
      </div>
    </div>
  );
}
