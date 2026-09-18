"use client";
import { DISABLED_TEXT } from "./ui";

/**
 * The first-run screen (direction 1b): the three ways into a chart, offered where the chart will appear rather than
 * only behind the rail's mark. Each card triggers exactly what the rail's own menu item triggers, so there is one
 * code path per action and the two cannot drift apart.
 */

const CARD = "flex items-center gap-4 rounded-[10px] border px-[18px] py-4 text-left transition-colors";

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" fill="none" stroke="var(--at-accent)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M4 18l5-5 4 4 3-3 4 4" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h5l2 3h6A1.5 1.5 0 0 1 20 8.5v10A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5Z" />
    </svg>
  );
}

export interface FirstRunProps {
  onChoosePhoto: () => void;
  onNewBlankChart: () => void;
  onOpenPattern: () => void;
  /** A photo is still decoding, so choosing another would be ignored. */
  busy: boolean;
}

export function FirstRun({ onChoosePhoto, onNewBlankChart, onOpenPattern, busy }: FirstRunProps) {
  return (
    <div className="flex w-[620px] max-w-full flex-col gap-[26px]">
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-[32px] leading-[38px] font-medium tracking-[-0.02em] text-ink">A photo in, a stitchable chart out.</h2>
        <p className="m-0 text-sm leading-5 text-muted">Three steps, all reversible. Pick where you want to start.</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onChoosePhoto}
          disabled={busy}
          className={`${CARD} border-accent bg-accent/[.08] text-ink enabled:hover:bg-accent/[.14] ${DISABLED_TEXT}`}
        >
          <PhotoIcon />
          <span className="flex-1">
            <span className="block text-[15px] font-medium">Choose a photo</span>
            <span className="block text-xs leading-[17px] text-muted">JPEG, PNG or WebP · uploaded to this site&apos;s server to be charted</span>
          </span>
          <span className="font-mono text-xs text-accent">01</span>
        </button>

        <button type="button" onClick={onNewBlankChart} className={`${CARD} border-line bg-raised text-ink hover:bg-sunken`}>
          <GridIcon />
          <span className="flex-1">
            <span className="block text-[15px] font-medium">Start an empty grid</span>
            <span className="block text-xs leading-[17px] text-muted">Set width and height in stitches, then draw</span>
          </span>
        </button>

        <button type="button" onClick={onOpenPattern} className={`${CARD} border-line bg-raised text-ink hover:bg-sunken`}>
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
